"""In-process OCPP 1.6J. Opt-in with OCPP=1; the demo never depends on it.

A CSMS listens on ws://127.0.0.1:9000 and one simulated charge point per connector connects to it, all in this
process. OcppConnector has the same interface as sim.Connector, but:
  plug_in -> StartTransaction, tick -> MeterValues every 5 sim-min, unplug -> StopTransaction,
  set_limit -> CSMS sends SetChargingProfile; the limit only takes effect when the charge point applies it.

Two profiles per connector (solutions.md §5, the NEC 625.42 argument): the static share at stack level 0 with no expiry,
sent once after BootNotification, and the dynamic plan at stack level 1 with valid_to = now + 15 min, refreshed by the
control loop. Profiles persist on the charger, so if Noonshift dies the dynamic one expires and every charger reverts
to its static share on its own, with no network.
"""
import asyncio
from datetime import datetime, timedelta, timezone

import websockets
from ocpp.routing import after, on
from ocpp.v16 import ChargePoint, call, call_result
from ocpp.v16.enums import Action, RegistrationStatus

from .sim import DYN_VALID_MIN, Connector

PORT = 9000
STATIC_KW = 7.0  # the static share; start() sets it from the site
csms = {}      # connector id -> Csms (server side)
chargers = {}  # connector id -> Charger (client side)


def _now():
    return datetime.now(timezone.utc)


def _profile(stack_level, kw, valid_to=None):
    p = {"charging_profile_id": stack_level + 1, "stack_level": stack_level, "charging_profile_purpose": "TxDefaultProfile",
         "charging_profile_kind": "Absolute",
         "charging_schedule": {"charging_rate_unit": "W", "charging_schedule_period": [{"start_period": 0, "limit": round(kw * 1000)}]}}
    if valid_to:
        p["valid_to"] = valid_to.isoformat()
    return p


class Csms(ChargePoint):
    """Server side: answers the charger, pushes SetChargingProfile."""
    tx = 0

    def __init__(self, *a):
        super().__init__(*a)
        self.received = []  # action names, for the self-check

    @on(Action.boot_notification)
    def on_boot(self, **kw):
        self.received.append("BootNotification")
        return call_result.BootNotification(current_time=_now().isoformat(), interval=300, status=RegistrationStatus.accepted)

    @after(Action.boot_notification)
    def after_boot(self, **kw):  # the static share goes down once, right after boot, and never expires
        # a task, not an await: this runs inside the message loop that has to read the reply
        asyncio.create_task(self.call(call.SetChargingProfile(connector_id=1, cs_charging_profiles=_profile(0, STATIC_KW))))

    @on(Action.start_transaction)
    def on_start(self, **kw):
        self.received.append("StartTransaction")
        Csms.tx += 1
        return call_result.StartTransaction(transaction_id=Csms.tx, id_tag_info={"status": "Accepted"})

    @on(Action.meter_values)
    def on_meter(self, **kw):
        self.received.append("MeterValues")
        return call_result.MeterValues()

    @on(Action.stop_transaction)
    def on_stop(self, **kw):
        self.received.append("StopTransaction")
        return call_result.StopTransaction()

    async def set_limit(self, kw):  # the dynamic plan sits on top and dies with us
        await self.call(call.SetChargingProfile(
            connector_id=1, cs_charging_profiles=_profile(1, kw, _now() + timedelta(minutes=DYN_VALID_MIN))))


class Charger(ChargePoint):
    """Client side: the simulated charge point. Owns the physical Connector."""

    def __init__(self, *a):
        super().__init__(*a)
        self.connector = None
        self.tx = None
        self.profiles = {}  # stack_level -> (kW, valid_to | None); what a real charge point keeps in flash

    @on(Action.set_charging_profile)
    def on_profile(self, connector_id, cs_charging_profiles):
        p = cs_charging_profiles
        valid_to = datetime.fromisoformat(p["valid_to"]) if p.get("valid_to") else None
        self.profiles[p["stack_level"]] = (p["charging_schedule"]["charging_schedule_period"][0]["limit"] / 1000, valid_to)
        self.apply()
        return call_result.SetChargingProfile(status="Accepted")

    def apply(self, now=None):
        """The highest stack level still valid wins (OCPP 1.6 profile stacking). Called on every profile, and by the
        self-check with a later `now` to show what the charger does once the dynamic profile has expired."""
        now = now or _now()
        live = [(lvl, kw) for lvl, (kw, until) in self.profiles.items() if until is None or until > now]
        if live and self.connector:
            Connector.set_limit(self.connector, max(live)[1])

    async def start_tx(self, session):
        r = await self.call(call.StartTransaction(connector_id=1, id_tag=f"s{session['id']}", meter_start=0, timestamp=_now().isoformat()))
        self.tx = r.transaction_id

    async def meter(self, kw, kwh):
        await self.call(call.MeterValues(connector_id=1, transaction_id=self.tx, meter_value=[{"timestamp": _now().isoformat(), "sampled_value": [
            {"value": str(round(kw * 1000)), "measurand": "Power.Active.Import", "unit": "W"},
            {"value": str(round(kwh * 1000)), "measurand": "Energy.Active.Import.Register", "unit": "Wh"}]}]))

    async def stop_tx(self, kwh):
        await self.call(call.StopTransaction(meter_stop=round(kwh * 1000), timestamp=_now().isoformat(), transaction_id=self.tx or 0))
        self.tx = None


class OcppConnector(Connector):
    def __init__(self, id, p_max_kw=7.0, safe_kw=None):
        super().__init__(id, p_max_kw, safe_kw)
        chargers[id].connector = self
        self.wanted = None
        self.minutes = 0
        self.sent_min = -DYN_VALID_MIN

    def plug_in(self, session):
        super().plug_in(session)
        self.wanted = None
        asyncio.create_task(chargers[self.id].start_tx(session))

    def set_limit(self, kw):  # over the wire; Charger.on_profile applies it. Refreshed before the 15-min expiry.
        if kw != self.wanted or self.minutes - self.sent_min >= DYN_VALID_MIN - 5:
            self.wanted, self.sent_min = kw, self.minutes
            asyncio.create_task(csms[self.id].set_limit(kw))

    def tick(self, minutes):
        super().tick(minutes)
        self.minutes += minutes
        if self.session and self.minutes % 5 == 0:
            asyncio.create_task(chargers[self.id].meter(self.kw, self.session["kwh_delivered"]))

    def unplug(self, now):
        s = super().unplug(now)
        asyncio.create_task(chargers[self.id].stop_tx(s["kwh_delivered"]))
        return s


async def start(connector_ids, safe_kw=None):
    global STATIC_KW
    STATIC_KW = safe_kw or STATIC_KW

    async def on_connect(ws):
        cid = ws.path.strip("/")
        csms[cid] = Csms(cid, ws)
        await csms[cid].start()

    await websockets.serve(on_connect, "127.0.0.1", PORT, subprotocols=["ocpp1.6"])
    for cid in connector_ids:
        ws = await websockets.connect(f"ws://127.0.0.1:{PORT}/{cid}", subprotocols=["ocpp1.6"])
        chargers[cid] = Charger(cid, ws)
        asyncio.create_task(chargers[cid].start())
        await chargers[cid].call(call.BootNotification(charge_point_model="sim", charge_point_vendor="noonshift"))
    print(f"ocpp: {len(connector_ids)} charge points booted against in-process CSMS on :{PORT}")


if __name__ == "__main__":  # self-check: python -m noonshift.ocpp_gateway
    async def main():
        await start(["c01", "c02"], safe_kw=1.833)
        await asyncio.sleep(0.3)
        assert chargers["c01"].profiles[0] == (1.833, None) and chargers["c02"].profiles[0] == (1.833, None), "static share on every charger after boot"
        c = OcppConnector("c01", 7.0, 1.833)
        s = {"id": 1, "kwh_needed": 8.0, "kwh_delivered": 0.0, "status": "pending", "boost": False}
        c.plug_in(s)
        assert c.limit_kw == 1.833, "plug-in starts on the static share"
        c.set_limit(3.5)
        assert c.limit_kw == 1.833, "limit is not applied until SetChargingProfile round-trips"
        await asyncio.sleep(0.3)
        assert c.limit_kw == 3.5, c.limit_kw
        dyn = chargers["c01"].profiles[1]
        assert dyn[0] == 3.5 and dyn[1] and dyn[1] > _now(), "dynamic profile carries a valid_to"
        for _ in range(5):
            c.tick(1)
        assert abs(s["kwh_delivered"] - 3.5 * 5 / 60) < 1e-6
        chargers["c01"].apply(now=_now() + timedelta(minutes=DYN_VALID_MIN + 1))  # the CSMS is gone: profile 1 expires
        assert c.limit_kw == 1.833, "with no controller the charger reverts to its static share by itself"
        c.unplug(None)
        await asyncio.sleep(0.3)
        got = csms["c01"].received
        assert got == ["BootNotification", "StartTransaction", "MeterValues", "StopTransaction"], got
        assert csms["c02"].received == ["BootNotification"]
        print("ocpp ok:", " -> ".join(got), "| static 1.833 kW at stack 0, dynamic 3.5 kW at stack 1 (15 min); expired -> 1.833 kW")

    asyncio.run(main())
