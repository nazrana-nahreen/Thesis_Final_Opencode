# EXPERIMENTAL METHODOLOGY

**Purpose:** to specify experiments that can objectively show whether MetaTrade-R improves on the base paper, and to pre-register the analysis so that results cannot be cherry-picked after the fact.

**Status:** all numeric expectations below are **hypotheses**. None has been measured. The thesis reports measured values with confidence intervals, including results that contradict the hypotheses.

---

## 1. Research questions → experiments

| RQ | Experiment | Primary output |
|---|---|---|
| **RQ1** Which MetaTrade guarantees are enforced? | **E1** Audit + attack replay on B0 | Attack success table, code evidence |
| **RQ2** Can payment be bound to a pre-sale commitment? | **E2** Correctness + **E3** attack suite on B3 | Attack success rate, proof soundness |
| **RQ3** What does it cost? | **E4** Gas, **E5** latency/throughput, **E6** storage/compute | Gas/op, p50/p95 latency, TPS, bytes, ms |
| **RQ4** When is honesty rational? | **E7** Economic simulation | Attacker ROI vs bond, `P_d` |
| **RQ5** How robust is plagiarism detection? | **E8** Fingerprint benchmark | TPR/FPR/EER, evasion rate |

---

## 2. Systems under test

| ID | System | What it is | Why included |
|---|---|---|---|
| **B0** | MetaTrade (published) | Reconstructed Ethereum path from `MetaTrade-Ethereum` | The thing being improved |
| **B1** | Naive escrow | Buyer pays; seller delivers; no verification; refund only if seller volunteers | Lower bound on cost; shows what "no verification" buys |
| **B2** | FairSwap-style | Public key reveal at settlement; contract recomputes a chunk | Closest fair-exchange baseline |
| **B3** | MetaTrade-R | CRC with per-buyer key wrapping and two-mode dispute | The proposed system |

**B0 reconstruction note.** The Fabric path is **not** reconstructed: the published Caliper config runs `listItem` only and the 50-orderer compose file has orderers 31–50 commented out. The thesis states that B0's Fabric figures cannot be reproduced from the artifact and evaluates only the Ethereum path. This is itself part of RQ1.

**B2 note.** B2 is implemented only to the extent needed for a cost and security comparison (single asset, single buyer, public reveal). It is not a full FairSwap reimplementation. The thesis says so.

---

## 3. Attack suite

Each attack is a script with a machine-checkable success predicate. The harness records success/failure, attacker gas, defender gas, and wall-clock time.

| ID | Attack | Success predicate |
|---|---|---|
| AT-01 | Consistent garbage listing | Buyer pays and receives a file that passes integrity but differs from the preview beyond `τ` |
| AT-02 | Inconsistent commitment | Buyer pays and integrity check passes |
| AT-03 | Wrong key delivery | Buyer cannot decrypt and seller is paid without a valid reveal |
| AT-04 | Key before payment | Buyer obtains `K` and a refund |
| AT-05 | Re-initialisation | Attacker changes owner/price/royalty |
| AT-06 | Price change after deposit | Buyer cannot settle and cannot cancel |
| AT-07 | De-listed asset trading | A sale settles on an inactive asset |
| AT-08 | Overpayment stranding | Excess payment is not recoverable |
| AT-09 | Refund wiping | A prior refund is lost |
| AT-10 | `.transfer` griefing | Payment to a contract wallet fails permanently |
| AT-11 | False integrity dispute | Buyer obtains a refund with correct content |
| AT-12 | Fabricated chunk proof | Contract accepts a proof not rooted in `R_D`/`R_C` |
| AT-13 | Dispute spam | Seller incurs unbounded cost per spam dispute |
| AT-14 | Leak-by-dispute | Content becomes public without the buyer paying the bond |
| AT-15 | Seller stalls after dispute | Buyer remains escrowed past `T_max` |
| AT-16 | Buyer stalls confirmation | Seller remains unpaid past `T_max` |
| AT-17 | Timestamp manipulation | A window expires early by > `δ_t` |
| AT-18 | Geometric evasion | Plagiarised asset is not flagged at FPR = 1% |
| AT-19 | Style mimicry | Derivative not flagged (expected: succeeds; reported as limitation) |
| AT-20 | Sybil reporting | Rival de-listed at cost below `b_r` |
| AT-21 | Fingerprint spoofing | False fingerprint survives a challenge |
| AT-22 | Sybil rating | Reputation inflated by sockpuppets |
| AT-23 | Royalty evasion | Child sets `r = 0` |
| AT-24 | Royalty drain | Parent sets `r > 1` |
| AT-25 | IPFS unpinning | Buyer cannot retrieve after payment |
| AT-26 | Gateway substitution | Buyer accepts altered bytes |
| AT-27 | Front-end substitution | Buyer pays for a different asset |
| AT-28 | Privacy harvesting | Observer links a buyer to a purchase |
| AT-29 | Cross-chain replay | A signature is reused on another deployment |
| AT-30 | Reentrancy on payout | Funds withdrawn twice |

**Success-rate reporting.** For each attack and each system: `k/n` successes with a Wilson 95% interval. `n = 30` independent trials with fresh state.

---

## 4. Metrics

| Metric | Definition | Unit | Aggregation |
|---|---|---|---|
| **ASR** | Attack success rate | fraction | Wilson 95% CI |
| **Gas/op** | Gas per function call | gas | mean, median, p95, SD over 30 runs |
| **Gas/cycle** | Gas for listing + buy + deliver + confirm + withdraw | gas | mean ± bootstrap 95% CI |
| **Latency** | Wall-clock from tx submission to receipt | ms | p50, p95, p99 over 100+ runs |
| **Throughput** | Settled sales per second at saturation | TPS | mean ± 95% CI over 5-min runs |
| **Storage** | Bytes pinned on IPFS + bytes on-chain | bytes | exact |
| **Compute** | Encryption/decryption/Merkle time | ms | mean ± 95% CI |
| **TPR@FPR** | True-positive rate at a fixed false-positive rate | fraction | with CI |
| **EER** | Equal error rate | fraction | with CI |
| **Evasion** | Fraction of transformed positives missed | fraction | per transformation |
| **Attacker ROI** | `(gain − cost)/cost` | ratio | per attack, per bond |

**Gas measurement rule.** Every gas measurement starts from a fresh state (new sale, cold storage) so that warm/cold effects are controlled. The harness records both cold and warm variants; the thesis reports cold as the headline and warm in an appendix.

**Latency measurement rule.** Local Anvil latency is reported separately from testnet latency; they are not pooled.

---

## 5. Design and statistics

### 5.1 Design

- **Factor 1:** system ∈ {B0, B1, B2, B3}.
- **Factor 2:** attack ∈ {AT-01…AT-30}.
- **Factor 3 (cost only):** file size ∈ {64 KB, 256 KB, 1 MB, 5 MB, 10 MB}; buyers `n ∈ {1, 10, 100, 1000}`.
- **Repetitions:** 30 per cell for binary outcomes; 30 for gas; 100+ for latency.
- **Randomisation:** trial order randomised with a fixed seed; fresh state per trial.
- **Seeds:** `seeds.json` records seeds `0…29` for trials and `1000…` for the plagiarism split.

### 5.2 Statistics

| Comparison | Test | Report |
|---|---|---|
| Paired binary (same attack, B0 vs B3) | McNemar | discordant counts, exact p |
| Paired continuous (gas, latency) | Wilcoxon signed-rank | median difference, 95% CI |
| Independent continuous | Mann–Whitney U | rank-biserial effect size |
| Proportions | Wilson interval | 95% CI |
| Multiple comparisons | Holm–Bonferroni | adjusted p |
| Correlation (`P_d` vs bond) | Spearman | ρ, 95% CI |

**Small-sample rule.** With `n = 30`, asymptotic tests are fragile. The thesis reports exact discordant counts and bootstrap intervals, and does not claim significance from a p-value alone. Effect sizes are reported alongside p-values.

**Pre-registration.** The hypotheses in §10 are frozen before the experiments run. Any hypothesis added afterwards is labelled exploratory.

---

## 6. Plagiarism experiment (E8)

### 6.1 Datasets

| Dataset | Use |
|---|---|
| **Copydays** | Strong/weak geometric transformations; near-duplicate retrieval |
| **INRIA Holidays** | Diverse scenes; false-positive stress |
| **Oxford5k** | Landmark images; geometric stress |
| **DiffusionDB** (subset) | AIGC positives |
| **GenImage** | Real vs generated; distribution shift |
| **CIFAKE** | Real vs generated; small-scale sanity check |

### 6.2 Transformations

JPEG (q = 90, 70, 50, 30); resize (0.5×, 0.75×, 1.5×); crop (5%, 10%, 20%); rotate (±5°, ±15°); horizontal flip; border (5%, 10%); brightness/contrast (±20%); Gaussian noise (σ = 2, 5, 10); Gaussian blur (3×3, 5×5); combinations of two and three.

### 6.3 Methods

| Method | Type | Why |
|---|---|---|
| pHash (DCT) | classical | The base paper's choice |
| dHash, aHash, wHash | classical | Cheap baselines |
| PDQ | classical (Meta) | Industry baseline |
| CLIP embedding | learned | Semantic similarity |
| DINOv2 embedding | learned | Strong visual similarity |
| Ensemble (pHash + PDQ + DINOv2) | hybrid | The proposed detector |

### 6.4 Protocol

1. Split each dataset into calibration (40%), validation (20%), test (40%), stratified by identity.
2. Choose `τ` on validation to achieve FPR = 1%.
3. Report TPR, FPR, EER, AUC on test.
4. Report per-transformation recall and the evasion rate.
5. Report the threshold sensitivity curve (`τ` vs TPR/FPR).
6. Report the **false-accusation rate** at the operating point, because it drives the bond in C4.

### 6.5 Adversarial arm (if time permits)

- Bit-flip optimisation against pHash (white-box).
- PGD-style perturbation against the CLIP/DINOv2 embedding (bounded `ℓ∞`).
- Report the perturbation budget at which the detector fails.
- If the adversarial arm is not completed, it is reported as future work, not omitted silently.

### 6.6 What E8 must not do

- It must not tune `τ` on the test set.
- It must not report only the best transformation.
- It must not claim "robust" from a single dataset.

---

## 7. Ablations

| Ablation | Removes | Question |
|---|---|---|
| **A-1** | Seller bond | Does the attack rate change? (Expected: semantic attacks increase) |
| **A-2** | Challenge window (instant settle) | How much latency does the window cost? |
| **A-3** | Royalty split | Gas attributable to royalty |
| **A-4** | Fingerprint / preview | Semantic detection collapses to zero |
| **A-5** | Mode 1 (only Mode 2) | Cost of seller-dependent resolution |
| **A-6** | Mode 2 (only Mode 1) | Behaviour when the key is wrong |
| **A-7** | Block size 256 / 1024 / 4096 | Dispute gas vs leaf-list size |
| **A-8** | Single hash instead of Merkle tree | Proof cost vs no-proof cost |
| **A-9** | Per-buyer re-encryption (MetaTrade mode) | Storage/bandwidth penalty |

Each ablation is a build flag or a separate deployment; results are reported in one table.

---

## 8. Environment and reproducibility

### 8.1 Hardware

- Primary: student laptop, 8+ cores, 16 GB RAM, SSD.
- Optional: one cloud GPU (Colab free tier or equivalent) for the embedding experiments.
- No Fabric, no Kubernetes, no multi-host cluster.

### 8.2 Software (pinned)

| Component | Version |
|---|---|
| Foundry | latest stable, pinned in `foundry.toml` |
| Solidity | 0.8.24 |
| OpenZeppelin | 5.x |
| Node.js | 20 LTS |
| Python | 3.11 |
| Anvil | pinned with Foundry |
| Kubo (IPFS) | pinned |
| NumPy / SciPy / statsmodels | pinned in `requirements.txt` |
| PyTorch / timm | pinned; CPU or CUDA |
| imagehash / Pillow / OpenCV | pinned |

### 8.3 Reproducibility artefacts

- `docker-compose.yml` for chain + IPFS + api + verifier.
- `Makefile` targets: `make chain`, `make ipfs`, `make test`, `make bench`, `make figures`.
- `seeds.json` with all seeds.
- Raw JSON logs per run, archived under `results/`.
- A `REPRODUCE.md` with the exact command sequence.
- A CI job that runs the unit and invariant tests on every push.

### 8.4 Determinism

- Anvil with a fixed mnemonic and `--timestamp` control where possible.
- Fixed trial order.
- Gas measured with the optimizer settings pinned.
- Any non-deterministic component (network latency) is measured separately and reported with its distribution.

---

## 9. Threats to validity

| Type | Threat | Mitigation |
|---|---|---|
| **Construct** | Attack success predicates may not capture real adversaries | Predicates are tied to the threat model; each is justified in `THREAT_MODEL.md` |
| **Internal** | Gas varies with storage warmth and state | Fresh state per run; cold/warm reported separately |
| **External** | Local chain and single host are not mainnet | Testnet arm; L2 arm; explicit scope statement |
| **Conclusion** | Multiple comparisons inflate false positives | Holm–Bonferroni; effect sizes; pre-registered hypotheses |
| **Conclusion** | Small `n` | Exact tests; bootstrap CIs; report discordant counts |
| **Reproducibility** | Version drift | Pinned versions; Docker; seeds |
| **Measurement** | Latency dominated by local machine | Report local and testnet separately; do not pool |
| **Ecological** | Synthetic AIGC samples may not match real markets | Multiple datasets; report per-dataset results |

---

## 10. Pre-registered hypotheses

These are **hypotheses**, not findings. The thesis reports whether each is supported, refuted, or inconclusive.

| ID | Hypothesis | Falsified if |
|---|---|---|
| **H1** | B0 is vulnerable to ≥ 6 of the 12 settlement attacks (AT-01…AT-12); B3 is vulnerable to 0 (modulo `negl`) | B0 < 6, or B3 > 0 |
| **H2** | B3 honest-path gas ≤ 2× B0's full cycle | B3 > 2× B0 |
| **H3** | B3 dispute gas ≤ 3× B3 confirm gas | B3 dispute > 3× confirm |
| **H4** | At `n = 1000`, B3 stores ≥ 100× fewer bytes than B0 for a 5 MB asset | Ratio < 100 |
| **H5** | pHash TPR@1%FPR under geometric transformations < 50% | TPR ≥ 50% |
| **H6** | The ensemble improves TPR@1%FPR by ≥ 20 percentage points over pHash | Improvement < 20 pp |
| **H7** | Required bond `b_s` scales as `(1-P_d)/P_d`; at `P_d = 0.5`, `b_s ≥ p` | Measured `b_s` deviates by > 20% from the model |
| **H8** | Attacker ROI is ≤ 0 for all integrity attacks under the specified bonds | Any integrity attack has ROI > 0 |

**What would falsify the thesis as a whole.** If B3's integrity attacks succeed at a non-negligible rate, or if its honest-path cost is so high that the bond and gas exceed the asset price for realistic assets, the central claim ("binding is achievable at acceptable cost") fails. The thesis would then report a negative result: the cost of correctness for AIGC licences. That is still a publishable contribution, and it is stated in advance so the result cannot be reframed after the fact.

---

## 11. Experiment schedule (summary)

| Exp | Weeks | Depends on |
|---|---|---|
| E1 audit + replay | 3–5 | B0 reconstruction |
| E2 correctness | 11–13 | Tier-1 contracts |
| E3 attack suite | 13–15 | E2 |
| E4 gas | 15–16 | E2 |
| E5 latency/throughput | 16–17 | E4 |
| E6 storage/compute | 17–18 | E2 |
| E7 economic simulation | 18–19 | E3, E8 |
| E8 plagiarism benchmark | 19–21 | datasets, GPU |
| Ablations | 21–22 | E2–E4 |
| Figures + write-up | 22–24 | all |
