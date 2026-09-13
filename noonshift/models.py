"""The contract with the front-end. REST bodies and the three WebSocket frames. Change here = tell Nandini."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["live", "cached", "tariff", "deadline", "full"]
SessionStatus = Literal["pending", "charging", "done", "ended"]


# ---- REST ----
class SessionIn(BaseModel):
    connector_id: str
    departure_at: datetime
    kwh_needed: float | None = None


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
    note: str = "estimate vs charge-immediately baseline"


class StatusOut(BaseModel):
    mode: Mode
    last_solve_at: datetime | None
    connectors_active: int
    feed_kw: float = 0.0
    block_kw: float = 0.0
    sim_time: datetime | None = None


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


class MeterMsg(BaseModel):
    type: Literal["meter"] = "meter"
    sim_time: datetime
    mode: Mode
    site_kw: float
    building_load_kw: float
    feed_kw: float
    connectors: list[ConnectorMeter]


class EventMsg(BaseModel):
    type: Literal["event"] = "event"
    sim_time: datetime
    name: Literal["plug_in", "unplug", "deadline", "boost", "urgency", "dr", "demo", "mode", "day_reset"]
    detail: dict


WS_FRAMES = PlanMsg | MeterMsg | EventMsg
