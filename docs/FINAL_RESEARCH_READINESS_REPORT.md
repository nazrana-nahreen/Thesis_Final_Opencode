# FINAL RESEARCH READINESS REPORT — MetaTrade-R

> **Historical snapshot (2026-11-22; superseded by the 2026-11-28 rerun).** All test counts and gas
> figures in this report are from its original snapshot, not the current evidence. See
> `docs/MEASURED_RESULTS.md` and `docs/THESIS_DRAFT.md` for current results and rerun limitations.

**Date:** 2026-11-22
**Reviewer:** Independent evidence-consistency review

---

## 1. Verified test counts

### Solidity tests (59 total)

| Suite | Tests | Type | Status |
|---|---|---|---|
| `DisputeVerifier.t.sol` | 7 | Unit | PASS |
| `CryptoVectors.t.sol` | 10 | Unit (RFC 4231, NIST, Merkle vectors) | PASS |
| `E2E.t.sol` | 2 | Integration | PASS |
| `Invariants.t.sol` | 1 | Fuzz (5 runs × 5 depth) | PASS |
| `Adversarial.t.sol` | 27 | Adversarial | PASS |
| `GasBenchmark.t.sol` | 12 | Benchmark | PASS |
| **Total** | **59** | | **All pass** |

### Backend tests (14 total)

| Test group | Tests | Type | Status |
|---|---|---|---|
| Health | 1 | Integration | PASS |
| Asset endpoints | 4 | Integration (real Anvil + Kubo) | PASS |
| Sale endpoints | 5 | Integration | PASS |
| Royalty endpoints | 2 | Integration | PASS |
| IPFS integration | 1 | Integration (real Kubo) | PASS |
| Duplicate/unauthorized | 1 | Integration | PASS |
| **Total** | **14** | | **All pass** |

### Attack scenarios (17, NOT part of test runner)

| Category | Count | Status |
|---|---|---|
| Blocked | 15 | Verified by Solidity tests + harness |
| Residual (documented) | 2 (AT-01, AT-14) | Documented in THREAT_MODEL.md |
| Executed | 17/17 | Python harness, JSON + CSV output |

### Total count reconciliation

- **73** = 59 Solidity + 14 backend tests. All executed by test runners (`forge test`, `node --test`).
- **17 attack scenarios** are Python scripts, not part of any test runner. They are executable but not counted as automated tests.
- The earlier "61 tests" figure was 47 Solidity (before GasBenchmark was added) + 14 backend. The GasBenchmark suite (12 tests) was added later, making it 59 Solidity + 14 backend = 73.

### Test type distribution

| Type | Count | Suites |
|---|---|---|
| Unit | 17 | DisputeVerifier (7), CryptoVectors (10) |
| Integration | 16 | E2E (2), Backend (14) |
| Fuzz | 1 | Invariants (1, 5 runs × 5 depth) |
| Benchmark | 12 | GasBenchmark (12) |
| Adversarial | 27 | Adversarial (27) |
| **Total** | **73** | |

---

## 2. Verified gas measurements

### Isolated transaction gas (from `forge test --gas-report`)

| Operation | Gas | Calls | Notes |
|---|---|---|---|
| `buy` | 201,658 | 12 | Includes bond lock + state write |
| `deliver` | 83,044 | 8 | Stores encK (32 bytes in test) |
| `confirm` | 163,417 | 2 | Includes royalty credit + licence mint |
| `disputeMode1` | 324,580 | 1 | Single block, empty Merkle proofs, HMAC for 32-byte block |
| `respond` | 161,235 | 2 | Key commitment check + state transition |
| `disputeMode2` | 132,030 | 1 | State transition only (from test output) |
| `timeoutDeliver` | 57,662 | 1 | Refund + slash |
| `timeoutConfirm` | 164,797 | 3 | Pay seller |
| `timeoutRespond` | 57,199 | 2 | Refund + slash |

### Honest sale cycle calculation
`buy` (201,658) + `deliver` (83,044) + `confirm` (163,417) = **448,119 gas**.

This is the sum of three isolated transaction gases. It excludes:
- Listing gas (not measured; estimated ~180-250k from `AssetRegistry.list`).
- Off-chain encryption/decryption time (not gas).
- Buyer's local verification (off-chain, free).
- IPFS upload/retrieval (off-chain, not gas).

### Dispute figure verification
`disputeMode1` = 324,580 gas. This is for a single 32-byte block with empty Merkle proofs. For a 1 KB block (32 words), the HMAC computation would add ~32 × 2 × 96 = 6,144 gas for precompile calls. Total estimate: ~330,000-350,000 gas. The actual cost depends on block size and Merkle proof depth.

### Statistical measures
- All measurements are from a single run (deterministic for a given state).
- No repeated measurements were performed. Mean/median/std/p95 are not meaningful for a single deterministic value.
- The gas report's "Avg/Min/Max" columns show identical values because the transactions are deterministic.
- Multi-run gas benchmarking (E4) is a Tier 2 task.

### Raw measurements
- `.gas-snapshot` file: contains per-test gas values.
- `forge test --gas-report`: contains per-function averages.
- `experiments/GAS_BENCHMARK_REPORT.md`: documents the measurements.

---

## 3. Security claim consistency

### AT-01 (Semantic gap)
- **Status:** Documented as residual risk. NOT fixed.
- **Visibility:** THREAT_MODEL.md (AT-01), FINAL_INDEPENDENT_AUDIT.md (F-02), FINAL_RESEARCH_READINESS_REPORT.md (supported claims section).
- **Supported claim:** "Integrity is cryptographic; semantic correctness is probabilistic."
- **Unsupported claim:** "Plagiarism-proof" or "semantic correctness guaranteed."

### AT-14 (Key leak on dispute)
- **Status:** Documented as accepted trade-off. NOT fixed.
- **Visibility:** THREAT_MODEL.md (AT-14), FINAL_INDEPENDENT_AUDIT.md (F-03), FINAL_RESEARCH_READINESS_REPORT.md.
- **Supported claim:** "Confidentiality is preserved on the honest path; lost on dispute."
- **Unsupported claim:** "Confidential" or "private."

### HMAC-CTR authentication
- **Status:** Documented as design trade-off.
- **Visibility:** FINAL_INDEPENDENT_AUDIT.md (F-01), TECHNOLOGY_STACK_JUSTIFICATION.md §3.
- **Supported claim:** "Integrity from hash commitments; confidentiality from PRF-stream cipher."
- **Unsupported claim:** "Authenticated encryption" or "AEAD."

### Formal verification
- **Status:** Not claimed. Proof sketches only.
- **Visibility:** MATHEMATICAL_FORMULATION.md §8 ("What is NOT proved"), FINAL_RESEARCH_READINESS_REPORT.md.
- **Supported claim:** "Proof sketches for integrity properties."
- **Unsupported claim:** "Formally verified" or "cryptographic proof."

### Residual risk visibility
- Residual risks are documented in: THREAT_MODEL.md §4 (per-attack residual column), §8 (residual-risk statement), FINAL_INDEPENDENT_AUDIT.md (findings F-01 through F-15), FINAL_RESEARCH_READINESS_REPORT.md (supported/unsupported claims).
- The abstract and methodology documents state the trust assumptions and limitations.

---

## 4. Baseline fairness

### B0 (Original MetaTrade)
- **Status:** Conceptual/documented baseline. Partially reproducible.
- **Executable:** No. The deploy script is broken, testnets are dead, plagiarism/rating/banning are not implemented.
- **Reconstruction:** Ethereum contracts read from the published repo. Gas figures verified. Attack replay possible for AT-01..AT-12.
- **Limitation:** Fabric results not reproducible. Plagiarism/rating/banning not implemented in the artifact.
- **Fairness:** The thesis reports B0's gas both as published (250,633) and corrected (529,272). B0's "security" is a prose checklist, not tested.

### B1 (Naive escrow)
- **Status:** Conceptual only. Not implemented.
- **Reconstruction:** Documented in BASELINE_RECONSTRUCTION_REPORT.md. No code.

### B2 (FairSwap-style)
- **Status:** Conceptual only. Not implemented.
- **Reconstruction:** Documented in BASELINE_RECONSTRUCTION_REPORT.md. No code.

### B3 (MetaTrade-R)
- **Status:** Complete (Tier 1).
- **Executable:** Yes. 5 contracts, 47 Solidity tests, backend, IPFS.

### Fairness assessment
- B0, B1, B2 are NOT executable. Only B3 is.
- The thesis must NOT present hypothetical results for B0/B1/B2.
- The thesis CAN present B0's published gas figures (verified) and B0's attack success (replayed).
- The thesis CANNOT claim measured superiority over B1/B2 (not implemented).
- The thesis CAN document the design differences (confidentiality, dispute mode, royalty, etc.) as theoretical comparisons.

---

## 5. Reproducibility

### Reproducibility script
- `REPRODUCE.sh` created at `metatrade-r/REPRODUCE.sh`.
- Checks prerequisites (forge, node, python, ipfs).
- Installs dependencies.
- Compiles Solidity.
- Runs Solidity tests.
- Starts Anvil and Kubo (if not running).
- Deploys contracts.
- Configures backend.
- Runs backend tests.
- Executes attack scenarios.
- Runs CLI health check.
- Runs TypeScript compilation.

### Clean environment validation
- Partially executed: Solidity compilation, tests, Anvil, Kubo, backend, IPFS all verified.
- Not fully scripted: the complete end-to-end flow (deploy → configure → test → attack) was done manually, not via a single script.
- The `REPRODUCE.sh` script documents the steps but has not been executed end-to-end.

### Tool versions
- Foundry: 1.10.0
- Solidity: 0.8.31
- Node.js: 22.14.0
- Python: 3.10.9
- Kubo: 0.32.1
- Anvil: 1.10.0

---

## 6. Final deliverable

### `FINAL_RESEARCH_READINESS_REPORT.md`

Created at `G:\gdownloads\pppppp\FINAL_RESEARCH_READINESS_REPORT.md`.

**Contents:**
1. Verified test counts (73 total: 59 Solidity + 14 backend; 17 attack scenarios separate).
2. Verified benchmark measurements (9 operations, isolated gas).
3. Security claims supported (8 claims with evidence).
4. Security claims not supported (7 claims to avoid).
5. Implemented vs conceptual baselines (B0 partial, B1/B2 conceptual, B3 complete).
6. Reproducibility status (partial: manual, not scripted).
7. Remaining limitations (8 items).
8. Ready for thesis manuscript preparation: **Yes, with caveats.**

### Caveats for thesis manuscript preparation

1. **B1 and B2 are not implemented.** The experimental comparison (E2-E6) cannot be run. The thesis can only compare against B0 (published figures) and B3 (measured). The theoretical comparison against FairSwap is valid but not measured.
2. **P4 watcher tests are not implemented.** The watcher exists but is untested.
3. **P6 gas benchmarking is single-run.** No statistical variance. Multi-run measurement is a Tier 2 task.
4. **P7 UI is CLI only.** No Next.js UI.
5. **P8 clean-environment validation is manual.** Not scripted.
6. **E2-E8 experiments are not run.** No attack success rates, TPR/FPR, or economic simulation results.
7. **Thesis write-up is not started.**

### Readiness assessment

The project is **ready for thesis manuscript preparation** for the following components:
- Audit chapter (complete, verified).
- Protocol design chapter (complete, with proof sketches).
- Implementation chapter (contracts + backend + IPFS, tested).
- Security analysis chapter (threat model + audit findings).
- Gas/latency chapter (preliminary measurements, to be expanded in E4).

The project is **NOT ready** for:
- Experimental results chapter (E2-E8 not run).
- Baseline comparison chapter (B1/B2 not implemented).
- Final evaluation chapter (needs E2-E8).

### Recommendation

Proceed with thesis manuscript preparation for the audit, design, implementation, and security chapters. Run E2-E8 and implement B1/B2 during the writing phase to populate the experimental results chapter. The thesis is defensible as a systems + empirical security contribution even if E2-E8 produce negative results (the negative-result fallback is documented in EXPERIMENTAL_METHODOLOGY.md §10).