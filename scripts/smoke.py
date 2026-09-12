"""End-to-end smoke test, no browser: act as the driver app (WattWise) over REST and watch /ws the way the
ops dashboard does. Exit 0 = the whole flow works.

    uvicorn noonshift.api:app --port 8000      # in another shell (SIM_SPEED=60 is plenty)
    python scripts/smoke.py [http://127.0.0.1:8000]
"""
import asyncio
import json
import sys
import urllib.request
from datetime import datetime, timedelta

import websockets

API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
WS = API.replace("http", "ws", 1) + "/ws"


def http(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def frames_of(frames, kind, **match):
    return [f for f in frames if f["type"] == kind and all(f.get(k) == v or f.get("detail", {}).get(k) == v for k, v in match.items())]


async def main():
    frames = []
    async with websockets.connect(WS) as ws:
        async def pump():
            async for m in ws:
                frames.append(json.loads(m))
        task = asyncio.create_task(pump())

        # 1. ops side: meter frames with a sim clock; status carries feed/block/sim_time
        await asyncio.sleep(3)
        meters = frames_of(frames, "meter")
        assert meters, "no meter frames on /ws"
        sim_now = datetime.fromisoformat(meters[-1]["sim_time"])
        st = http("GET", "/sites/site-1/status")
        assert st["feed_kw"] > 0 and st["block_kw"] > 0 and st["sim_time"], st
        free = [c["connector_id"] for c in meters[-1]["connectors"] if c["session_id"] is None]
        connector = free[-1]
        print(f"[ws]     sim_time={sim_now}  mode={st['mode']}  feed={st['feed_kw']} kW block={st['block_kw']} kW  free={len(free)} -> driver takes {connector}")

        # 2. driver previews the price for a ready-by 4 h out, then plugs in wanting 13.5 kWh
        departure = (sim_now + timedelta(hours=4)).replace(second=0, microsecond=0).isoformat()
        pv = http("GET", f"/price?departure_at={departure}&kwh_needed=13.5")
        assert pv["price"]["tier"] in ("green", "standard", "boost") and len(pv["tiers"]) == 3
        print(f"[driver] /price -> slack {pv['slack_hours']} h => {pv['price']['tier']} ${pv['price']['usd_per_kwh']}/kWh  tiers={[(t['tier'], t['usd_per_kwh']) for t in pv['tiers']]}")
        s = http("POST", "/sessions", {"connector_id": connector, "departure_at": departure, "kwh_needed": 13.5})
        sid = s["session_id"]
        assert s["connector_id"] == connector and s["status"] == "charging" and s["price"]["tier"] == pv["price"]["tier"]
        print(f"[driver] POST /sessions -> session {sid} plan {s['plan']['start']}..{s['plan']['end']} ready_by {s['plan']['ready_by']}")

        # 3. ops side sees the plug_in event, the connector in the meter, and the plan for it
        await asyncio.sleep(2.5)
        assert frames_of(frames, "event", name="plug_in", session_id=sid), "plug_in event not broadcast"
        mine = next(c for c in frames_of(frames, "meter")[-1]["connectors"] if c["session_id"] == sid)
        plans = frames_of(frames, "plan")
        assert plans and any(c["session_id"] == sid for c in plans[-1]["connectors"]), "plan frame lacks the connector"
        print(f"[ws]     plug_in event; meter {mine['connector_id']} kw={mine['kw']} {mine['kwh_delivered']:.2f}/{mine['kwh_needed']} kWh; plan mode={plans[-1]['mode']}")

        # 4. driver receipt + graph data
        live = http("GET", f"/sessions/{sid}/live")
        sig = http("GET", "/grid/signal")
        assert len(sig) == 24 and live["session_id"] == sid
        print(f"[driver] /live kw_now={live['kw_now']} grid cleaner than {live['grid_percentile']}% of today; saved ${live['saved_usd']} {live['saved_kgco2']} kg; /grid/signal 12:00={sig[12]['gco2_per_kwh']} g/kWh")

        # 5. Boost -> event + flag on the ops side
        b = http("POST", f"/sessions/{sid}/boost")
        assert b["boost"] and b["price"]["tier"] == "boost"
        await asyncio.sleep(2.5)
        assert frames_of(frames, "event", name="boost", session_id=sid), "boost event not broadcast"
        mine = next(c for c in frames_of(frames, "meter")[-1]["connectors"] if c["session_id"] == sid)
        assert mine["boost"] is True
        print(f"[ws]     boost event; meter boost={mine['boost']}")

        # 6. the four ops demo buttons. Two more (un-boosted) drivers first, so that after "early unplug" takes
        #    one of them, "boost" still finds a car that isn't already boosted; early in the sim day ours may be alone.
        for cid in (free[-2], free[-3]):
            http("POST", "/sessions", {"connector_id": cid, "departure_at": departure, "kwh_needed": 9.0})
        await asyncio.sleep(1.5)
        for path, body in (("/demo/early_unplug", None), ("/demo/boost", None), ("/demo/oversubscribe", None),
                           ("/demo/signal_outage", {"rungs": ["live"]})):
            d = http("POST", path, body)
            print(f"[ops]    POST {path} -> {d['changed']}")
        await asyncio.sleep(2.5)
        assert frames_of(frames, "event", name="unplug"), "unplug event not broadcast"
        assert frames_of(frames, "event", name="mode"), "mode event not broadcast"
        st = http("GET", "/sites/site-1/status")
        assert st["mode"] != "live", f"ladder did not drop: {st}"
        http("POST", "/demo/signal_outage", {"rungs": ["live"], "restore": True})
        await asyncio.sleep(1.5)
        assert http("GET", "/sites/site-1/status")["mode"] == "live", "ladder did not restore"
        print(f"[ops]    ladder dropped to {st['mode']} and restored to live")

        imp = http("GET", "/sites/site-1/impact")
        print(f"[ops]    /impact sessions={imp['sessions']} kwh={imp['kwh']} saved=${imp['saved_usd']} {imp['saved_kgco2']} kg  peak {imp['peak_kw']} kW vs baseline {imp['baseline_peak_kw']} kW")
        if imp["baseline_peak_kw"] < imp["peak_kw"]:  # possible early in the day (sprints); not a failure, just say so
            print("[ops]    note: managed peak above charge-now peak right now")
        task.cancel()

    kinds = {}
    for f in frames:
        kinds[f["type"]] = kinds.get(f["type"], 0) + 1
    print(f"[ws]     frames: {kinds}")
    print("SMOKE OK")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except AssertionError as e:
        print("SMOKE FAILED:", e)
        sys.exit(1)
