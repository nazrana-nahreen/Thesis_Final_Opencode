# IMPLEMENTATION ROADMAP

**Purpose:** to convert the design into a sequenced plan with explicit exit criteria, so that the thesis can be completed on a laptop within two semesters and can degrade gracefully if a component proves too costly.

**Total budget:** 24 weeks, part-time (≈15–20 h/week), one student.
**Critical path:** audit → crypto core → escrow → attack suite → measurements → plagiarism → write-up.

---

## 1. Principles

1. **Audit first.** The audit is the strongest original contribution and the least risky. It is completed before any new code is written.
2. **Tiered scope.** Tier 1 alone is a complete thesis. Tiers 2 and 3 add depth but are not required for the central claim.
3. **Test before measure.** No benchmark runs until unit and invariant tests pass.
4. **Measure before claim.** No number enters the thesis until it has a CI and a seed.
5. **One language per job.** Solidity for contracts, TypeScript for the API/UI, Python for measurement and ML. No polyglot sprawl.

---

## 2. Tiers

### Tier 1 — thesis core (must ship)

| Component | Deliverable |
|---|---|
| Audit | Attack replay on B0, code evidence, reproducible scripts |
| Crypto library | HMAC-CTR keystream, Merkle tree, commitments (Solidity + TS) |
| `AssetRegistry` | Listing, commitments, active flag |
| `SaleEscrow` | Buy, deliver, confirm, Mode 1, Mode 2, respond, timeouts |
| `DisputeVerifier` | Merkle + consistency check, fuzz-tested |
| `LicenseToken` | ERC-1155 licence balances |
| `RoyaltySplitter` | Pull-payment split |
| Off-chain | `api` (encrypt, Merkle, IPFS, ECIES), `verifier` (proofs, watcher) |
| Minimal UI | CLI or a single-page Next.js app; no design polish |
| Harness | AT-01…AT-17, gas, latency, storage |
| Write-up | Audit, protocol, measurements, limitations |

### Tier 2 — depth (should ship)

| Component | Deliverable |
|---|---|
| `PlagiarismRegistry` | Bonded reports, on-chain Hamming |
| `Reputation` | Commit-reveal, stake-weighted |
| Plagiarism benchmark | E8, all datasets and transformations |
| Economic simulation | E7, attacker ROI |
| Ablations | A-1…A-9 |

### Tier 3 — stretch (nice to have)

| Component | Deliverable |
|---|---|
| `StorageBond` | Pinning bond |
| Semantic dispute oracle | Bonded assertion + committee fallback |
| L2 arm | Base Sepolia cost comparison |
| Style embeddings | DINOv2 style similarity, AT-19 |
| Full UI | Marketplace, dashboards, dispute flow |

---

## 3. Milestones

### M0 — Setup (week 1)

**Deliverables:** repository, `foundry.toml`, `package.json`, `requirements.txt`, `docker-compose.yml`, CI skeleton, `seeds.json`.
**Exit:** `forge test` runs; `docker compose up` starts Anvil + Kubo; CI is green on an empty test.

### M1 — Audit of B0 (weeks 2–4)

**Deliverables:**
- Reconstructed B0 deployment (fixed deploy script, local chain).
- Reproduced gas table from `gas-report.txt`.
- Attack scripts AT-01…AT-12 against B0.
- Evidence table: claim → file/function → observed behaviour.

**Exit:** at least 6 of AT-01…AT-12 succeed on B0, each with a reproducible script and a log. Gas figures match the published `gas-report.txt` within measurement error.

**Risk:** B0's deploy script is broken (constructor mismatch, dead testnets). Mitigation: write a fresh deploy script against the published contracts; document the mismatch as an audit finding.

### M2 — Crypto core (weeks 5–7)

**Deliverables:**
- `keystream.sol`: HMAC-SHA256-CTR, tested against a TypeScript reference.
- `Merkle.sol`: tree construction, proof generation (TS), proof verification (Solidity).
- `commitments.ts`: `hD`, `hC`, `cK`, leaf lists.
- Cross-language test vectors (TS produces, Solidity verifies; Python produces, Solidity verifies).

**Exit:** 1,000 random cross-language vectors pass; fuzz tests on Merkle proofs pass; gas per proof measured.

**Risk:** HMAC in Solidity is fiddly (padding, key length). Mitigation: implement HMAC exactly as RFC 2104, test against Node's `crypto.createHmac`.

### M3 — Contracts (weeks 8–10)

**Deliverables:**
- `AssetRegistry`, `SaleEscrow`, `DisputeVerifier`, `LicenseToken`, `RoyaltySplitter`.
- Unit tests per function.
- Invariant tests (funds conservation, single terminal state, no double payout, bond solvency, royalty sum).
- Slither clean.

**Exit:** all invariants hold over 10,000+ fuzz runs; no high/medium Slither findings; `forge snapshot` committed.

**Risk:** contract size limit. Mitigation: library separation; optimizer runs tuned; if still too large, split `SaleEscrow` into `SaleCore` + `DisputeModule`.

### M4 — End-to-end local (weeks 11–13)

**Deliverables:**
- `api`: encrypt, Merkle, IPFS pin, ECIES wrap, tx builder.
- `verifier`: fetch, verify, find inconsistency, build proof, watch.
- CLI or minimal UI: list → buy → deliver → confirm/dispute.
- E2 correctness run: 100 honest sales, 20 dishonest, all resolved correctly.

**Exit:** honest path succeeds 100/100; each dishonest path resolves in the buyer's favour; no manual intervention.

### M5 — Attack suite and gas (weeks 14–16)

**Deliverables:**
- AT-01…AT-17 on B0, B1, B2, B3.
- E3 results with Wilson CIs.
- E4 gas: per operation and per full cycle, cold and warm, 30 runs.
- McNemar and Wilcoxon tables.

**Exit:** ASR table complete; gas table complete; every number has a CI and a seed.

### M6 — Latency, throughput, storage (weeks 17–18)

**Deliverables:**
- E5: p50/p95/p99 latency on Anvil and Sepolia; TPS at saturation.
- E6: bytes on IPFS and on-chain for file sizes 64 KB–10 MB and buyers 1–1000; encryption/decryption time.
- The `O(L + nκ)` vs `O(nL)` comparison.

**Exit:** storage ratio at `n = 1000` measured; latency distributions reported separately for local and testnet.

### M7 — Plagiarism and economics (weeks 19–21)

**Deliverables:**
- E8: TPR/FPR/EER for pHash, dHash, aHash, wHash, PDQ, CLIP, DINOv2, ensemble; per-transformation recall; calibration curves.
- `PlagiarismRegistry` integration.
- E7: attacker ROI simulation as a function of bond and `P_d`.
- The `P_d → b_s` curve.

**Exit:** at least three detectors benchmarked on at least three datasets; the bond curve plotted; false-accusation rate reported.

**Risk:** GPU unavailable. Mitigation: run embeddings on a stratified 10% subset on CPU; report the subset and the reduced power.

### M8 — Ablations, figures, write-up (weeks 22–24)

**Deliverables:**
- A-1…A-9.
- All figures and tables.
- Thesis draft: introduction, related work, audit, design, implementation, evaluation, limitations, conclusion.
- Reproducibility package.

**Exit:** every claim in the thesis traces to a table, a figure, or a proof sketch; every table has a seed and a script.

---

## 4. Work breakdown (person-weeks)

| Work package | Weeks | Depends on |
|---|---|---|
| WP1 Audit | 3 | — |
| WP2 Crypto core | 3 | — |
| WP3 Contracts | 3 | WP2 |
| WP4 Off-chain | 3 | WP3 |
| WP5 Attack suite | 3 | WP1, WP4 |
| WP6 Performance | 2 | WP4 |
| WP7 Plagiarism | 3 | WP4 |
| WP8 Economics | 1 | WP5, WP7 |
| WP9 Ablations | 1 | WP5, WP6 |
| WP10 Write-up | 3 | all |
| **Total** | **25** | (1 week buffer) |

---

## 5. Definition of done

A component is done when:

1. It has a unit test and, where stateful, an invariant test.
2. It has a gas snapshot.
3. It has a documented interface (NatSpec or JSDoc).
4. It is exercised by at least one end-to-end test.
5. It appears in the reproducibility package.
6. Its limitations are recorded in `RISK_AND_FEASIBILITY_ASSESSMENT.md`.

A result is done when:

1. It has a script, a seed, and a raw log.
2. It has a CI or an effect size (or both).
3. It is reported whether or not it supports the hypothesis.
4. It is reproducible by a second person from `REPRODUCE.md`.

---

## 6. Fallbacks and kill criteria

| Risk | Trigger | Fallback |
|---|---|---|
| B0 reconstruction fails | Deploy script cannot be made to work in 2 weeks | Audit the contracts statically + replay attacks on a minimal harness; state the limitation |
| HMAC in Solidity too costly | Dispute gas > 150k | Increase block size to 4 KB; or move to Mode 2 + oracle; document the trade-off |
| Contract size limit | `SaleEscrow` > 24 KB | Split into `SaleCore` + `DisputeModule`; or drop Tier 2 |
| Off-chain too slow | End-to-end not working by week 13 | CLI-only; drop the web UI |
| Plagiarism GPU unavailable | No GPU by week 19 | CPU subset; classical hashes only; drop embeddings |
| L2 unavailable | Faucet/testnet issues | Drop the L2 arm; report L1 only |
| Economic simulation inconclusive | Model parameters unstable | Report the analytic conditions only; drop the simulation |
| Time overrun | Week 20 with Tier 1 incomplete | Freeze scope at Tier 1 minus the web UI; write up what exists |

**Hard rule:** the thesis is defensible with Tier 1 alone. Tier 2 and 3 are never allowed to delay the write-up.

---

## 7. Skill requirements and mitigations

| Skill | Required level | Mitigation if weak |
|---|---|---|
| Solidity | Intermediate | OpenZeppelin patterns; Foundry book; pair review |
| Cryptography | Conceptual | Use standard primitives; no custom crypto beyond the documented PRF construction |
| TypeScript | Intermediate | Typed interfaces; viem docs |
| Python / ML | Intermediate | Use `imagehash`, `timm`; no model training |
| Statistics | Basic | Pre-registered tests; bootstrap; consult a statistician once |
| Academic writing | Intermediate | Outline early; write the audit chapter first |

---

## 8. Weekly cadence

- **Monday:** plan the week; update the risk register.
- **Wednesday:** checkpoint; run the test suite; commit.
- **Friday:** write 500 words of thesis prose; update figures; log results.
- **Every 4 weeks:** supervisor review against the milestone exit criteria.

The cadence exists so that the thesis is written *during* the work, not after it. A common failure mode is leaving 24 weeks of writing to the last three.
