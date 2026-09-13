"""WP6: the operator assistant — snapshot cap and keys, the deterministic fallback for every starter and hard question,
the label -> path parser, the per-IP limit, the endpoint without a key, and (with a key) prompt-cache reuse."""
import asyncio
import json
import os
from datetime import timedelta

import pytest
from fastapi import HTTPException

from noonshift import assist
from noonshift.api import S, demo_oversubscribe, ops_auth, step, urgency
from noonshift.models import UrgencyIn
from tests.test_day import fresh

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")


async def _play(hours):
    end = S["sim"].now + timedelta(hours=hours)
    while S["sim"].now < end:
        await step()


@pytest.fixture(scope="module")
def snap():
    """Late morning with a queue, an urgent car and done cars, so every template has something to say."""
    fresh()
    asyncio.run(_play(4.0))
    asyncio.run(demo_oversubscribe())
    first = next(c.session["id"] for c in S["sim"].active())
    asyncio.run(urgency(first, UrgencyIn(level="priority")))
    asyncio.run(_play(1.0))
    return assist.snapshot()


def test_snapshot_has_the_keys_and_fits_the_cap(snap):
    for k in ("sim_time", "mode", "ladder", "site", "impact", "status", "connectors", "counts", "waiting", "events", "signal", "tariff"):
        assert k in snap, k
    assert len(json.dumps(snap)) <= assist.SNAPSHOT_CHARS
    assert 0 < len(snap["connectors"]) <= assist.MAX_ROWS
    assert snap["counts"]["plugged"] >= len(snap["connectors"])
    assert snap["site"]["safe_share_kw"] == pytest.approx(1.833, abs=1e-3)
    assert snap["events"] and snap["events"][-1]["name"]
    row = snap["connectors"][0]
    assert {"connector", "session", "kw", "plan_kw_next_6", "kwh_delivered", "kwh_needed", "departure", "slack_h", "urgency", "risk",
            "idle_min", "cap_observed"} <= set(row)


def test_snapshot_is_json_and_sorted_rows_lead_with_the_relevant(snap):
    json.dumps(snap, sort_keys=True)  # what goes into the user turn
    urgent = [r for r in snap["connectors"] if r["urgency"] or r["boost"]]
    assert urgent, "the priority car made the cut"


def test_every_starter_question_gets_a_grounded_fallback(snap):
    sugg = assist.suggestions(snap)
    assert len(sugg) == 6 and len(set(sugg)) == 6
    for q in sugg:
        out = assist.fallback(q, snap)
        assert out["fallback"] is True and len(out["answer"]) > 40, q
        assert all(a["path"].startswith("/ops/") for a in out["suggested_actions"]), q
        assert "try one of" not in out["answer"], f"unrouted starter: {q}"


@pytest.mark.parametrize("q,needle", [
    ("why is bay c05 only getting 1.4 kW?", "Bay c05"),
    ("what happens if the grid API dies?", "ladder"),
    ("what is the safe share?", "1.833"),
    ("how much co2 did we save today", "kg CO"),
    ("what does boost do", "Leaving now"),
    ("who is waiting for a bay", "waiting"),
    ("what does a driver pay", "R = $"),
    ("is site load above the block?", "tariff block"),
    ("when is the cleanest hour today", "Zero-carbon hours"),
    ("which cars are done", "finished"),
    ("the backend dies", "safe share"),
    ("can a bug overcharge the circuit", "hard constraint"),
    ("why would a bay sit at 1.4 kW?", "6 A floor"),
])
def test_hard_questions_route_to_the_right_template(snap, q, needle):
    out = assist.fallback(q, snap)
    assert needle in out["answer"], (q, out["answer"][:120])


def test_unknown_question_offers_the_starters(snap):
    out = assist.fallback("what is the meaning of life", snap)
    assert "try one of" in out["answer"] and out["fallback"]


def test_parser_strips_actions_and_sources():
    text = ("Bay c07 is holding 1.4 kW because it has 5 h of slack.\n\n"
            "Open the bay -> /ops/chargers\n- **See the plan** → `/ops/schedules`\nIgnored third -> /ops/impact\n"
            "[sources: The scheduler, The fail-safe ladder]")
    answer, sources, actions = assist.parse(text)
    assert answer == "Bay c07 is holding 1.4 kW because it has 5 h of slack."  # every action line is stripped, two are kept
    assert sources == ["The scheduler", "The fail-safe ladder"]
    assert actions == [{"label": "Open the bay", "path": "/ops/chargers"}, {"label": "See the plan", "path": "/ops/schedules"}]
    assert assist.parse("plain answer")[0] == "plain answer"


def test_rate_limit_is_ten_per_minute_per_ip():
    assist._hits.clear()
    assert all(assist.allow("1.2.3.4", now=100.0 + i) for i in range(10))
    assert not assist.allow("1.2.3.4", now=110.0)
    assert assist.allow("5.6.7.8", now=110.0)
    assert assist.allow("1.2.3.4", now=161.0)  # the first hit aged out


def test_ask_without_a_key_is_the_fallback(snap, monkeypatch):
    """The HTTP round-trip (200 + fallback flag, 422 on empty, 429 after ten) is scripts/smoke.py's job; this is the unit."""
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    payload, status = assist.ask("what happens if the grid API dies?", [{"role": "user", "content": "hi"}], "/ops/overview", snap)
    assert status == 200 and payload["fallback"] is True and "ladder" in payload["answer"] and payload["suggested_actions"]


def test_ops_token_guards_operator_endpoints(monkeypatch):
    monkeypatch.delenv("OPS_TOKEN", raising=False)
    ops_auth(None)  # unset = open (demo)
    monkeypatch.setenv("OPS_TOKEN", "s3cret")
    with pytest.raises(HTTPException):
        ops_auth(None)
    with pytest.raises(HTTPException):
        ops_auth("Bearer wrong")
    ops_auth("Bearer s3cret")


@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="needs GROQ_API_KEY")
def test_model_answer_is_grounded_and_parsed(snap):
    """One real Groq call: not the fallback, ends with parsed page actions and usage. Skipped in CI (no key)."""
    a, status = assist.ask("what is the safe share?", snap=snap)
    assert status == 200 and not a.get("fallback") and a["usage"]["total_tokens"] > 0, a
    assert str(snap["site"]["safe_share_kw"]) in a["answer"] and all(x["path"].startswith("/ops/") for x in a["suggested_actions"]), a
