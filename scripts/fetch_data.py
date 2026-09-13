"""Download the demo day into data/*.json (same schema seed.py writes) so the demo runs offline.

    python scripts/fetch_data.py signal   --day 2026-04-14          # WattTime CAISO_NORTH MOER (+ health_damage when the plan returns it)
    python scripts/fetch_data.py signal   --day 2026-04-14 --forecast   # the MOER forecast as published at 06:00 that day -> data/signal_forecast.json
    python scripts/fetch_data.py caiso    --day 2026-04-14          # fallback: CAISO fuel mix -> AVERAGE intensity, no auth
    python scripts/fetch_data.py sessions --day 2019-04-09 --n 40   # ACN-Data Caltech sessions (needs ACN_TOKEN; data spans 2018-04..2021-09), re-dated to --site-day

Every writer prints what it wrote and how many gaps it filled. Nothing here is imported by the app.
"""
import argparse
import base64
import csv
import io
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    PT = ZoneInfo("America/Los_Angeles")
except ZoneInfoNotFoundError:
    sys.exit("no tz database (Windows): pip install tzdata")
SLOTS = 288
LBS_PER_MWH_TO_G_PER_KWH = 0.45359237  # 1 lb/MWh = 0.4536 g/kWh


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "noonshift/0.1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def to_slots(points, day):
    """[(local datetime, value)] -> 288 values; missing slots take the nearest earlier value, then the mean."""
    out = [None] * SLOTS
    for t, v in points:
        if t.date() == day:
            out[(t.hour * 60 + t.minute) // 5] = v
    known = [v for v in out if v is not None]
    if not known:
        sys.exit("no data points fall on that day")
    gaps, last = 0, sum(known) / len(known)
    for k in range(SLOTS):
        if out[k] is None:
            out[k], gaps = last, gaps + 1
        else:
            last = out[k]
    return [round(v, 1) for v in out], gaps


def _watttime_token():
    user, pw = os.environ.get("WATTTIME_USER"), os.environ.get("WATTTIME_PASSWORD")
    if not (user and pw):
        sys.exit("set WATTTIME_USER and WATTTIME_PASSWORD (free Basic plan covers CAISO_NORTH)")
    auth = base64.b64encode(f"{user}:{pw}".encode()).decode()
    return json.loads(get("https://api.watttime.org/login", {"Authorization": f"Basic {auth}"}))["token"]


def _pt(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(PT)


def watttime(day, forecast=False):
    token = _watttime_token()
    start = datetime.combine(day, datetime.min.time(), PT).astimezone(timezone.utc)
    hdr = {"Authorization": f"Bearer {token}"}
    if forecast:
        # solutions.md §6: the forecast a product would have planned on at 06:00 that morning, not the realised signal.
        # Assumption: WattTime Basic serves /v3/forecast/historical for CAISO_NORTH; if it does not, run this on a live
        # day with /v3/forecast and the flag stays wired.
        at = start + timedelta(hours=6)
        q = urllib.parse.urlencode({"region": "CAISO_NORTH", "signal_type": "co2_moer", "start": at.isoformat(),
                                    "end": (at + timedelta(minutes=5)).isoformat(), "horizon_hours": 24})
        gens = json.loads(get(f"https://api.watttime.org/v3/forecast/historical?{q}", hdr))["data"]
        if not gens:
            sys.exit("no historical forecast returned for that day")
        g = gens[0]
        points = [(_pt(p["point_time"]), p["value"] * LBS_PER_MWH_TO_G_PER_KWH) for p in g["forecast"]]
        moer, gaps = to_slots(points, day)
        json.dump({"kind": "marginal", "region": "CAISO_NORTH", "date": day.isoformat(), "forecast": True,
                   "generated_at": g.get("generated_at"), "source": "WattTime v3 co2_moer forecast (historical)", "moer": moer},
                  open("data/signal_forecast.json", "w"))
        print(f"wrote data/signal_forecast.json: forecast generated {g.get('generated_at')}, {len(points)} points, {gaps} gaps filled "
              f"(the hours before 06:00 are not in a 06:00 forecast), min {min(moer)} max {max(moer)} g/kWh")
        return
    q = urllib.parse.urlencode({"region": "CAISO_NORTH", "signal_type": "co2_moer",
                                "start": start.isoformat(), "end": (start + timedelta(days=1)).isoformat()})
    data = json.loads(get(f"https://api.watttime.org/v3/historical?{q}", hdr))["data"]
    points = [(_pt(p["point_time"]), p["value"] * LBS_PER_MWH_TO_G_PER_KWH) for p in data]
    moer, gaps = to_slots(points, day)
    out = {"kind": "marginal", "region": "CAISO_NORTH", "date": day.isoformat(), "source": "WattTime v3 co2_moer", "moer": moer}
    try:  # metrics.md §4: the health-damage index ($/MWh) rides along when the plan serves it
        q = urllib.parse.urlencode({"region": "CAISO_NORTH", "signal_type": "health_damage",
                                    "start": start.isoformat(), "end": (start + timedelta(days=1)).isoformat()})
        hd = json.loads(get(f"https://api.watttime.org/v3/historical?{q}", hdr))["data"]
        out["health_damage"], hd_gaps = to_slots([(_pt(p["point_time"]), p["value"]) for p in hd], day)
        out["health_source"] = "WattTime v3 health_damage ($/MWh)"
        print(f"health_damage: {len(hd)} points, {hd_gaps} gaps filled, mean {sum(out['health_damage']) / SLOTS:.1f} $/MWh")
    except Exception as e:  # noqa: BLE001
        print(f"health_damage not stored ({e}); impact.health_usd stays None")
    json.dump(out, open("data/signal.json", "w"))
    print(f"wrote data/signal.json: WattTime CAISO_NORTH MOER for {day}, {len(points)} points, {gaps} gaps filled, "
          f"min {min(moer)} max {max(moer)} g/kWh")


# kg CO2 per MWh by CAISO fuel-mix column. Approximate, for the fallback only: gas and imports carry the intensity;
# CARB's unspecified-import factor is 0.428 t/MWh; the rest are treated as zero at the margin of this estimate.
EF = {"Coal": 950.0, "Natural Gas": 420.0, "Imports": 428.0, "Biomass": 0.0, "Biogas": 0.0, "Geothermal": 0.0,
      "Nuclear": 0.0, "Large Hydro": 0.0, "Small hydro": 0.0, "Solar": 0.0, "Wind": 0.0, "Batteries": 0.0, "Other": 0.0}


def caiso(day):
    ymd = day.strftime("%Y%m%d")
    raw = None
    for url in (f"https://www.caiso.com/outlook/history/{ymd}/fuelsource.csv",
                f"https://www.caiso.com/outlook/SP/History/{ymd}/fuelsource.csv"):
        try:
            raw = get(url).decode("utf-8-sig")
            break
        except Exception as e:  # noqa: BLE001
            print(f"{url}: {e}")
    if raw is None:
        sys.exit("CAISO fuel-mix CSV not reachable")
    points = []
    for row in csv.DictReader(io.StringIO(raw)):
        t = datetime.combine(day, datetime.strptime(row["Time"], "%H:%M").time())
        gen = {k: max(0.0, float(v or 0)) for k, v in row.items() if k in EF}
        total = sum(gen.values())
        if total > 0:
            points.append((t, sum(gen[k] * EF[k] for k in gen) / total))  # kg/MWh == g/kWh
    moer, gaps = to_slots(points, day)
    json.dump({"kind": "average", "region": "CAISO", "date": day.isoformat(), "source": "CAISO Today's Outlook fuel mix, fixed EFs",
               "moer": moer}, open("data/signal.json", "w"))
    print(f"wrote data/signal.json: CAISO AVERAGE intensity for {day} (kind=average, not marginal), {len(points)} points, "
          f"{gaps} gaps filled, min {min(moer)} max {max(moer)} g/kWh")


def sessions(day, n, site_day):
    token = os.environ.get("ACN_TOKEN")
    if not token:
        sys.exit("set ACN_TOKEN (register at ev.caltech.edu/dataset)")
    where = urllib.parse.quote(f'connectionTime>="{day.strftime("%a, %d %b %Y")} 07:00:00 GMT" and '
                               f'connectionTime<="{day.strftime("%a, %d %b %Y")} 23:59:00 GMT"')
    auth = base64.b64encode(f"{token}:".encode()).decode()
    items = json.loads(get(f"https://ev.caltech.edu/api/v1/sessions/caltech?where={where}&max_results=200",
                           {"Authorization": f"Basic {auth}"}))["_items"]
    out = []
    for s in items:
        arr = parsedate_to_datetime(s["connectionTime"]).astimezone(PT).replace(tzinfo=None)
        dep = parsedate_to_datetime(s["disconnectTime"]).astimezone(PT).replace(tzinfo=None)
        ui = (s.get("userInputs") or [{}])[0]
        # kwh_needed is what the car actually took: on 2019-04-09 drivers requested a median 1.47x what was delivered
        # (one asked 20 kWh and took 1.2), so the request would send the sim chasing energy the battery never accepts.
        # user_stated_departure is what the driver typed; it may be before the real departure (early leavers) or after.
        kwh = float(s["kWhDelivered"])
        stated = parsedate_to_datetime(ui["requestedDeparture"]).astimezone(PT).replace(tzinfo=None) if ui.get("requestedDeparture") else dep
        if stated < arr + timedelta(minutes=30):
            stated = dep
        if dep - arr < timedelta(hours=2) or kwh < 1:
            continue
        shift = datetime.combine(site_day, datetime.min.time()) - datetime.combine(arr.date(), datetime.min.time())
        out.append({"arrival": (arr + shift).replace(second=0, microsecond=0), "departure": (dep + shift).replace(second=0, microsecond=0),
                    "user_stated_departure": (stated + shift).replace(second=0, microsecond=0), "kwh_needed": round(kwh, 1),
                    "kwh_requested": round(float(ui["kWhRequested"]), 1) if ui.get("kWhRequested") else None,
                    "acn_session": s.get("sessionID") or s.get("_id")})
    out.sort(key=lambda s: s["arrival"])
    out = out[:n]
    for i, s in enumerate(out, 1):
        s.update(id=i, connector_id=f"c{i:02d}")
        for k in ("arrival", "departure", "user_stated_departure"):
            s[k] = s[k].isoformat()
    json.dump(out, open("data/sessions.json", "w"), indent=1)
    print(f"wrote data/sessions.json: {len(out)} ACN Caltech sessions from {day}, re-dated to {site_day}, "
          f"{sum(s['kwh_needed'] for s in out):.0f} kWh total ({len(items)} fetched)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["signal", "caiso", "sessions"])
    ap.add_argument("--day", required=True, help="YYYY-MM-DD of the data to fetch")
    ap.add_argument("--site-day", default="2026-04-14", help="sessions: re-date onto this day so all files agree")
    ap.add_argument("--n", type=int, default=40)
    ap.add_argument("--forecast", action="store_true", help="signal: fetch the 06:00 forecast for --day instead of the realised MOER")
    a = ap.parse_args()
    day = datetime.fromisoformat(a.day).date()
    {"signal": lambda: watttime(day, a.forecast), "caiso": lambda: caiso(day),
     "sessions": lambda: sessions(day, a.n, datetime.fromisoformat(a.site_day).date())}[a.what]()
