# FINAL RESEARCH DESIGN

**Project:** MetaTrade-R
**Status:** Design phase complete — awaiting implementation approval
**Date:** 2026-11-22
**Base paper:** Truong, Le & Le, "Trust-Free Blockchain Framework for AI-Generated Content Trading and Management in Metaverse," *IEEE Access*, vol. 12, 2024, pp. 41815–41828. DOI `10.1109/ACCESS.2024.3376509`
**Governing constraint:** No implementation code is written until the approval gate at the end of this document set is passed.

---

## 1. Purpose of this document

This is the master design document. It fixes the thesis claim, the research questions, the contributions, the scope boundary, and the protocol at a level of precision that the remaining nine documents elaborate. Every later document must be consistent with this one; where a later document refines a decision here, the refinement is recorded in §3 (design-correction log).

---

## 2. Thesis statement (one paragraph)

MetaTrade (IEEE Access 2024) claims trust-free trading of AI-generated content, but its settlement check compares a buyer-computed hash against a hash the seller computed over the seller's own ciphertext. That check establishes self-consistency, not binding to the advertised product: a seller can upload arbitrary bytes, publish their hash, and be paid. This thesis (i) produces a reproducible, code-level audit establishing that the published guarantees are not enforced, and (ii) designs, implements and measures **MetaTrade-R**, a settlement protocol in which the buyer's payment is bound to a content commitment made *before* the sale, and in which any inconsistency is provable on-chain without a trusted arbitrator, without a zero-knowledge proof, and without revealing the content in the honest path. The thesis then quantifies what this costs in gas, latency, storage and residual trust.

---

## 3. Design-correction log (decisions reversed since the previous analysis)

This log exists because the previous analysis contained a technically weak proposal. It is not preserved for continuity.

### DC-1. Sampled Merkle verification is removed as the soundness mechanism

**Previous proposal:** buyer samples *k* chunks after delivery, checks Merkle proofs, and the seller is slashed if a sample fails.

**Why it fails:**

1. **The contract cannot check decryption.** A Merkle proof shows that a chunk is in the committed tree. It does not show that the chunk is the decryption of the committed ciphertext. Without that link, a sampled proof proves only "the buyer asserts this chunk is bad", which is exactly the claim in dispute.
2. **Sampling is probabilistic, so it is not a soundness guarantee.** With corruption fraction *f* and *s* samples, the miss probability is `(1-f)^s`. A seller who corrupts 1% of a large file and faces 20 samples is undetected with probability ≈ 0.82. Sampling can bound *expected* loss; it cannot establish "the buyer gets the committed content".
3. **Cut-and-choose needs commit-then-sample ordering.** If the seller knows which chunks will be sampled, it can make exactly those correct. Ordering alone does not fix point 1.
4. **It does not address the wrong-key attack.** A seller that delivers a key which does not open the ciphertext defeats sampling entirely.
5. **It adds machinery without a security gain** over the reveal-and-recompute design in §7.

**Replacement:** a **public-PRF stream cipher** whose keystream the EVM can recompute, so that the contract can verify, for any single chunk, that the committed ciphertext decrypts to the committed plaintext under the committed key. Sampling survives only as an optional *bandwidth* optimisation with an explicit bound (§9 of `MATHEMATICAL_FORMULATION.md`), never as the soundness argument.

### DC-2. "Bond > price" is removed as the economic condition

**Previous proposal:** set seller and buyer bonds above the product price.

**Why it fails:** it is neither necessary nor sufficient. The binding constraints are incentive-compatibility inequalities that depend on the seller's honest margin, the detection probability of the relevant attack, dispute cost, and the counterparty's willingness to enforce. For integrity attacks detection is certain, so no bond is needed for deterrence (only for refund solvency). For *semantic* attacks (misdescription) the required bond is `((1-P_d)/P_d)·p`, which can be far above or far below `p` depending on fingerprint robustness. Derivation in `MATHEMATICAL_FORMULATION.md` §10.

### DC-3. The dispute layer is not an optimistic oracle

**Previous proposal:** bonded assertions plus a fallback committee.

**Why it is downgraded:** an optimistic oracle (UMA-style) is a valid pattern but it imports a subjective-resolution backstop (token-holder vote or committee), which contradicts the thesis's claim of *no trusted arbitrator* for the integrity property. It is retained only for **semantic** disputes, where subjectivity is unavoidable, and is labelled as such. Integrity disputes are resolved by deterministic on-chain recomputation.

### DC-4. The Fabric implementation is out of scope

The base paper's Fabric numbers are not reproducible from the published artifact (Caliper config runs `listItem` only; the 50-orderer compose file has orderers 31–50 commented out). Rebuilding a Fabric testbed would consume the thesis without strengthening the core claim. Fabric is discussed only in the audit.

### DC-5. Novelty is not claimed for "AIGC marketplace + license + escrow"

A 2025 DECADE paper already combines C2PA manifests, TrustMark watermarking, ODRL license terms and on-chain escrow; Story Protocol and AuraMint commercialise AI-IP licensing. That combination is prior art. The novelty claim is narrowed in `VERIFIED_NOVELTY_AND_CONTRIBUTIONS.md`.

---

## 4. Research questions

| ID | Question | Answered by |
|---|---|---|
| **RQ1** | Which of MetaTrade's stated security properties are actually enforced by its published implementation? | Audit (E1), `THREAT_MODEL.md` |
| **RQ2** | Can payment be bound to a pre-sale content commitment, with on-chain-provable disputes and no trusted arbitrator, at acceptable cost? | Protocol design + E2–E4 |
| **RQ3** | What is the gas, latency, storage and bandwidth cost of that binding relative to MetaTrade and to a naive escrow? | E2–E6 |
| **RQ4** | Under what bond and detection-probability conditions is honest participation a (weakly) dominant strategy, and are the resulting bonds acceptable in practice? | E7, `MATHEMATICAL_FORMULATION.md` §10 |
| **RQ5** | How robust is perceptual-hash plagiarism detection under content-preserving and adversarial transformations, and how does that robustness feed back into bond sizing? | E8, `EXPERIMENTAL_METHODOLOGY.md` §6 |

RQ5 is the D2 component. RQ3's storage/bandwidth arm is the D3 component.

---

## 5. Contributions and their type

Type labels: **NEW** (not found in prior art), **ADAPTED** (known primitive, new application), **INHERITED** (from the base paper), **ENGINEERING** (implementation quality, not a research claim), **EXISTING** (prior art; cite, do not claim).

| ID | Contribution | Type | Notes |
|---|---|---|---|
| **C1** | Reproducible code-level audit of MetaTrade, with an executable attack harness | **NEW** (as a factual artifact about this system) | Not a cryptographic claim. Defensible as empirical security research. |
| **C2** | **Commit–Recompute–Challenge (CRC)** settlement: pre-sale commitments to plaintext, ciphertext and key; on-chain chunk-consistency proofs via a public PRF; deterministic integrity disputes with no arbitrator | **NEW as a protocol construction**; primitive is **ADAPTED** | The core technical contribution. Must be checked against verifiable-encryption literature; see novelty doc §7. |
| **C3** | Separation of **integrity** (cryptographic, no trusted arbitrator) from **semantic correctness** (perceptual, trust-minimised), with distinct dispute procedures and distinct trust assumptions | **NEW** (conceptual) | Corrects MetaTrade's conflation. |
| **C4** | Economic model linking bond sizing to fingerprint detection probability `P_d`, with explicit IC conditions and attack-ROI analysis | **NEW** (analytical) | Makes D2 load-bearing for D1. |
| **C5** | Encrypt-once / wrap-per-buyer storage with measured bytes, time and gas versus MetaTrade's per-buyer re-encryption | **ADAPTED + ENGINEERING** (D3) | Hybrid encryption is standard; the measurement and the integration are the contribution. |
| **C6** | Calibrated plagiarism detection under a transformation attack suite, with TPR/FPR/EER and evasion cost | **ADAPTED** (D2) | pHash robustness is known to be weak; the contribution is the AIGC-marketplace calibration and the link to C4. |

**Explicit non-contributions:** a new fair-exchange primitive; a new cipher; a new zero-knowledge system; a production marketplace; a legal rights-management system.

---

## 6. Scope and non-goals

**In scope:** Ethereum-compatible EVM; single-seller/single-buyer sale; integrity binding; on-chain dispute; royalty split to one parent; bonded plagiarism reporting with an on-chain fingerprint comparison; reputation as a secondary signal; gas/latency/storage measurement; plagiarism robustness measurement.

**Out of scope (stated, not hidden):**

- Hyperledger Fabric deployment and BFT ordering (DC-4).
- Zero-knowledge proofs of decryption (too heavy for the timeline; noted as future work).
- Cross-chain settlement, fiat rails, account abstraction.
- Legal enforceability of licenses; copyright validity of AIGC.
- Model/prompt/seed provenance (D5) — mentioned as future work only.
- Anonymity of buyers and sellers; GDPR compliance.
- Multi-parent royalty DAGs beyond a single parent chain.

---

## 7. Protocol at a glance (CRC)

```
LISTING (pre-sale, immutable)
  seller -> registry:
    cidC, hC = H(C), hD = H(D), R_D, R_C, cK = H(K||N||s), m, blockSize,
    price p, royaltyBps r, parent, T_deliver, T_confirm, T_respond

BUY
  buyer -> escrow: p + b_b                       state = ESCROWED

DELIVER
  seller -> escrow: encK = ECIES(B_pub, K)       state = DELIVERED

BUYER VERIFY (local)
  fetch C from IPFS; check H(C) == hC
  K' = ECIES_dec(B_sk, encK); D' = PRF-decrypt(K', C)
  if H(D') == hD  -> confirm()                   state = SETTLED   (pay seller, mint license)
  else            -> dispute()                   state = CHALLENGED

DISPUTE — MODE 1 (integrity, no seller response)
  buyer -> escrow: K, N, s, i, D_i, proofD_i, proofC_i
  contract checks:
    H(K||N||s) == cK
    MerkleVerify(R_D, i, D_i, proofD_i)
    MerkleVerify(R_C, i, C_i, proofC_i)   where C_i is recovered from proofC_i
    D_i == C_i XOR HMAC(K_enc, i)
  if relation fails  -> seller loses: refund + slash b_s
  if relation holds  -> buyer loses: seller paid, buyer bond forfeited (provably false claim)

DISPUTE — MODE 2 (non-delivery / bad key)
  buyer -> escrow: dispute()
  seller must reveal (K,N,s) within T_respond
  if no reveal        -> buyer wins: refund + slash b_s
  if reveal invalid   -> buyer wins: refund + slash b_s
  if reveal valid     -> content is public; buyer may run Mode 1 on any chunk
                         (buyer bond returned either way — claim was reasonable)

TIMEOUTS
  no delivery by T_deliver  -> buyer refunded, seller slashed
  no confirm/dispute by T_confirm -> seller paid (buyer deemed satisfied)
  no reveal by T_respond    -> buyer refunded, seller slashed
```

**Why the integrity dispute is sound.** The relation `D_i = C_i XOR HMAC(K_enc, i)` is a deterministic function of public data once `K` is known. The commitments `R_D`, `R_C`, `cK` bind `D`, `C` and `K`. Therefore:
- If the seller committed consistently, no chunk fails, and no buyer can produce a valid failing proof.
- If the seller committed inconsistently at any chunk, that chunk fails, and the buyer (who holds `K`) can prove it.
- The buyer cannot fabricate a failing chunk for an honest seller, because the relation holds for every chunk.

This is the property MetaTrade lacks. It is proved (sketch) in `MATHEMATICAL_FORMULATION.md` §8.

---

## 8. Trust model summary

| Property | Guarantee | Residual trust |
|---|---|---|
| **Integrity** (you receive the committed bytes) | Cryptographic, on-chain provable | Hash collision resistance; PRF assumption; EVM correctness |
| **Payment binding** (pay only for committed bytes) | Cryptographic + escrow | Escrow contract correctness (audited, invariant-tested) |
| **Termination** (no permanent lock) | Timeouts | Block production liveness |
| **Semantic correctness** (committed bytes are the advertised asset) | Economic + perceptual | Preview fidelity; pHash robustness `P_d`; bonded reporting |
| **Confidentiality in honest path** | Key wrapped to buyer | Buyer endpoint compromise; IPFS gateway observation of ciphertext only |
| **Confidentiality under dispute** | **Lost** — key becomes public | Stated explicitly; mitigated by bond and by the fact the disputing buyer already holds the content |
| **Availability** | Not guaranteed | IPFS pinning (bond optional, Tier 3) |
| **Arbitration** | None for integrity | Committee/oracle only for semantic disputes |
| **Identity/Sybil** | Economic only | No proof-of-personhood; cost per attack is linear in bonds |

The thesis will state this table verbatim in the paper. MetaTrade claimed an empty trust set; the honest claim is a *smaller and precisely enumerated* one.

---

## 9. Evaluation summary

Four systems under test: **B0** MetaTrade as published; **B1** naive escrow (pay-then-deliver, no verification); **B2** FairSwap-style public-reveal exchange; **B3** MetaTrade-R. Thirty attacks (AT-01…AT-30), with AT-01…AT-12 as the settlement core. Metrics: attack success rate with Wilson intervals, gas per operation and per full cycle, p50/p95 latency, throughput, bytes stored and transferred, encryption/decryption time, plagiarism TPR/FPR/EER, attacker ROI. Thirty repetitions per cell, fixed seeds, McNemar for paired attack outcomes, Wilcoxon for cost. Full plan in `EXPERIMENTAL_METHODOLOGY.md`.

All numeric improvements are **hypotheses**, not results. None has been measured yet.

---

## 10. Document map

| Document | Contents |
|---|---|
| `FINAL_RESEARCH_DESIGN.md` | This file: claim, RQs, contributions, scope, protocol, trust model |
| `VERIFIED_NOVELTY_AND_CONTRIBUTIONS.md` | Contribution ledger, prior art, what we must not claim |
| `THREAT_MODEL.md` | Assets, adversaries, attack catalogue, trust assumptions |
| `MATHEMATICAL_FORMULATION.md` | Definitions, theorems (sketches), economic model, complexity |
| `SYSTEM_ARCHITECTURE.md` | Contracts, services, data flows, deployment |
| `SMART_CONTRACT_SPECIFICATION.md` | Interfaces, state, invariants, function specs, tests |
| `EXPERIMENTAL_METHODOLOGY.md` | Baselines, attacks, metrics, statistics, ablations |
| `IMPLEMENTATION_ROADMAP.md` | Tiers, milestones, work breakdown, fallbacks |
| `TECHNOLOGY_STACK_JUSTIFICATION.md` | Stack choices with alternatives and rationale |
| `RISK_AND_FEASIBILITY_ASSESSMENT.md` | Risk register, kill criteria, defensibility |

---

## 11. Approval gate

Implementation does not begin until the supervisor approves:

1. The narrowed novelty claim (C1–C6, with C2 as the technical core).
2. The replacement of sampled verification by on-chain chunk-consistency proofs (DC-1).
3. The economic model replacing "bond > price" (DC-2).
4. The exclusion of Fabric (DC-4).
5. The Tier-1 scope in `IMPLEMENTATION_ROADMAP.md`.

Signed-off decisions are recorded by editing §12.

## 12. Approval record

| Item | Decision | Date | Approver |
|---|---|---|---|
| Novelty claim | Pending | — | — |
| Protocol (CRC) | Pending | — | — |
| Economic model | Pending | — | — |
| Scope (Tier 1) | Pending | — | — |
