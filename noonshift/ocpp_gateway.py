"""In-process OCPP 1.6J. Opt-in with OCPP=1; the demo never depends on it.

A CSMS listens on ws://127.0.0.1:9000 and one simulated charge point per connector connects to it, all in this
process. OcppConnector has the same interface as sim.Connector, but:
  plug_in -> StartTransaction, tick -> MeterValues every 5 sim-min, unplug -> StopTransaction,
  set_limit -> CSMS sends SetChargingProfile; the limit only takes effect when the charge point applies it.
"""
import asyncio
from datetime import datetime, timezone

import websockets
from ocpp.routing import on
from ocpp.v16 import ChargePoint, call, call_result
from ocpp.v16.enums import Action, RegistrationStatus

from .sim import Connector

PORT = 9000
csms = {}      # connector id -> Csms (server side)
chargers = {}  # connector id -> Charger (client side)


def _now():
    return datetime.now(timezone.utc).isoformat()


class Csms(ChargePoint):
    """Server side: answers the charger, pushes SetChargingProfile."""
    tx = 0

    def __init__(self, *a):
        super().__init__(*a)
        self.received = []  # action names, for the self-check

    @on(Action.boot_notification)
    def on_boot(self, **kw):
        self.received.append("BootNotification")
        return call_result.BootNotification(current_time=_now(), interval=300, status=RegistrationStatus.accepted)

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

    async def set_limit(self, kw):
        await self.call(call.SetChargingProfile(connector_id=1, cs_charging_profiles={
            "charging_profile_id": 1, "stack_level": 0, "charging_profile_purpose": "TxDefaultProfile",
            "charging_profile_kind": "Absolute",
            "charging_schedule": {"charging_rate_unit": "W", "charging_schedule_period": [{"start_period": 0, "limit": round(kw * 1000)}]}}))


class Charger(ChargePoint):
    """Client side: the simulated charge point. Owns the physical Connector."""

    def __init__(self, *a):
        super().__init__(*a)
        self.connector = None
        self.tx = None

    @on(Action.set_charging_profile)
    def on_profile(self, connector_id, cs_charging_profiles):
        watts = cs_charging_profiles["charging_schedule"]["charging_schedule_period"][0]["limit"]
        Connector.set_limit(self.connector, watts / 1000)
        return call_result.SetChargingProfile(status="Accepted")

    async def start_tx(self, session):
        r = await self.call(call.StartTransaction(connector_id=1, id_tag=f"s{session['id']}", meter_start=0, timestamp=_now()))
        self.tx = r.transaction_id

    async def meter(self, kw, kwh):
        await self.call(call.MeterValues(connector_id=1, transaction_id=self.tx, meter_value=[{"timestamp": _now(), "sampled_value": [
            {"value": str(round(kw * 1000)), "measurand": "Power.Active.Import", "unit": "W"},
            {"value": str(round(kwh * 1000)), "measurand": "Energy.Active.Import.Register", "unit": "Wh"}]}]))

    async def stop_tx(self, kwh):
        await self.call(call.StopTransaction(meter_stop=round(kwh * 1000), timestamp=_now(), transaction_id=self.tx or 0))
        self.tx = None


class OcppConnector(Connector):
    def __init__(self, id, p_max_kw=7.0):
        super().__init__(id, p_max_kw)
        chargers[id].connector = self
        self.wanted = None
        self.minutes = 0

    def plug_in(self, session):
        super().plug_in(session)
        self.wanted = None
        asyncio.create_task(chargers[self.id].start_tx(session))

    def set_limit(self, kw):  # over the wire; Charger.on_profile applies it
        if kw != self.wanted:
            self.wanted = kw
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


async def start(connector_ids):
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
        await start(["c01", "c02"])
        c = OcppConnector("c01")
        s = {"id": 1, "kwh_needed": 8.0, "kwh_delivered": 0.0, "status": "pending", "boost": False}
        c.plug_in(s)
        c.set_limit(3.5)
        assert c.limit_kw == 7.0, "limit is not applied until SetChargingProfile round-trips"
        await asyncio.sleep(0.3)
        assert c.limit_kw == 3.5, c.limit_kw
        for _ in range(5):
            c.tick(1)
        assert abs(s["kwh_delivered"] - 3.5 * 5 / 60) < 1e-6
        c.unplug(None)
        await asyncio.sleep(0.3)
        got = csms["c01"].received
        assert got == ["BootNotification", "StartTransaction", "MeterValues", "StopTransaction"], got
        assert csms["c02"].received == ["BootNotification"]
        print("ocpp ok:", " -> ".join(got), "| SetChargingProfile applied 3.5 kW")

    asyncio.run(main())
