#!/usr/bin/env python3
"""Executable attack matrix for MetaTrade-R (AT-01..AT-17, AT-30).

This replaces the previous harness, which returned hard-coded booleans, zero
gas and empty transaction hashes without executing anything. This runner
executes the real Foundry tests and reports their outcomes. It does not invent
results: an attack is only listed if a matching test exists, and a failed test
is reported as ``test_failed``.

Usage:
    python harness/attack_harness.py --system B3 --out harness/results
    python harness/attack_harness.py --system all
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, asdict

ATTACKS = {
    "AT-01": "Consistent garbage listing",
    "AT-02": "Inconsistent commitment",
    "AT-03": "Wrong key delivery",
    "AT-04": "Key before payment",
    "AT-05": "Re-initialisation",
    "AT-06": "Price change after deposit",
    "AT-07": "De-listed asset trading",
    "AT-08": "Overpayment stranding",
    "AT-09": "Refund wiping",
    "AT-10": ".transfer griefing",
    "AT-11": "False integrity dispute",
    "AT-12": "Fabricated chunk proof",
    "AT-13": "Dispute spam",
    "AT-14": "Leak-by-dispute",
    "AT-15": "Seller stalls after dispute",
    "AT-16": "Buyer stalls confirmation",
    "AT-17": "Timestamp manipulation",
    "AT-30": "Reentrancy on payout",
    "AT-31": "Late-respond time-bar",
    "AT-32": "Mode-2 re-challenge loop",
}

# Outcome of the attack *if the test passes*. For B1/B2 a passing test asserts
# that the attack works; for B3 it asserts that the defence holds.
OUTCOMES = {
    "B3": {
        "AT-01": ("succeeds", "residual: consistent garbage passes integrity; bond/fingerprint are off-chain"),
        "AT-02": ("blocked", "inconsistent plaintext/ciphertext proof refunds the buyer"),
        "AT-03": ("blocked", "mode-2 response rejects a key that does not match cK"),
        "AT-04": ("blocked", "no key material before payment; wrapped key posted at delivery"),
        "AT-05": ("blocked", "no initializer; constructor wires the contracts"),
        "AT-06": ("blocked", "price is snapshotted at buy; registry change has no effect"),
        "AT-07": ("blocked", "buy reverts on an inactive asset"),
        "AT-08": ("blocked", "exact msg.value required; no stranded excess"),
        "AT-09": ("blocked", "state guards reject confirm/deliver after a refund"),
        "AT-10": ("blocked", "call{value:} pays gas-heavy receivers"),
        "AT-11": ("blocked", "a false claim forfeits the buyer bond"),
        "AT-12": ("blocked", "a leaf not rooted in R_D/R_C reverts"),
        "AT-13": ("mitigated", "buyer bond is forfeited, not prevention; seller is not paid extra"),
        "AT-14": ("succeeds", "residual: K is public after a mode-2 dispute"),
        "AT-15": ("blocked", "timeoutRespond refunds after T_respond"),
        "AT-16": ("blocked", "timeoutConfirm pays the seller after T_confirm"),
        "AT-17": ("blocked", "window constants; boundary behaves at T+/-15s"),
        "AT-30": ("blocked", "reentrant confirm is rejected by nonReentrant"),
        "AT-31": ("blocked", "respond extends T_confirm by 1 day; timeoutConfirm blocked and buyer disputes Mode 1"),
        "AT-32": ("blocked", "max one Mode-2 challenge per sale; second disputeMode2 reverts with AlreadyChallenged"),
    },
    "B1": {
        "AT-01": ("succeeds", "no content verification; delivery hash is arbitrary"),
        "AT-03": ("succeeds", "no buyer-initiated refund; funds stay locked"),
        "AT-06": ("blocked", "price is snapshotted at buy"),
        "AT-08": ("succeeds", "overpayment is accepted and stranded"),
    },
    "B2": {
        "AT-01": ("succeeds", "commits to garbage consistently; no preview binding"),
        "AT-02": ("blocked", "one-block inconsistency proof refunds"),
        "AT-03": ("blocked", "wrong key exposes a mismatch; buyer refunded"),
        "AT-11": ("blocked", "consistent content reverts the claim"),
        "AT-12": ("blocked", "fabricated block fails the Merkle check"),
        "AT-14": ("succeeds", "K is revealed publicly on every sale"),
        "AT-15": ("blocked", "timeoutReveal refunds"),
        "AT-16": ("blocked", "timeoutConfirm pays the seller"),
    },
}

SPECIAL = {"B3": {"AT-30": "testReentrancy"}}
SUITES = {"B1": "test/Baselines.t.sol", "B2": "test/Baselines.t.sol", "B3": "test/Adversarial.t.sol"}


@dataclass
class Row:
    attack_id: str
    name: str
    system: str
    test: str
    status: str
    outcome: str
    note: str


def find_forge(explicit: str | None) -> str:
    if explicit:
        return explicit
    found = shutil.which("forge")
    if found:
        return found
    fallback = os.path.expanduser(r"~\.foundry\bin\forge.exe")
    if os.path.exists(fallback):
        return fallback
    sys.exit("forge not found; pass --forge or add Foundry to PATH")


def run_forge(forge: str, path: str) -> dict:
    proc = subprocess.run(
        [forge, "test", "--match-path", path, "--json"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0 and not proc.stdout.strip():
        sys.exit(f"forge test failed for {path}:\n{proc.stderr[-2000:]}")
    return json.loads(proc.stdout)


def collect(forge: str) -> dict[str, dict[str, dict]]:
    by_system: dict[str, dict[str, dict]] = {"B1": {}, "B2": {}, "B3": {}}
    baselines = run_forge(forge, SUITES["B1"])
    for suite in baselines.values():
        for test, result in suite.get("test_results", {}).items():
            m = re.match(r"test(B1|B2)_(AT\d\d)_", test)
            if m:
                by_system[m.group(1)][m.group(2).replace("AT", "AT-")] = {
                    "test": test,
                    "status": result.get("status"),
                }
    adversarial = run_forge(forge, SUITES["B3"])
    for suite in adversarial.values():
        for test, result in suite.get("test_results", {}).items():
            m = re.match(r"test(AT\d\d)_", test)
            if m:
                by_system["B3"][m.group(1).replace("AT", "AT-")] = {
                    "test": test,
                    "status": result.get("status"),
                }
            for attack, special_test in SPECIAL["B3"].items():
                if test.startswith(special_test + "("):
                    by_system["B3"][attack] = {"test": test, "status": result.get("status")}
    return by_system


def build_rows(by_system: dict[str, dict[str, dict]]) -> list[Row]:
    rows: list[Row] = []
    for system, tests in by_system.items():
        for attack, name in ATTACKS.items():
            found = tests.get(attack)
            if not found:
                rows.append(Row(attack, name, system, "", "not_executed", "not_tested", "no matching Foundry test"))
                continue
            passed = found["status"] == "Success"
            if not passed:
                rows.append(Row(attack, name, system, found["test"], "failed", "test_failed", "test did not pass; see forge"))
                continue
            outcome, note = OUTCOMES[system].get(attack, ("unknown", ""))
            rows.append(Row(attack, name, system, found["test"], "passed", outcome, note))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--system", choices=["B1", "B2", "B3", "all"], default="all")
    ap.add_argument("--out", default="harness/results")
    ap.add_argument("--forge", default=None)
    args = ap.parse_args()

    forge = find_forge(args.forge)
    os.makedirs(args.out, exist_ok=True)
    by_system = collect(forge)
    rows = build_rows(by_system)
    if args.system != "all":
        rows = [r for r in rows if r.system == args.system]

    for system in sorted({r.system for r in rows}):
        subset = [r for r in rows if r.system == system]
        with open(os.path.join(args.out, f"{system}_results.json"), "w", encoding="utf-8") as f:
            json.dump([asdict(r) for r in subset], f, indent=2)
        with open(os.path.join(args.out, f"{system}_results.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(asdict(subset[0]).keys()))
            w.writeheader()
            w.writerows([asdict(r) for r in subset])
        counts = {}
        for r in subset:
            counts[r.outcome] = counts.get(r.outcome, 0) + 1
        print(f"{system}: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
        for r in subset:
            print(f"  {r.attack_id}  {r.outcome:<16} {r.test or '(not tested)'}")

    print(f"\nwrote {args.out}/<system>_results.json and .csv")
    print("Only rows with a matching Foundry test have an outcome; the rest are not_executed.")


if __name__ == "__main__":
    main()
