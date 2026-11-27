# CHANGELOG: MetaTrade-R Implementation Fixes & Verification

## [2026-11-27] - Task 1 & Task 2 Contract Fixes and Verification Sync

### Task 1: Fix `respond()` / `T_confirm` Window Extension & Mode 1 Key Enforcement
- **Location:** `src/SaleEscrow.sol` (`respond`, `disputeMode1`)
- **Before:**
  - `respond(K, N, s)` set `sl.state = State.DELIVERED` but did not touch `sl.tConfirm`.
  - If a seller responded close to or after `tConfirm`, the buyer could not file `disputeMode1` (blocked by `block.timestamp > sl.tConfirm` check), allowing the seller to settle via `timeoutConfirm()`.
  - In `disputeMode1()`, the branch `!(sl.state == State.CHALLENGED && sl.keyRevealed)` was dead code because `respond()` had already transitioned state to `State.DELIVERED`. Furthermore, when `sl.keyRevealed` was true, the contract never checked whether the proof's key matched the revealed key `revealedK`.
- **After:**
  - Added named constant `uint64 public constant CONFIRM_EXTENSION = 1 days;`.
  - On `respond()`, `sl.tConfirm = max(sl.tConfirm, block.timestamp + CONFIRM_EXTENSION)`.
  - In `disputeMode1()`, removed dead state condition and added strict verification:
    ```solidity
    if (sl.keyRevealed) {
        if (proof.K != sl.revealedK || proof.N != sl.revealedN || proof.s != sl.revealedS) {
            revert InvalidKey();
        }
    }
    ```
- **Tests Added (`test/Adversarial.t.sol`):**
  - `testRespondNearTConfirmBuyerFilesMode1()`: Buyer successfully disputes after late seller response.
  - `testSellerCannotTimeoutConfirmBeforeExtendedWindow()`: Seller `timeoutConfirm()` reverts with `Early()` during extension.
  - `testDisputeMode1KeyRevealedEnforced()`: Inconsistent key parameters revert with `InvalidKey()`.
  - `testAT31_LateRespondTimeBar()`: Explicit scenario AT-31 added to attack matrix.

---

### Task 2: Checks-Effects-Interactions (CEI) Reordering in `_settle()` and `_refund()`
- **Location:** `src/SaleEscrow.sol` (`_settle`, `_refund`, `disputeMode1`)
- **Before:**
  - External calls (`_pay(sl.seller, ...)`, `_pay(sl.buyer, ...)`) occurred before internal state transitions (`sl.state = State.SETTLED`, `sellerCredit[sl.seller] += bondSeller`).
- **After:**
  - In `_settle()`:
    1. Effects: `sl.state = State.SETTLED`, `sellerCredit[seller] += bondSeller`, `emit Settled(...)`.
    2. Interactions: `_pay(seller, sellerAmount)`, `_pay(address(royalty), parentAmount)`, `royalty.credit(...)`, `_pay(buyer, bondBuyer)`, `licenceToken.mint(buyer, assetId)`.
  - In `_refund()`:
    1. Effects: `sl.state = State.REFUNDED`, `emit Refunded(...)`.
    2. Interactions: `_pay(buyer, refundAmount)`.
  - In `disputeMode1()` consistent settlement branch: state and seller credits updated prior to external transfers.
- **Invariants & Tests Added:**
  - Verified 3 invariants at 256 runs / depth 256 (65,536 calls): `invariant_fundsConservation`, `invariant_singleState`, `invariant_terminalAbsorbing` all pass.
  - Added `testReentrancySellerPayout()` with `contract ReentrantSeller` asserting reentrancy attempts fail.

---

### Task 3: Deterrence Bound vs Required Bond (`experiments/e7_economics.py`)
- **Before:**
  - Table reported raw formula values (`0.43x` at $P_d=0.7$, `0.11x` at $P_d=0.9$) as "deterred at solvent bond", contradicting the protocol specification $b_s = \max(p, \frac{1-P_d}{P_d}p)$ where bond cannot be $< 1.00\times$.
- **After:**
  - Split into two distinct columns:
    - `deterrence_bound`: raw theoretical ratio $\frac{1-P_d}{P_d}$.
    - `required_bond`: enforced protocol multiple $\max(1.0, \frac{1-P_d}{P_d})$, bounded from below by $1.00\times$.
  - Regenerated `experiments/results/e7/e7_summary.json` and `e7_grid.csv`.

---

### Task 4: Consistent Gas Reporting (`experiments/run_chain_experiments.mjs`)
- **Before:**
  - Operations mixed repetitions: $n=30, 40, 50$ for normal ops and $n=10$ for dispute paths.
- **After:**
  - Normal operations filter on happy-path runs: exact $n=30$ for all normal operations (`list`, `buy`, `deliver`, `confirm`).
  - Dispute operations filter on dispute-path runs: exact $n=10$ for all dispute operations (`disputeMode1`, `disputeMode2`, `respond`).
  - Added automated per-sale cycle metrics for B1, B2, and B3.
  - Regenerated `experiments/results/chain/summary.json`.

---

### Task 5 / Tasks A–G: Follow-up Verification, Re-challenge Cap & Pipeline Re-execution
- **Task A (Backend verification):** Verified `node --test tests/backend.test.mjs` against live Anvil + Kubo + Fastify server (`14 passed, 0 failed`).
- **Task B (`Invariants.t.sol` Handler extension):** Extended `Handler` to all 10 protocol selectors (`listAsset`, `buyAsset`, `deliver`, `confirm`, `disputeMode1` consistent & inconsistent, `disputeMode2`, `respond` valid & invalid key, `timeoutDeliver`, `timeoutConfirm`, `timeoutRespond`). All 3 invariants pass at 256 runs / depth 256 (65,536 calls).
- **Task C (`GasBenchmark.t.sol` audit):** Replaced stub bodies in `testGasBuy` (520 -> 227,179 gas), `testGasDisputeMode1_Inconsistent` (322 -> 311,718 gas), and `testGasRoyaltyWithdraw` (608 -> 58,299 gas); isolated `testGasLicenceMint` (265,724 -> 64,769 gas) and added state assertions across all 12 benchmarks.
- **Task D (`SaleEscrow.sol` Mode-2 re-challenge cap, AT-32):**
  - *Before:* After a valid `respond()`, buyer could invoke `disputeMode2()` again to extend `tConfirm` indefinitely.
  - *After:* Added `bool mode2Challenged` in `Sale` and `error AlreadyChallenged()`, capping Mode-2 challenges at 1 per sale (`AT-32` blocked in `testAT32_RechallengeLoop` and `attack_harness.py`). Note: `disputeMode2` gas updated to 55,321 and `respond` gas to 141,636.4.
- **Test suite:** 99 tests pass (78 Foundry + 14 backend + 7 watcher) [old: 93 tests].
- **Attack matrix:** 17 blocked, 1 mitigated, 2 residual across 20 scenarios (`AT-01..17, AT-30..32`) [old: 15 blocked, 1 mitigated, 2 residual].
- **B3 per-sale cycle gas:** 455,384 mean gas (457,508 median) [old: 456,691 gas].
- **Mode-1 dispute gas:** 243,048 mean gas (243,050 median) [old: 241,278 gas].
- **E5 Sequential throughput (median of 3 idle fresh-Anvil runs):** 7.20 sales/s, 138.89 ms mean cycle time (Run 1: 8.76 sales/s / 114.18 ms; Run 2: 6.79 sales/s / 147.35 ms; Run 3: 7.20 sales/s / 138.89 ms). Local, single host, machine-dependent.
