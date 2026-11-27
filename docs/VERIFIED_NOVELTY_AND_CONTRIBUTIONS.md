# VERIFIED NOVELTY AND CONTRIBUTIONS

**Purpose:** to separate what is genuinely new in MetaTrade-R from what is inherited, adapted, engineering, or already published — and to state precisely what the thesis may and may not claim.

**Rule applied:** a contribution is only labelled **NEW** if (a) a targeted search found no direct precedent, and (b) the claim is about a *mechanism or result*, not about a combination of known parts. Combinations of known parts are labelled **ADAPTED** even when the combination is useful.

---

## 1. Method

1. Re-read the base paper's claims and the two published repositories.
2. Searched: fair exchange (FairSwap, OptiSwap, FairDEx, FDE/VECK, dual-deposit escrow), optimistic oracles (UMA), verifiable encryption (Camenisch–Shoup, Cassiopeia), proof of storage/retrievability (Ateniese; Juels–Kaliski), perceptual hashing surveys, AIGC provenance and licensing (DECADE 2025, Story Protocol, AuraMint, Peaq Stream), NFT licensing standards (ERC-2981/4907/5635), and metaverse reputation surveys.
3. For each proposed contribution, recorded the closest prior art and the residual delta.
4. Assigned a confidence level to the novelty claim: **High** (no close precedent found), **Medium** (delta is real but narrow), **Low** (likely already published in some form).

---

## 2. Contribution ledger

| ID | Claim | Type | Closest prior art | Residual delta | Novelty confidence |
|---|---|---|---|---|---|
| **C1** | Reproducible code-level audit showing MetaTrade's guarantees are not enforced | **NEW** (as an artifact) | None found that audits *this* system | The audit itself; the attack harness | **High** |
| **C2** | Commit–Recompute–Challenge (CRC): pre-sale commitments + on-chain chunk-consistency proof + two-mode dispute | **ADAPTED** | FairSwap (CCS 2018); OptiSwap (AsiaCCS 2020); FDE/VECK (CCS 2024) | Per-buyer key wrapping (confidential honest path); two-mode dispute; AIGC-license instantiation | **Low–Medium** |
| **C3** | Separation of integrity from semantic correctness, with distinct trust assumptions and dispute paths | **NEW** (conceptual framing) | Base paper conflates them; general security engineering separates authenticity from quality | The framing and its operational consequences | **Medium** |
| **C4** | Bond-sizing model tied to fingerprint detection probability `P_d` | **NEW** (analytical) | Standard IC/game-theoretic escrow analyses; no `P_d`-linked bond formula found | The `P_d` linkage and the resulting design rule | **Medium** |
| **C5** | Encrypt-once / wrap-per-buyer storage with measured cost | **ADAPTED + ENGINEERING** | Standard hybrid encryption; DRM; Peaq Stream chunk-key re-wrapping | Measurement and integration, not mechanism | **Low** |
| **C6** | Calibrated pHash/embedding plagiarism detection for AIGC marketplaces | **ADAPTED** | ACM TOMM perceptual-hashing survey (2025); known geometric fragility | AIGC-specific calibration and the `P_d` → bond link | **Low–Medium** |

---

## 3. What is genuinely new (C1)

The strongest original contribution is **C1**, and it is original because it is a *factual, reproducible finding about a specific published system*, not because it invents a primitive.

The audit establishes, with file/function/line evidence, that:

1. `DigitalAssetContract.grantAccess` stores a seller-supplied hash `H`; `compareHashes` compares the buyer's hash of the downloaded ciphertext against that same `H`. This is self-consistency, not product binding.
2. `DamChaincode/lib/digital_asset.js::queryBuyReq` returns the wrapped key with no settlement gate.
3. `tokenERC20.js::_transfer` has the insufficient-balance check commented out.
4. `DigitalAssetContract.initialize` is re-callable.
5. `reportPlagiarism` is owner-only, takes one address, performs no similarity comparison, and pays no reward.
6. The published Caliper config exercises `listItem` only, so the paper's throughput figures cannot be regenerated.
7. Table 2's 250,633 gas is exactly `registerRequest` + `grantAccess` + `compareHashes`, excluding `initialize`, `listAsset` and `withdrawFund`.

This is a **negative result about a deployed system**, and negative results are legitimate contributions when they are reproducible and consequential. It is also the part a reviewer is least likely to call derivative.

**Caveat to preserve:** the public repositories may not be the exact artifact used for the paper. That uncertainty is itself part of the reproducibility finding, and must be stated as such rather than used to attack the authors.

---

## 4. What is adapted (C2) — and why it must not be called new

The CRC core is, in substance, a **FairSwap-style construction**. FairSwap already:

- encrypts the file with a key using a stream cipher whose keystream is a public PRF,
- commits to the ciphertext with a hash tree,
- lets the contract recompute one block's keystream to check a misbehaviour proof,
- holds payment in escrow and punishes the cheating party.

Any claim that "on-chain chunk-consistency verification" is a new primitive would be false. The thesis must cite FairSwap as the direct ancestor and state the delta.

**The actual delta over FairSwap:**

| Property | FairSwap | MetaTrade-R (CRC) |
|---|---|---|
| Key delivery | Seller reveals key on-chain at settlement → content public after every sale | Key wrapped to the buyer (ECIES); content stays confidential in the honest path |
| Dispute | Single misbehaviour proof | Two modes: integrity (buyer-provable, no seller response) and non-delivery (seller must reveal) |
| Asset model | One-off file sale | Reusable license, royalty split, plagiarism registry |
| Threat framing | Fair exchange of a file | AIGC license market with semantic-correctness layer |
| Evaluation | Cryptographic + cost | Audit + cost + fingerprint robustness + attacker ROI |

The confidentiality delta is **necessary for the application**, not merely cosmetic: in an AIGC license market, a public key reveal after the first sale destroys the asset's value for every subsequent buyer. That is a legitimate reason to adapt FairSwap, and it is the honest way to frame C2.

**Residual novelty risk:** there may be published "confidential fair exchange" or "privacy-preserving FairSwap" variants. The student must run the searches in §7 before submitting. If such a paper exists, C2 becomes an *instantiation* contribution and the thesis leans harder on C1, C3 and C4.

---

## 5. What is conceptual (C3)

MetaTrade's central confusion is that one hash check is made to carry two different guarantees:

- **Integrity:** the bytes you receive are the bytes that were committed.
- **Semantic correctness:** the committed bytes are the asset that was advertised.

These are not the same, and no hash commitment can establish the second. A seller can commit to garbage consistently. The thesis separates them:

- Integrity is **cryptographic and decided on-chain without a trusted arbitrator** (C2).
- Semantic correctness is **economic and perceptual**: a preview is published, its fingerprint is committed, the buyer compares after delivery, and misdescription is deterred by a bond sized against the fingerprint's detection probability (C4), with disputes resolved by a bonded oracle or committee because the judgment is inherently subjective.

This separation is a framing contribution. It is not a mechanism, and the thesis should say so. Its value is that it tells designers which guarantee they are buying and at what trust cost.

---

## 6. What is analytical (C4)

The economic model replaces the folk rule "bond > price" with explicit incentive-compatibility conditions. The distinctive part is that the misdescription bond depends on `P_d`, the probability that the fingerprint check detects a substituted asset:

```
b_s  >=  ((1 - P_d) / P_d) * p        (misdescription deterrence, zero-margin seller)
b_s  >=  p                            (refund solvency)
b_b  >=  0                            (integrity disputes are self-limiting)
b_r  >   R                            (no profitable false plagiarism reports)
```

The `P_d` term is what makes the plagiarism experiment (C6) load-bearing for the settlement design: a weak fingerprint forces a large bond, which raises the capital cost of listing and shrinks the market. That trade-off curve — `P_d` versus required bond versus listing cost — is a genuine, measurable research output and, as far as the search showed, not previously published in this form.

---

## 7. Prior art that blocks naive claims

The following must be cited and must not be claimed as novel.

### 7.1 Fair exchange

- **FairSwap** — Dziembowski, Eckey, Faust, CCS 2018, DOI `10.1145/3243734.3243857`. Direct ancestor of the CRC core.
- **OptiSwap** — AsiaCCS 2020, DOI `10.1145/3320269.3384749`. Optimistic variant; ancestor of the challenge-window idea.
- **FDE/VECK** — CCS 2024, DOI `10.1145/3658644.3690248`. Recent fair data exchange with verifiable encryption.
- **Dual-deposit escrow** — ICBC 2019, DOI `10.1109/BLOC.2019.8751482`. Both-party bonds.
- **Generalisation of FairSwap/OptiSwap** — *Int. J. Inf. Secur.* 2025, DOI `10.1007/s10207-025-01166-1`.
- **FairDEx** — DAPPS 2021.

### 7.2 Verifiable encryption and on-chain cryptography

- **Camenisch–Shoup**, CRYPTO 2003 — the canonical verifiable encryption scheme. Establishes that "verifiable encryption" usually means a ZK proof; the thesis's recompute-the-PRF approach is a *lighter-weight alternative with weaker properties*, and must be described that way.
- **Cassiopeia** — eprint `2023/635`, on-chain witness encryption with PVSS + zkSNARKs. Evidence that heavy on-chain crypto is possible; useful contrast for why CRC avoids ZK.
- **Provable Data Possession** — Ateniese et al., CCS 2007; **Proofs of Retrievability** — Juels–Kaliski, CCS 2007. The "check one chunk against a commitment" idea has ancestry here. Cite to avoid overclaiming.

### 7.3 Optimistic oracles and bonded assertions

- **UMA Optimistic Oracle V3** — bonded assertions, challenge window, DVM escalation. This is the canonical pattern for *subjective* disputes. The thesis uses deterministic recomputation for integrity and reserves the oracle pattern for semantic disputes; it must cite UMA and explain the difference.

### 7.4 AIGC licensing and provenance

- **DECADE, "Decentralized Creative Copyright Exchange in the Age of Generative AI"** (2025) — C2PA v2.2 manifests, TrustMark watermarking, ODRL license terms, on-chain escrow. This is the closest published system to the *application layer*. The thesis must not claim "AIGC marketplace + licenses + escrow" as novel. Its delta is the *content-binding dispute*, which the published description of DECADE does not appear to address.
- **Story Protocol** (commercial, 2025) — programmable IP licensing and revenue splitting. Prior art for the licensing model.
- **AuraMint**, **BonzAI Content NFTs**, **GL1F** — commercial AI-IP minting/licensing. Prior art for the product category.
- **C2PA / Content Credentials** and **EU AI Act Article 50** — provenance and marking obligations. Context, not contribution.

### 7.5 Storage and key wrapping

- **Peaq Stream** — chunked encryption with per-buyer key re-wrapping. Direct prior art for C5. The thesis must not claim per-buyer key wrapping as novel.
- Standard hybrid encryption (AES + ECIES) — textbook.

### 7.6 Fingerprinting

- **ACM TOMM survey on perceptual hashing** (2025), DOI `10.1145/3727880` — documents geometric fragility.
- **ACM CSUR AIGC security survey** (2025), DOI `10.1145/3729419`.
- **AIGC-Chain / CTrace** — arXiv:2406.14966.

### 7.7 Licensing standards

- **ERC-2981** (royalties), **ERC-4907** (rental/expiring use), **ERC-5635** (licensing). These define the design space for C6/D6 and must be cited.

---

## 8. What the thesis must not claim

1. **Not** "a new fair-exchange protocol." It is a FairSwap-style exchange adapted to AIGC licenses with a confidentiality-preserving delivery path.
2. **Not** "a new cryptographic primitive." The stream cipher is HMAC-SHA256 in counter mode; the commitments are SHA-256; the key wrapping is ECIES. All standard.
3. **Not** "trust-free." The trust set is smaller and enumerated, not empty.
4. **Not** "first AIGC marketplace." DECADE, Story Protocol, AuraMint and others precede it.
5. **Not** "plagiarism-proof." The fingerprint is probabilistic; the thesis measures `P_d` rather than asserting it.
6. **Not** "the base paper is fraudulent." The audit reports what the published artifact does, with the caveat that it may not be the artifact used for the measurements.
7. **Not** any measured improvement before the experiments are run. Every number in the experimental plan is a hypothesis.

---

## 9. Positioning statement (to be used verbatim in the thesis)

> This thesis makes four contributions. First, it reports a reproducible audit of a published AIGC trading framework, showing that the framework's settlement check does not bind payment to the advertised content. Second, it specifies and implements a settlement protocol that does bind them, by committing to plaintext, ciphertext and key before the sale and by letting the contract verify, for any chunk, that the committed ciphertext decrypts to the committed plaintext — a construction adapted from FairSwap, extended with per-buyer key wrapping so that the honest path preserves confidentiality. Third, it separates integrity from semantic correctness and gives each a dispute procedure with an explicit trust assumption. Fourth, it derives and measures the cost of the resulting guarantees: gas, latency, storage, and the bond required as a function of fingerprint robustness. The thesis does not claim a new cryptographic primitive; it claims a rigorous, reproducible characterisation of what it costs to make an AIGC marketplace's central promise true.

---

## 10. Pre-submission novelty checks (mandatory)

Run these before the literature-review chapter is frozen:

- `"confidential fair exchange"` and `"privacy-preserving FairSwap"`
- `"FairSwap" confidentiality key wrapping`
- `"verifiable encryption" stream cipher PRF on-chain`
- `"proof of misbehavior" stream cipher smart contract`
- `"AIGC" license escrow fair exchange 2025 2026`
- `"content binding" smart contract hash commitment`
- `"bond" "detection probability" escrow incentive`
- `"perceptual hash" bond marketplace`

If any returns a direct precedent for C2's confidentiality delta, demote C2 to ADAPTED-only and move the thesis weight to C1 + C3 + C4.

---

## 11. Reference list (verified identifiers)

| Ref | Identifier |
|---|---|
| FairSwap | DOI `10.1145/3243734.3243857` |
| OptiSwap | DOI `10.1145/3320269.3384749` |
| FDE/VECK | DOI `10.1145/3658644.3690248` |
| Dual-deposit escrow | DOI `10.1109/BLOC.2019.8751482` |
| Fair-exchange generalisation | DOI `10.1007/s10207-025-01166-1` |
| Perceptual hashing survey | DOI `10.1145/3727880` |
| AIGC security survey | DOI `10.1145/3729419` |
| Metaverse reputation review | DOI `10.3390/cryptography9040074` |
| AIGC-Chain / CTrace | arXiv:2406.14966 |
| Cassiopeia | IACR eprint 2023/635 |
| UMA OOv3 | UMA protocol documentation |
| DECADE | decade.ac.uk technical report, Nov 2025 |
| ERC-2981 / 4907 / 5635 | eips.ethereum.org |
| C2PA | c2pa.org specification v2.x |
| EU AI Act Art. 50 | Regulation (EU) 2024/1689 |

Items marked "to verify" in the working notes must be checked against the publisher record before the reference list is finalised.
