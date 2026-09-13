"""Site-fit check before anyone signs (solutions.md §4, business.md §9b): run it on the customer's own session export.

    python scripts/fit.py data/sessions.json                    # JSON list with arrival, departure, kwh_needed (or kWh)
    python scripts/fit.py export.csv --p-max 7 --spread 0.04    # CSV with arrival, departure, kwh columns; tariff spread $/kWh
    python scripts/fit.py export.csv --demand-charge             # the bill has a demand charge (capacity is worth money)
    python scripts/fit.py data/sessions.json --saving-rate 0.006 # what prove.py measured ($/kWh): below 4 c/kWh, cash tiers are unfunded

Slack per session = dwell - kWh / p_max. Verdict from the median slack and the money on the bill:
    cash tiers   median slack >= 4 h and (tariff spread >= 4 c/kWh or a demand charge)   -> §7b discounts are real money
    perks only   median slack >= 1.5 h                                                     -> non-price perks (§9b)
    not a fit    median slack < 1.5 h                                                      -> nothing to shift
Same arithmetic as metrics.md §6b "site-type check". Slack uses the driver's stated departure when the export has one
(that is the slack the scheduler actually gets), else the real one. Prints the numbers it used, so the verdict can be
argued with. The slack rule is a heuristic: a measured saving rate (prove.py: saved $ / kWh) overrides it.
"""
import argparse
import csv
import json
import statistics
import sys
from datetime import datetime


def load(path):
    if path.endswith(".json"):
        rows = json.load(open(path))
    else:
        rows = list(csv.DictReader(open(path, newline="")))
    out = []
    for r in rows:
        kwh = next((float(r[k]) for k in ("kwh_needed", "kwh", "kWh", "kWhDelivered", "energy_kwh") if r.get(k) not in (None, "")), None)
        arr = r.get("arrival") or r.get("connectionTime")
        dep = r.get("user_stated_departure") or r.get("departure") or r.get("disconnectTime")
        if kwh is None or not arr or not dep:
            continue
        a, d = datetime.fromisoformat(str(arr)), datetime.fromisoformat(str(dep))
        out.append(((d - a).total_seconds() / 3600, kwh))
    if not out:
        sys.exit("no rows with arrival, departure and kWh")
    return out, any(r.get("user_stated_departure") for r in rows)


def verdict(sessions, p_max, spread, demand_charge, saving_rate=None):
    slack = sorted(dwell - kwh / p_max for dwell, kwh in sessions)
    med = statistics.median(slack)
    if med < 1.5:
        v = "not a fit"
    elif med >= 4 and (spread >= 0.04 or demand_charge) and (saving_rate is None or saving_rate >= 0.04):
        v = "cash tiers"
    else:
        v = "perks only"
    return v, med, slack


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--p-max", type=float, default=7.0, help="kW per port")
    ap.add_argument("--spread", type=float, help="tariff spread $/kWh (max - min); default: from data/tariff.json")
    ap.add_argument("--demand-charge", action="store_true", help="the site's bill carries a demand charge")
    ap.add_argument("--saving-rate", type=float, help="measured saving $/kWh from prove.py (saved $ / kWh); overrides the slack rule")
    a = ap.parse_args(argv)
    if a.spread is None:
        try:
            prices = json.load(open("data/tariff.json"))["price_per_kwh"]
            a.spread = max(prices) - min(prices)
        except Exception:  # noqa: BLE001
            a.spread = 0.0
    sessions, stated = load(a.path)
    v, med, slack = verdict(sessions, a.p_max, a.spread, a.demand_charge, a.saving_rate)
    n = len(slack)
    print(f"{a.path}: {n} sessions, {'stated' if stated else 'actual'} dwell median {statistics.median(d for d, _ in sessions):.1f} h, "
          f"kWh median {statistics.median(k for _, k in sessions):.1f}, slack median {med:.1f} h "
          f"(< 1 h: {sum(s < 1 for s in slack)}, 1-4 h: {sum(1 <= s < 4 for s in slack)}, >= 4 h: {sum(s >= 4 for s in slack)}); "
          f"tariff spread {100 * a.spread:.1f} c/kWh; demand charge {'yes' if a.demand_charge else 'no'}"
          + (f"; measured saving {100 * a.saving_rate:.1f} c/kWh" if a.saving_rate is not None else "; measured saving: not given (run prove.py)"))
    print(f"verdict: {v}")
    return v


if __name__ == "__main__":
    main()
