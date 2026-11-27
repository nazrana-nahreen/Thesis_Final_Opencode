# RISK AND FEASIBILITY ASSESSMENT

**Purpose:** to state honestly what can go wrong, what the fallbacks are, and why the thesis is still defensible if the ambitious parts fail.

---

## 1. Risk register

Likelihood and impact are rated Low / Medium / High. Score is `L×I` on a 1–3 scale.

| ID | Risk | Category | L | I | Score | Mitigation | Trigger for fallback |
|---|---|---|---|---|---|---|---|
| **R1** | B0 cannot be reconstructed (broken deploy script, dead testnets) | Technical | High | Medium | 6 | Fresh deploy script against published contracts; static audit as backup | 2 weeks without a working B0 |
| **R2** | HMAC-SHA256 in Solidity is buggy or too expensive | Technical | Medium | High | 6 | Cross-language test vectors; RFC 2104 implementation; gas measured early (M2) | Dispute gas > 150k |
| **R3** | `SaleEscrow` exceeds the 24 KB contract size limit | Technical | Medium | Medium | 4 | Library separation; split into `SaleCore` + `DisputeModule`; optimizer tuning | Compiler error at M3 |
| **R4** | IPFS unavailable or unpinned during experiments | Technical | Medium | Medium | 4 | Local Kubo for all experiments; Pinata for testnet; content pinned before sale | Repeated fetch failures |
| **R5** | Testnet faucet or RPC instability | Technical | Medium | Low | 2 | Local Anvil for all primary results; testnet only for a latency arm | No testnet access for 1 week |
| **R6** | Plagiarism benchmark too large for available compute | Scope | Medium | Medium | 4 | Stratified 10% subset; classical hashes only if no GPU | No GPU by week 19 |
| **R7** | Scope creep into Tier 2/3 delays the write-up | Scope | High | High | 9 | Hard rule: Tier 1 is the thesis; Tier 2/3 never delay writing | Week 20 with Tier 1 incomplete |
| **R8** | Novelty challenged because CRC is FairSwap-like | Novelty | High | High | 9 | Explicit positioning; lean on the audit and the confidentiality delta; pre-submission searches | A direct precedent for the confidentiality delta is found |
| **R9** | Economic model parameters are unstable or unmeasurable | Analytical | Medium | Medium | 4 | Report analytic conditions even if simulation is inconclusive | Simulation fails to converge |
| **R10** | Statistical power too low with `n = 30` | Methodological | Medium | Medium | 4 | Exact tests; bootstrap; effect sizes; report discordant counts | — |
| **R11** | AIGC samples raise copyright concerns | Ethical/Legal | Low | Medium | 2 | Use public datasets with clear licences; synthetic samples; no real user data | — |
| **R12** | Results contradict the hypotheses | Scientific | Medium | Low | 2 | Report as a negative result; the thesis is designed to survive this | — |
| **R13** | Version drift breaks reproducibility | Reproducibility | Medium | Medium | 4 | Pin everything; Docker; `make doctor`; CI | A second person cannot reproduce |
| **R14** | Supervisor or examiner expects a "new protocol" | Expectation | Medium | High | 6 | State the contribution type up front; the audit is the anchor | — |
| **R15** | Time overrun | Schedule | Medium | High | 6 | Tiered scope; weekly cadence; write during the work | Week 20 review |

**Top three risks: R7 (scope creep), R8 (novelty challenge), R1/R2 (technical blockers).** The plan is built around them.

---

## 2. Feasibility by component

| Component | Effort (person-weeks) | Skill | Hardware | External dependency | Feasible? |
|---|---|---|---|---|---|
| Audit of B0 | 3 | Solidity reading, scripting | Laptop | Public repos | **Yes** |
| Crypto core (HMAC, Merkle) | 3 | Solidity, TS | Laptop | None | **Yes** |
| Contracts (Tier 1) | 3 | Solidity, Foundry | Laptop | None | **Yes** |
| Off-chain api/verifier | 3 | TS, Python | Laptop | IPFS | **Yes** |
| Minimal UI / CLI | 1 | TS | Laptop | None | **Yes** |
| Attack suite | 3 | Python, Solidity | Laptop | None | **Yes** |
| Gas/latency/storage | 2 | Python | Laptop | Anvil, Sepolia | **Yes** |
| Plagiarism benchmark | 3 | Python, ML | Laptop CPU or free GPU | Datasets | **Yes, with subset** |
| Economic simulation | 1 | Python | Laptop | None | **Yes** |
| Write-up | 3 | Writing | — | — | **Yes** |
| **Total** | **25** | | | | **Tight but feasible** |

The 25 person-weeks against a 24-week calendar assumes ≈1.05 FTE. That is aggressive for a student with other courses. The buffer is one week, which is thin. **Mitigation:** the audit (WP1) and the crypto core (WP2) are independent and can start in parallel; the write-up overlaps with M7–M8.

---

## 3. Kill criteria and pivots

A "kill criterion" is a pre-committed decision point, so the project does not drift.

| Criterion | Decision | Pivot |
|---|---|---|
| B0 not reproducible by week 4 | Stop trying to run B0 end-to-end | Static audit + attack replay on a minimal harness; state the limitation |
| Dispute gas > 150k by week 7 | The on-chain recomputation is too expensive | Increase block size; or move to Mode 2 + oracle; report the trade-off |
| Tier 1 not end-to-end by week 13 | The implementation is behind | Drop the web UI; CLI only; freeze features |
| No GPU by week 19 | Embeddings unavailable | Classical hashes on the full set + embeddings on a 10% subset |
| Week 20, Tier 1 incomplete | Scope must shrink | Freeze at contracts + attack suite + gas; drop latency/throughput/plagiarism to "future work" |
| Direct precedent found for the confidentiality delta | Novelty claim weakens | Re-anchor on the audit + economic model; demote C2 to "adaptation" |

**What is never cut:** the audit, the integrity protocol, the attack suite, and the gas measurement. These four are the thesis.

---

## 4. Contingency plans

### 4.1 If the on-chain HMAC is too expensive

- Increase `β` from 1 KB to 4 KB (fewer, larger blocks; fewer HMAC calls per dispute? No — more HMAC calls per block). Actually the trade-off is: larger `β` means more HMAC calls per dispute but a smaller leaf list. The gas is dominated by `β/32` HMACs. So **smaller `β` is cheaper for disputes**, but the leaf list grows. The optimum is around `β = 256`–`512`. The plan measures this (ablation A-7) rather than guessing.
- If still too expensive, fall back to Mode 2 (seller reveals; an off-chain verifier checks) and report the trust delta. The thesis then becomes "the cost of disputes without a trusted arbitrator," which is still a contribution.

### 4.2 If the plagiarism benchmark is too heavy

- Run classical hashes (pHash, dHash, aHash, wHash, PDQ) on the full set. These are CPU-cheap.
- Run CLIP/DINOv2 on a stratified 10% subset.
- Report the subset size and the reduced power. Do not claim full-set embedding results.

### 4.3 If the economic simulation is inconclusive

- Report the analytic IC conditions (which are derivable without simulation).
- Report the `P_d → b_s` curve from the measured `P_d`.
- Drop the agent-based simulation, or present it as illustrative.

### 4.4 If the testnet is unavailable

- All primary results on Anvil (deterministic, reproducible).
- Report testnet latency only if available; otherwise state that it was not measured.

---

## 5. Ethics and data

| Issue | Position |
|---|---|
| **Human subjects** | None. No user study. No personal data. |
| **Real money** | None. Testnet and local chain only. |
| **AIGC samples** | Public datasets with clear licences (DiffusionDB, GenImage, CIFAKE) and synthetic samples. No copyrighted material beyond dataset terms. |
| **Copyright of generated content** | The thesis does not adjudicate copyright; it studies *marketplace mechanics*. This is stated in the scope. |
| **Dual use** | The protocol could be used to sell infringing content. The thesis studies the mechanism, not the content; the plagiarism module is a mitigation, not a guarantee. |
| **Disclosure** | The audit reports what the published artifact does, with the caveat that it may not be the artifact used for the paper's measurements. It does not allege misconduct. |
| **Data retention** | Experiment logs contain no personal data; they are archived for reproducibility. |

---

## 6. Why this is a defensible BSc CSE contribution

A BSc thesis is judged on whether it demonstrates independent, rigorous, original work within a bounded scope — not on whether it invents a primitive. This thesis satisfies that test on five grounds.

### 6.1 It establishes a fact that was not previously established

The base paper claims trust-free trading; the published artifact does not bind payment to the product. This is a **specific, reproducible, consequential finding**. It is the kind of result that changes how a reader interprets a published system. It is verified against the code, not asserted from a reading of the paper.

### 6.2 It produces a working artifact

Contracts, an off-chain stack, an attack harness, and a reproducibility package. Artifacts are a legitimate contribution and are reusable by later students.

### 6.3 It has a theoretical component

Fairness and termination definitions, dispute soundness and completeness (with proof sketches), and an incentive-compatibility model that links bond sizing to fingerprint robustness. The `P_d → b_s` relation is a genuine analytical result, even if simple.

### 6.4 It has an empirical component

Gas, latency, throughput, storage, TPR/FPR/EER, and attacker ROI — all with confidence intervals and seeds. The measurements answer "what does correctness cost?", which is the question a practitioner actually asks.

### 6.5 It is honest about what it is not

It does not claim a new primitive. It does not claim trust-free operation. It does not claim plagiarism-proofing. It states its trust assumptions, its residual risks, and its negative-result fallback. That honesty is itself a marker of research maturity, and it is what makes the claims that *are* made credible.

### 6.6 The examiner's likely questions, and the answers

| Question | Answer |
|---|---|
| "Isn't this just FairSwap?" | The exchange core is adapted from FairSwap, and the thesis says so. The deltas are per-buyer confidentiality, the two-mode dispute, the AIGC licence layer, the economic model, and the audit. |
| "Isn't the AIGC marketplace space crowded?" | Yes — DECADE, Story Protocol, AuraMint. The thesis does not claim the marketplace; it claims the *content-binding dispute* and the *audit*. |
| "Your cipher isn't standard." | Correct. It is chosen because the EVM can recompute it, which is what makes disputes decidable without a trusted arbitrator. Mode B (AES-GCM + oracle) is specified and measured as the alternative. |
| "You don't prove security." | Correct. The thesis gives proof sketches for the integrity properties and states that they are sketches. It does not claim a computational proof. |
| "Your semantic layer is weak." | Correct, and measured. `P_d` is reported, and the bond is sized from it. The thesis does not claim semantic correctness is solved. |
| "Why not Fabric?" | The published Fabric results are not reproducible from the artifact; rebuilding them would not strengthen the core claim. The audit documents the gap. |
| "What if the attacks don't succeed on B0?" | Then the audit's central finding is wrong, and the thesis reports that. The design is falsifiable by construction. |
| "What if your protocol is too expensive?" | Then the thesis reports the cost of correctness as a negative result. That is a contribution, not a failure. |

---

## 7. Final feasibility verdict

**Feasible with discipline.** The critical path is the audit, the crypto core, the escrow, and the attack suite — all laptop-scale, all with known techniques, all testable in isolation. The risky parts (plagiarism ML, L2, semantic oracle) are explicitly Tier 2/3 and can be dropped without touching the central claim.

The main threat is not technical difficulty; it is **scope creep** and **novelty framing**. Both are addressed by pre-committed tiers and by the contribution ledger in `VERIFIED_NOVELTY_AND_CONTRIBUTIONS.md`.

**Recommendation:** proceed to implementation only after the approval gate in `FINAL_RESEARCH_DESIGN.md` §11 is signed, and begin with M1 (the audit), not with the new contracts. The audit de-risks the thesis and produces the first chapter.
