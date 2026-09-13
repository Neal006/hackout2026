"""Replay the same sessions against several days' grid signals and print the range (ROADMAP §5 item 4: n = 1 day today).

    python scripts/replay_days.py --days 2026-04-14,2026-07-15,2026-01-20

Each day needs data/days/<date>.json in the data/signal.json schema (fetch with
`python scripts/fetch_data.py signal --day <date>` and move the file); the committed day is read from data/signal.json.
Days without a file are listed as missing, never invented. The sessions are the committed ones (data/sessions.json);
only the grid changes, which is the question being asked.
"""
import argparse
import json
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import prove  # noqa: E402
from noonshift import scheduler  # noqa: E402


def one_day(signal, site, tariff):
    base, _, _ = prove.run_day("asap", site, signal, tariff)
    plan, _, stats = prove.run_day("noonshift", site, signal, tariff)
    d = scheduler.impact_detail(plan, base, {"moer": signal["moer"], "kind": signal["kind"]}, tariff)
    p, b = d["plan"], d["baseline"]
    pct = lambda a, c: 100 * (1 - a / c) if c else 0.0
    return {"co2": pct(p["kgco2"], b["kgco2"]), "usd": pct(p["usd"], b["usd"]), "peak": pct(p["peak_kw"], b["peak_kw"]),
            "clean": 100 * prove.renewable_share(plan, signal["moer"]), "fallbacks": stats["fallbacks"]}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", required=True, help="comma-separated YYYY-MM-DD")
    a = ap.parse_args(argv)
    site, committed, tariff = (json.load(open(f"data/{n}.json")) for n in ("site", "signal", "tariff"))
    rows, missing = {}, []
    for day in a.days.split(","):
        day = day.strip()
        path = f"data/days/{day}.json"
        if day == committed.get("date"):
            signal = committed
        elif os.path.exists(path):
            signal = json.load(open(path))
        else:
            missing.append(day)
            continue
        rows[day] = one_day(signal, site, tariff)
        r = rows[day]
        print(f"{day}  {signal.get('kind', '?'):8s} CO2 {r['co2']:6.1f}%  $ {r['usd']:5.1f}%  peak {r['peak']:5.1f}%  clean-h {r['clean']:5.1f}%  fallbacks {r['fallbacks']}")
    if missing:
        print(f"missing (no data/days/<date>.json): {', '.join(missing)} -> fetch with scripts/fetch_data.py signal --day <date>")
    if len(rows) >= 2:
        for k, label in (("co2", "CO2 saving"), ("usd", "bill saving"), ("peak", "peak saving"), ("clean", "clean-hour share")):
            v = [r[k] for r in rows.values()]
            print(f"{label:17s} min {min(v):6.1f}%  median {statistics.median(v):6.1f}%  max {max(v):6.1f}%  over {len(v)} days")
    elif rows:
        print("one day only: the range needs more signal files (see --help)")
    return rows


if __name__ == "__main__":
    main()
