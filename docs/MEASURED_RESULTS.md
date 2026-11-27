# Measured results (this build)

Generated from the repository state on 2026-11-27. Every number below is read
from an artefact in `experiments/results/` or from a test run on this machine.
Nothing here is projected or copied from the earlier single-run tables.

## 0. Environment and commands

- Windows, Node v22.14.0, Python 3.10.9, Foundry/Anvil 1.10.0.
- Solidity 0.8.31, `optimizer = true`, `optimizer_runs = 200`, `via_ir = true`
  (`foundry.toml`).
- Chain: local Anvil, chain id 31337, fresh state per experiment.
- Tests: `forge test`; `node --test tests/backend.test.mjs`;
  `node --test tests/watcher.test.mjs`.
- One-command check: `node scripts/verify_all.mjs` (Foundry, watcher, backend);
  `--full` adds the attack matrix and E4–E8. It reports a skipped backend as a
  failure, not as a pass.
- Gas/latency: `node experiments/run_chain_experiments.mjs --runs 30 --latency 100`.
- Compute/storage: `node experiments/e6_storage_compute.mjs`.
- Economics: `python experiments/e7_economics.py`.
- Fingerprints: `python experiments/e8_fingerprint.py --n-images 80 --seed 1234`.

## 1. Correctness (E2)

| Suite | Tests | Result |
|---|---:|---|
| Foundry (`forge test`) | 78 | 78 pass |
| Backend integration (`tests/backend.test.mjs`) | 14 | 14 pass |
| Watcher integration (`tests/watcher.test.mjs`) | 7 | 7 pass |
| **Total** | **99** | **99 pass** |

The Foundry suite includes three stateful invariants (256 runs, depth 256, 65,536 calls across all
10 Handler actions including disputes, responses, and timeouts),
the two baseline contracts (B1, B2), and fixed `GasBenchmark.t.sol` measurements. The watcher suite deploys fresh contracts
on a dedicated Anvil instance (port 8546), advances time with `evm_increaseTime`
and asserts on-chain state after submission.

## 2. Attack matrix (E3)

`python harness/attack_harness.py --system all` executes the Foundry attack
tests and writes `harness/results/{B1,B2,B3}_results.{json,csv}`. A row is only
listed when a matching test exists; the rest are `not_executed`.

B3, AT-01..AT-17, AT-30, AT-31, and AT-32:

| Outcome | Count | Attacks |
|---|---:|---|
| blocked | 17 | AT-02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 15, 16, 17, 30, 31, 32 |
| mitigated | 1 | AT-13 (buyer bond forfeited; spam is costly, not impossible) |
| succeeds (residual) | 2 | AT-01 (consistent garbage), AT-14 (key public after dispute) |

B1 (naive escrow): 3 tested attacks succeed (AT-01, AT-03, AT-08), 1 blocked
(AT-06); the other 16 are not implemented in B1 and are not tested.
B2 (FairSwap-lite): 2 succeed (AT-01, AT-14), 6 blocked (AT-02, 03, 11, 12,
15, 16); the rest are not tested.

AT-18..AT-29 are **not** covered by executable tests in this build; they are
protocol/economics/fingerprint claims, not settlement-contract attacks. Do not
report them as measured.

## 3. Gas (E4, 30 repetitions for normal ops, 10 for disputes)

Cold local chain, one transaction per row, 100-byte wrapped key for B3.
Every normal operation has exact n=30; dispute operations have exact n=10.

| System | Operation | n | mean | median | SD | p95 |
|---|---|---:|---:|---:|---:|---:|
| B1 | list | 30 | 50,855 | 50,855 | 0 | 50,855 |
| B1 | buy | 30 | 122,914 | 122,914 | 0 | 122,914 |
| B1 | deliver | 30 | 52,941.2 | 52,944 | 5.16 | 52,944 |
| B1 | confirm | 30 | 42,005 | 42,005 | 0 | 42,005 |
| B2 | list | 30 | 142,283.8 | 142,287 | 8.30 | 142,287 |
| B2 | buy | 30 | 125,469 | 125,469 | 0 | 125,469 |
| B2 | revealKey | 30 | 53,262.4 | 53,264 | 4.15 | 53,264 |
| B2 | confirm | 30 | 42,114 | 42,114 | 0 | 42,114 |
| B2 | dispute | 10 | 205,122.8 | 205,124 | 3.79 | 205,124 |
| B3 | list | 30 | 181,646.0 | 181,652 | 8.19 | 181,652 |
| B3 | buy | 30 | 182,350.0 | 181,780 | 3,122.02 | 181,780 |
| B3 | deliver | 30 | 145,295.3 | 147,989 | 14,754.19 | 147,989 |
| B3 | confirm | 30 | 127,738.6 | 127,739 | 2.19 | 127,739 |
| B3 | disputeMode1 | 10 | 243,047.6 | 243,050 | 5.06 | 243,050 |
| B3 | disputeMode2 | 10 | 55,321.0 | 55,321 | 0 | 55,321 |
| B3 | respond | 10 | 141,636.4 | 141,640 | 8.10 | 141,640 |

Per-sale cycle (buy + deliver/revealKey + confirm, excluding one-off listing):

| System | Mean gas | Median gas | Ratio to B1 |
|---|---:|---:|---:|
| B1 | 217,860.2 | 217,863 | 1.00 |
| B2 | 220,845.4 | 220,847 | 1.01 |
| B3 | 455,383.9 | 457,508 | 2.09 |

B3 pays about 2.1x the per-sale gas of the unverified baselines. That is the
price of commitments, a 100-byte wrapped key, licence minting, royalty
accounting and the dispute path.

Caveat: Anvil gas is deterministic for identical calldata, so the small SDs for
`buy`/`confirm` are expected. The 3,122 SD on `buy` and 14,754 SD on `deliver`
come from cold/warm storage and different path positions, not from chain
congestion. These are local-chain numbers; mainnet L1 gas is higher and
calldata-dependent.

## 4. Latency and sequential throughput (E5, idle fresh-Anvil host)

Three independent 100-cycle runs were executed sequentially on an idle local
fresh Anvil node (`--port 8547`, no competing `forge`/`node` load), with each
receipt awaited:

- Run 1: **114.18 ms** mean cycle, **8.76 sales/s**
- Run 2: **147.35 ms** mean cycle, **6.79 sales/s**
- Run 3: **138.89 ms** mean cycle, **7.20 sales/s**
- **Median across 3 runs**: **138.89 ms** mean cycle time, **7.20 sales/s**

This is a local, single host, machine-dependent measurement with instant mining.
It is not a network throughput claim and says nothing about concurrent users or
L1 block times. Differences across runs reflect local RPC scheduling variance,
not contract changes.

## 5. Off-chain compute and storage model (E6)

Measured on this machine (idle host re-run) with the TypeScript reference implementation.
Deterministic byte counts and storage model are unchanged from the prior run; wall-clock compute
timings reflect idle-host execution:

| Input | Encryption time (mean of 10) | Blocks `m` |
|---|---:|---:|
| 64 KiB | 21.96 ms | 64 |
| 256 KiB | 81.32 ms | 256 |
| 1 MiB | 244.49 ms | 1,024 |
| 5 MiB | 1,414.49 ms | 5,120 |
| 10 MiB | 3,495.70 ms | 10,240 |

- ECIES key wrap (secp256k1, `eciesjs`): **128 bytes** (unchanged), **96.03 ms** mean over
  100 runs (SD 7.00 ms). This is a JS implementation cost, not a bound.
- One-block consistency verification: **0.547 ms** mean (100 runs).
- Logical on-chain record per asset: 367 bytes (the raw sum of the `Asset` struct fields in `AssetRegistry.sol`: 20 bytes seller address + 9 * 32 bytes commitments/hashes + 4 bytes m + 4 bytes blockSize + 8 bytes price + 2 bytes royaltyBps + 32 bytes parentAssetId + 1 byte active + 8 bytes listedAt), or 399 bytes when including the 32-byte `mapping(uint256 => Asset)` lookup key slot (unchanged).

Storage model: the ciphertext is stored once on IPFS in B0, B2 and B3. The
published Ethereum B0 stores a per-buyer key string
(`customerAddrToData[buyer].encryptedSymmetricKey`); B3 stores a 128-byte
wrapped key per sale. At 1,000 buyers the model (5 MiB asset, 128-byte B0 key
assumption) is:

| System | Total bytes |
|---|---:|
| B0 | 5,370,880 |
| B2 | 5,242,912 |
| B3 | 5,370,880 |

**There is no storage saving to claim.** An earlier draft claimed a 976x
reduction by assuming B0 re-uploads the full asset per buyer; that is not what
the published contract does. The comparison with B0 is about verification,
dispute rights and royalties, not bytes.

## 6. Bond economics (E7)

Closed-form model, not a chain measurement:
`E[pi] = (1-Pd)(p-cg) - Pd(bs+cd)`, `bs = max(p, ((1-Pd)/Pd)p)`.
The deterrence bound is the raw ratio `(1 - Pd)/Pd`. The required bond multiple
applies the `max(1.0, (1 - Pd)/Pd)` rule so that the bond is never less than
the asset price (`1.00x`).

| Pd | deterrence bound | required bond | deterred at solvent bond |
|---:|---:|---:|---|
| 0.01 | 99.00x | 99.00x | yes |
| 0.02 | 49.00x | 49.00x | yes |
| 0.05 | 19.00x | 19.00x | yes |
| 0.10 | 9.00x | 9.00x | yes |
| 0.20 | 4.00x | 4.00x | yes |
| 0.30 | 2.33x | 2.33x | yes |
| 0.50 | 1.00x | 1.00x | yes |
| 0.70 | 0.43x | 1.00x | yes |
| 0.90 | 0.11x | 1.00x | yes |

The deterrence result is conditional on the model: risk-neutral attacker,
proportional costs, detection probability known, and a solvent bond. It does
not establish that sellers actually post such bonds, nor that `Pd` is known.
At `Pd = 0.5` the attacker's expected profit is exactly zero before costs, so
the "yes" is weak. Notice that for `Pd > 0.5`, the raw deterrence bound drops
below 1.00x (e.g. 0.43x, 0.11x), but the protocol requires `bs >= p` (1.00x),
so the required bond multiple is bounded from below by 1.00x.

## 7. Fingerprint pilot (E8)

80 Picsum photographs (Unsplash), 512x512, seeds 1000..1079. Identity split
32/16/32 calibration/validation/test, seed 1234. 28 transformations, 896 test
positive pairs, 494 test negative pairs. Thresholds selected on validation at
FPR closest to 1%.

| Method | TPR@1% FPR (95% CI) | Test FPR | EER | AUC |
|---|---|---:|---:|---:|
| pHash | 78.3% [75.5, 80.9] | 2.02% | 12.2% | 0.9351 |
| dHash | 78.6% [75.8, 81.1] | 2.23% | 12.7% | 0.9374 |
| aHash | 67.9% [64.7, 70.8] | 0.20% | 14.0% | 0.9283 |
| wHash | 61.4% [58.2, 64.5] | 0.20% | 18.8% | 0.9117 |
| Ensemble | 76.8% [73.9, 79.4] | 1.01% | 10.7% | 0.9586 |

Worst transformations (ensemble): `rotate_m15` 0.0%, `rotate_p15` 0.0%,
`flip_h` 9.4%. Geometric-only TPR: pHash 57.0%, ensemble 54.6%.

This is a **negative result for classical hashes as an originality detector**.
The pre-registered hybrid (pHash + PDQ + DINOv2) was not built, so H6 is
untested. H5 (pHash geometric TPR < 50%) is refuted at 57.0%. No AIGC dataset
(Copydays, Holidays, Oxford5k, GenImage, DiffusionDB) was evaluated. Do not
cite these numbers as AIGC robustness.

Full tables and per-transformation counts: `experiments/results/e8/E8_REPORT.md`.

## 8. Corrections made in this round

1. `harness/attack_harness.py` was a stub: it returned hard-coded booleans,
   zero gas and empty transaction hashes without sending anything. Replaced
   with a runner that executes the real Foundry tests and reports only what
   exists.
2. `scripts/ganache_demo.mjs` sent plain ETH to an externally-owned "vault"
   with hand-written selectors in the calldata and printed simulated balances.
   Replaced with `scripts/ganache_demo.mjs` + `scripts/ganache_lib.mjs`, which
   deploy the real contracts and assert real state on Ganache or Anvil.
3. `crypto/encrypt.ts` generated a 16-byte `N`, but `SaleEscrow.respond`
   takes `bytes32`; backend-produced proofs would revert. Fixed to 32 bytes.
4. The storage claim (976x) assumed B0 re-uploads the asset per buyer. The
   published contract stores a per-buyer key string, so the claim is withdrawn.
   The corrected model shows storage parity.
5. The attack count "15 blocked, 2 residual" mixed AT-13 into "blocked" and
   omitted AT-30. Correct count: 15 blocked, 1 mitigated, 2 residual across
   AT-01..17 and AT-30.
6. Gas is now 30 repetitions per operation (10 for dispute paths) with mean,
   median, SD and p95, not a single cold run.
7. Royalty credits were recorded but not funded: `_settle` called
   `royalty.credit(...)` without transferring the ETH to the splitter, so
   `withdraw()` would have reverted. The escrow now pays the splitter first,
   the splitter has `receive()`, and the test withdraws the credit and checks
   the recipient balance.
8. Two invariants were strengthened. `invariant_fundsConservation` now checks
   that the escrow balance equals locked stakes plus unspent seller credit, not
   `balance >= 0`; `invariant_terminalAbsorbing` now uses a handler snapshot of
   terminal states to detect a sale that leaves `SETTLED`/`REFUNDED`.
9. `SaleEscrow.respond()` extension and Mode-1 key check (Task 1): on `respond()`,
   `tConfirm = max(tConfirm, block.timestamp + CONFIRM_EXTENSION)` (`CONFIRM_EXTENSION = 1 days`),
   preventing a seller from stalling until `T_confirm` and settling via `timeoutConfirm` (`AT-31`).
   Separately, in `disputeMode1()`, if `keyRevealed` is true, the contract strictly validates that the proof's
   key parameters `(K, N, s)` match `(revealedK, revealedN, revealedS)`.
10. `SaleEscrow._settle()` checks-effects-interactions reordering (Task 2): updated all internal
    state (`state = State.SETTLED`, seller bond credited) before external calls (`_pay`, licence minting).
    Added reentrancy regression test (`testReentrancySellerPayout`).
11. Consistent gas reporting (Task 4): all normal operations now have exact n=30, and dispute operations
    have exact n=10, avoiding sample-size mixing in Table 6.3 and 6.4.
12. Mode-2 re-challenge cap (`AT-32`, Task D): added `Sale.mode2Challenged` flag in `SaleEscrow.sol`
    reverting repeat `disputeMode2()` calls with `AlreadyChallenged()`, extended `Invariants.t.sol`
    to all 10 Handler actions (65,536 calls pass), audited/fixed `GasBenchmark.t.sol` stub tests,
    confirmed E8 unchanged (seed 1234 deterministic) and E6 byte counts unchanged with updated idle timings.

## 9. What is still missing

- The eight-chapter thesis draft is `docs/THESIS_DRAFT.md`. It is a draft: the
  chapter text exists, but the candidate/supervisor fields are placeholders and
  the references still need a final publisher check.
- E8 is a pilot: no AIGC dataset, no PDQ/CLIP/DINOv2, one split, 32 test
  identities. The full experiment is still blocked on datasets and weights.
- Watcher: reorg/rollback handling is not implemented; checkpoints assume a
  linear chain. `scanTimeouts` cannot know the caller, so seller-only
  `timeoutConfirm` is surfaced and rejected per action if submitted by another
  account.
- `scripts/verify_all.mjs` exists and passes on this host, but it has not been
  run on a clean machine or in a container. The evidence is from this machine.
- The Next.js UI was deleted and has not been recreated (optional).
