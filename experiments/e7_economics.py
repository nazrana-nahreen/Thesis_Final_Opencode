#!/usr/bin/env python3
"""E7: economic simulation of the bond condition.

No blockchain is used. The script evaluates the closed-form model

    E[pi] = (1 - P_d)(p - c_g) - P_d (b_s + c_d)

for a grid of detection probabilities, prices and bond policies, and writes the
attacker ROI and the minimum solvent bond. Results are analytic, not measured.
"""

import argparse
import csv
import json
import os
from dataclasses import dataclass, asdict


@dataclass
class Row:
    price_eth: float
    p_detect: float
    cost_garbage_eth: float
    cost_defence_eth: float
    deterrence_bound: float
    required_bond_multiple: float
    bond_eth: float
    expected_profit_eth: float
    attacker_roi: float
    honest_profit_eth: float
    deterred: bool


def simulate(price: float, p_d: float, c_g: float, c_d: float, c_h: float) -> Row:
    # Raw deterrence bound: (1 - P_d) / P_d
    det_bound = (1.0 - p_d) / p_d if p_d > 0 else float("inf")
    # Required bond multiple: max(1.0, (1 - P_d) / P_d) ensuring required bond >= 1.00x
    req_multiple = max(1.0, det_bound)
    bond = req_multiple * price
    expected = (1.0 - p_d) * (price - c_g) - p_d * (bond + c_d)
    # Cost of the attack is the bond at risk (plus garbage cost); gain is the
    # price if undetected. ROI is expected net profit over capital at risk.
    capital = bond + c_g
    roi = expected / capital if capital > 0 else float("inf")
    honest = price - c_h
    return Row(
        price_eth=price,
        p_detect=p_d,
        cost_garbage_eth=c_g,
        cost_defence_eth=c_d,
        deterrence_bound=round(det_bound, 4) if p_d > 0 else None,
        required_bond_multiple=round(req_multiple, 4) if p_d > 0 else None,
        bond_eth=round(bond, 6),
        expected_profit_eth=round(expected, 8),
        attacker_roi=round(roi, 6),
        honest_profit_eth=round(honest, 8),
        deterred=expected < 0,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="experiments/results/e7")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    prices = [0.01, 0.05, 0.1, 1.0]
    pds = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]
    # Fractions of the price; keeps the example scale-free.
    c_g = 0.0
    c_d = 0.1
    c_h = 0.1

    rows = [simulate(p, pd, c_g * p, c_d * p, c_h * p) for p in prices for pd in pds]

    # Bond multiplier table (independent of price when costs are proportional).
    multipliers = [
        {
            "p_detect": pd,
            "deterrence_bound": round((1.0 - pd) / pd, 4) if pd > 0 else None,
            "required_bond_multiple": round(max(1.0, (1.0 - pd) / pd), 4) if pd > 0 else None,
            "deterred_at_required_bond": simulate(1.0, pd, 0.0, 0.1, 0.1).deterred,
        }
        for pd in pds
    ]

    with open(os.path.join(args.out, "e7_grid.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(asdict(rows[0]).keys()))
        w.writeheader()
        w.writerows([asdict(r) for r in rows])

    summary = {
        "model": "E[pi] = (1-Pd)(p-cg) - Pd(b_s+cd); b_s = max(p, ((1-Pd)/Pd)p)",
        "assumptions": {
            "rational_risk_neutral": True,
            "cg_fraction_of_price": c_g,
            "cd_fraction_of_price": c_d,
            "ch_fraction_of_price": c_h,
            "note": "analytic model, not a chain measurement",
        },
        "bond_multipliers": multipliers,
        "grid": [asdict(r) for r in rows],
    }
    with open(os.path.join(args.out, "e7_summary.json"), "w") as f:
        json.dump(summary, f, indent=2)

    print(f"{'P_d':<6} {'Deterrence bound':<18} {'Required bond':<16} {'Deterred at required bond'}")
    for m in multipliers:
        print(f"{m['p_detect']:<6.2f} {m['deterrence_bound']:>14.2f}x   {m['required_bond_multiple']:>12.2f}x   {str(m['deterred_at_required_bond']):<10}")
    print(f"wrote {args.out}/e7_summary.json and e7_grid.csv")


if __name__ == "__main__":
    main()
