"""The contract with the front-end. REST bodies and the three WebSocket frames. Change here = tell Nandini."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["live", "cached", "tariff", "deadline", "full"]
SessionStatus = Literal["pending", "charging", "done", "ended"]


# ---- REST ----
class Vehicle(BaseModel):
    """What the driver tells us about the car. All optional: the brain plans with the bay's limit when it knows nothing."""
    model: str | None = None
    battery_kwh: float | None = Field(None, gt=0)
    max_kw: float | None = Field(None, gt=0)  # the car's own AC limit (3.7 / 7 / 11 kW are common)


NeedConfidence = Literal["declared", "history", "site"]  # solutions.md §11: where kwh_needed came from


class SessionIn(BaseModel):
    connector_id: str
    departure_at: datetime
    kwh_needed: float | None = None
    vehicle: Vehicle | None = None
    soc_now: float | None = Field(None, ge=0, le=1)  # with vehicle.battery_kwh: kwh_needed = (target - now) * battery
    target_soc: float = Field(1.0, gt=0, le=1)


Urgency = Literal["now", "soon", "priority"]  # business.md §4b: three bands, one price (R)


class UrgencyIn(BaseModel):
    level: Urgency
    leave_at: datetime | None = None  # "soon" only; < 15 min away is treated as "now"


class Price(BaseModel):
    tier: Literal["green", "standard", "boost"]
    usd_per_kwh: float


class PlanWindow(BaseModel):
    start: datetime | None  # first slot with power; None when nothing is scheduled
    end: datetime | None
    ready_by: datetime


class SessionOut(BaseModel):
    session_id: int
    connector_id: str
    status: SessionStatus
    plan: PlanWindow
    eta: datetime | None  # when the plan reaches kwh_needed
    price: Price
    boost: bool
    urgency: Urgency | None = None  # set by POST /sessions/{id}/urgency (or /boost = "now"); price is then exactly R
    kwh_needed: float = 0.0
    need_confidence: NeedConfidence | None = None
    max_kw: float | None = None  # what the brain plans with: min(bay, car), corrected by the observation guard


class LiveOut(BaseModel):
    session_id: int
    status: SessionStatus
    kw_now: float
    grid_percentile: float  # "grid is cleaner than X% of today"
    kwh_delivered: float
    kwh_needed: float
    saved_usd: float
    saved_kgco2: float


class ImpactOut(BaseModel):
    from_: datetime = Field(serialization_alias="from")
    to: datetime
    sessions: int
    kwh: float
    saved_usd: float
    saved_kgco2: float
    peak_kw: float = 0.0  # highest metered site kW (EV + building) so far today
    baseline_peak_kw: float = 0.0  # same, had every car charged at full power from plug-in
    renewable_share: float = 0.0  # share of delivered kWh in slots where the marginal source was renewable (MOER = 0)
    health_usd: float | None = None  # metrics.md §4: avoided health damage, when the signal carries an index
    note: str = "estimate vs charge-immediately baseline"


class StatusOut(BaseModel):
    mode: Mode
    last_solve_at: datetime | None
    connectors_active: int
    feed_kw: float = 0.0
    block_kw: float = 0.0
    sim_time: datetime | None = None
    safe_share_kw: float = 0.0  # per-connector static share every charger reverts to when the controller is gone
    waiting: int = 0  # cars that arrived with no free bay
    connectors_asap: list[str] = []  # fleet bays that are never deferred
    n_connectors: int = 0
    p_max_kw: float = 0.0
    contracted_peak_kw: float = 0.0  # the building's contracted demand; default = feed_kw (Assumption A2)
    package: Literal["capacity", "clean-hours", "pilot"] = "pilot"  # business.md §9b (Assumption A3)
    employee_rate_usd_per_kwh: float = 0.0  # R
    driver_share: float = 0.5  # alpha
    noonshift_share: float = 0.2  # beta
    signal_kind: Literal["marginal", "average"] | None = None
    signal_source: str | None = None
    tariff_name: str | None = None
    ladder: dict[str, bool] = {}


class PriceTier(BaseModel):
    tier: Literal["green", "standard", "boost"]
    min_slack_hours: float
    usd_per_kwh: float


class PricePreview(BaseModel):
    """What the driver would pay for a given ready-by, before plugging in. Slack = dwell minus charge time."""
    slack_hours: float
    price: Price
    tiers: list[PriceTier]


class FlexHour(BaseModel):
    hour: int
    shiftable_kw: float


class SignalHour(BaseModel):
    hour: int
    gco2_per_kwh: float  # hourly mean of the marginal signal; label as estimate
    usd_per_kwh: float
    kind: Literal["marginal", "average"]


class DrEvent(BaseModel):
    start: datetime
    end: datetime
    reduce_kw: float


class DemoOut(BaseModel):
    changed: str
    detail: dict


class OutageIn(BaseModel):
    rungs: list[Literal["live", "cached", "tariff", "deadline"]] = ["live"]
    restore: bool = False  # true = put every rung back


# ---- WebSocket frames on /ws (one JSON object per frame, discriminated by "type") ----
class ConnectorPlan(BaseModel):
    connector_id: str
    session_id: int
    kw: list[float]  # one value per 5-min slot from horizon_start


class PlanMsg(BaseModel):
    type: Literal["plan"] = "plan"
    site_id: str
    solved_at: datetime
    mode: Mode
    reason: str
    horizon_start: datetime
    slot_minutes: int = 5
    connectors: list[ConnectorPlan]
    site_kw: list[float]  # sum over connectors per slot


class ConnectorMeter(BaseModel):
    connector_id: str
    session_id: int | None
    status: Literal["idle", "charging", "done"]
    kw: float
    kwh_delivered: float
    kwh_needed: float
    departure_at: datetime | None  # what the driver told us
    boost: bool
    urgency: Urgency | None = None
    idle_min: int = 0  # minutes since the car was full and still plugged in
    need_confidence: NeedConfidence | None = None
    p_max_kw: float = 0.0  # what the brain plans with for this car
    cap_observed: bool = False  # the meter said the car draws less than we planned; p_max_kw was lowered to match
    asap: bool = False  # a connectors_asap bay
    move_by: bool = False  # deadline tightened to make room for a waiting car


class MeterMsg(BaseModel):
    type: Literal["meter"] = "meter"
    sim_time: datetime
    mode: Mode
    site_kw: float
    building_load_kw: float
    feed_kw: float
    connectors: list[ConnectorMeter]
    waiting: int = 0


class EventMsg(BaseModel):
    type: Literal["event"] = "event"
    sim_time: datetime
    name: Literal["plug_in", "unplug", "deadline", "boost", "urgency", "done", "cap_observed", "move_by", "dr", "demo", "mode", "day_reset"]
    detail: dict


WS_FRAMES = PlanMsg | MeterMsg | EventMsg
