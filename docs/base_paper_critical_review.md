# Critical Review of the Base Paper
## "Trust-Free Blockchain Framework for AI-Generated Content Trading and Management in Metaverse"
**Authors:** Vu Tuan Truong, Hung Duy Le, Long Bao Le (INRS, University of Quebec)
**Venue:** IEEE Access, vol. 12, 2024, pp. 41815–41828
**DOI:** 10.1109/ACCESS.2024.3376509
**Review type:** Supervisor / reviewer / reproducibility audit
**Status:** Phase 1–9 analysis. No implementation or final thesis text produced.

> **Superseded in part.** This document is the original Phase 1–9 review. Three of its proposals were revised during the design-validation phase and must not be used as the current design:
> 1. The "sampled content proof" dispute mechanism (D1 Tier 2, and the gap-matrix row G1) is **replaced** by on-chain chunk-consistency proofs over a public PRF. Sampling is not a soundness mechanism.
> 2. The bond conditions `b_s > p` and `b_b > p` are **replaced** by the incentive-compatibility conditions in `MATHEMATICAL_FORMULATION.md` §10.
> 3. The novelty framing in Phase 8 is **narrowed** in `VERIFIED_NOVELTY_AND_CONTRIBUTIONS.md`.
>
> The audit findings (Phases 1–4) remain valid and are the empirical basis of the thesis. The current design package starts at `README.md`.

---

## 0. Verification method (what this review is based on)

1. Full text extracted from all 14 PDF pages (including layout-mode extraction for Tables 1–2, which are vector tables).
2. Both published artifacts inspected directly:
   - `github.com/duyhung2201/MetaTrade-Ethereum` (Solidity, Hardhat)
   - `github.com/duyhung2201/MetaTrade-Consortium` (Hyperledger Fabric chaincode, Caliper configs)
3. Gas arithmetic re-computed from the repository's own `gas-report.txt` and compared with Figs. 5–6 and Table 2.
4. Prior-art check on fair exchange, perceptual hashing, AIGC provenance, and NFT licensing standards.

Every claim below is marked as **verified** (seen in text/code/arithmetic), **inferred** (logically follows but not directly shown), or **suspected** (plausible, needs testing). I do not invent mathematical errors.

---

# PHASE 1 — What the paper actually does

### 1. Problem
Access-based (license-based) AIGC — content sold to many buyers, not a unique NFT — is traded through trusted intermediaries (cloud storage + license brokers). This creates (i) single-point-of-failure (SPoF), (ii) data leakage/alteration, (iii) free-riding by sellers (take payment, deliver nothing/garbage), (iv) false-reporting by buyers (receive content, claim failure, demand refund), and (v) plagiarism/resale by buyers.

### 2. Why it matters
AIGC is a digital file: copying is free, leakage destroys value, and metaverse participants are pseudonymous. Without a trusted arbitrator, the classical **fair exchange** problem appears: buyer and seller cannot simultaneously hand over money and content.

### 3. Prior approaches it claims to improve
- **PoD [6]**: smart-contract proof of delivery, but disputes go to a trusted arbitrator.
- **DRM [7]**: blockchain DRM, but cannot verify whether a dispute report is honest.
- **FAST DATA [8]**: security-manager layer with decentralized storage and encryption; no alteration detection.
- **DAMChain [9]**: ABAC policies in smart contracts; assumes data is not modified in cloud/transit.
- **SPChain [10]**: per-user asymmetric encryption of data; authors themselves note it is not scalable for large files.
- **NFT-based work [14], [15]**: uniqueness-based assets only, not access-based licenses.

### 4. Proposed solution
**MetaTrade**: a blockchain + smart-contract marketplace with
- one **AIGC smart contract per product** (EIP-1167 clone) and one **marketplace contract**;
- hybrid encryption: AES-256 over the content, the AES key encrypted to the buyer's secp256k1 public key;
- ciphertext on IPFS, only CID/hash/key on-chain;
- a three-phase trade: deposit → grant → hash-compare → release/refund;
- a **proof-of-plagiarism (PoP)** using perceptual hash (pHash) + reporter rewards;
- an **inheritable AIGC** parent/child royalty scheme;
- a **rating/reputation** system.

### 5. Architecture
Entities: seller, customer, per-product AIGC contract, singleton marketplace contract, plagiarism observer. Two deployments: Ethereum (public) and Hyperledger Fabric v2.3 (consortium, 100 peers / 50 orderers, Raft).

### 6. Algorithms / formal objects
- **Eq. (1)** `Tx_init = {Addr_mp, Addr_pr, PPrice, PDesc, pHash, Sig}` (p. 41820).
- **Algorithm 1** (seller): extract buyer pubkey → random `K_sym` → `D_enc = AES(D_src, K_sym)` → `H = SHA(D_enc)` → `K_signed = ECDSA_enc(K_sym, K_pub)` → upload `D_enc` to IPFS → submit `{U_IPFS, H, K_signed}`.
- **Algorithm 2** (buyer): download `D_enc` → `H_c = SHA(D_enc)` → compare with `H` → mismatch: refund; match: decrypt `K_signed`, decrypt `D_src`.
- **Eq. (2)** `Tx_report = {Addr_mp, Addr1, Addr2, Sig}`.
- **Eq. (3)** `Tx_rate = {Addr_AIGC, S, pHash_c, Sig}`.
- No formal security definition, no game-theoretic model, no complexity analysis.

### 7. Main contributions (as claimed)
1. Trust-free trading resisting data leakage, alteration, free-riding, false-reporting **without any trusted third party**.
2. AIGC management: proof-of-plagiarism, inheritable development, rating/reputation.
3. Two DApp implementations (Ethereum, Fabric); cost efficiency and ~1500 TPS at block size 400–500.
4. Claim of being the **first** system secure even if the attacker eavesdrops on all traffic.

### 8. Experimental findings
- Ethereum: gas per function; `compareHashes` ≈ 89,875 gas ($1.70), `grantAccess` ≈ 101,676 gas ($1.93), `listAsset` ≈ 159,133 gas ($3.02); Table 2: 250,633 gas ($4.74) per successful cycle.
- Fabric: throughput vs. block size (100–800 tx/block), latency, processing rate; saturation near 1,200–1,300 TPS; recommended block size 400–500.

### 9. Claims
Trust-free; no SPoF; plagiarism-resistant; data-alteration-proof; economically disincentivized attacks; higher cost efficiency than related work; near-1500 TPS.

### 10. Evidence offered
Gas measurements, two throughput/latency figures, a qualitative "security analysis" in prose, and a self-assessed feature table (Table 1). **No formal proof, no attack experiments, no statistical tests, no plagiarism-detection evaluation, no user study.**

---

# PHASE 2 — Critical analysis

Findings are tagged:
**[EL]** explicit limitation · **[IL]** implicit limitation · **[TF]** technical flaw · **[MW]** methodological weakness · **[RG]** research gap · **[FR]** future opportunity.
Confidence: **V** verified, **I** inferred, **S** suspected.

## A. Research and conceptual limitations

**F1. "Trust-free" is overclaimed; the trust set is not empty. [RG, I]**
The system still requires trust in: (a) an honest majority of consensus nodes; (b) **non-Byzantine orderers** in the Fabric version (Raft is crash-fault tolerant only); (c) IPFS availability/pinning; (d) the DApp front-end that computes pHash and performs encryption; (e) the buyer's endpoint; (f) the marketplace owner, who is the **only** account allowed to adjudicate plagiarism (`reportPlagiarism` is `require(msg.sender == contractOnwer)`). The abstract's "without requiring trust assumptions among participants" is therefore not supported.

**F2. The paper ignores the fair-exchange literature entirely. [RG, V]**
References [1]–[26] contain no FairSwap, OptiSwap, ZKCP, HTLC, timed commitment, dual-deposit escrow, or FairDEx. The exact problem the paper poses ("how can buyer and seller exchange without trusting each other?") has a mature literature with formal definitions and proofs (FairSwap, CCS 2018; OptiSwap, AsiaCCS 2020; FairDEx, DAPPS 2021; FDE/VECK, CCS 2024). This is a serious scholarly gap and the single easiest way for a reviewer to reject the novelty claim.

**F3. The "first work" claim is unsupported. [RG, V]**
p. 41818: "To the best of our knowledge, MetaTrade is the first work that can securely protect the traded assets..." No systematic comparison, no search protocol, and FairSwap (2018) already provides fair exchange of digital goods with formal security.

**F4. AIGC-specific problems are not addressed. [RG, V]**
The framework is content-agnostic. It records no model, prompt, seed, LoRA/ControlNet configuration, or dataset consent — even though the paper's own Fig. 3 demonstrates Stable Diffusion 1.5 + LoRA + ControlNet. AIGC-specific risks (style mimicry, model extraction, derivative works, uncertain copyright status) are untouched. The "AIGC" framing adds only pHash.

**F5. "License-based" is a misnomer. [RG, V]**
Eq. (1) has no license scope, duration, territory, exclusivity, derivative rights, or revocation. Once plaintext is delivered, it cannot be revoked. The system sells **perpetual copies**, not licenses.

## B. Technical and algorithmic limitations

**F6. The hash comparison does not bind payment to product identity. [TF, V] — most severe finding**
Algorithm 1 computes `H = SHA(D_enc)` where `D_enc` is produced **by the seller**, and Algorithm 2 compares the buyer's hash of the downloaded ciphertext with that same seller-declared `H`. This is a **self-consistency check**, not a commitment to the advertised product. A malicious seller uploads arbitrary garbage `G`, publishes `H = SHA(G)`, the buyer's hash matches, payment is released, and the buyer decrypts garbage. §II-E1 ("If there are issues leading to an incorrect data downloaded by the customer, the hash_c will be completely different") is therefore **logically false**. The pHash in Eq. (1) is never used in the settlement path, so nothing links `D_enc` to the listed AIGC. The free-riding defense fails for exactly the adversary the paper models.

**F7. The consortium implementation releases the key before payment. [TF, V]**
In `DamChaincode/lib/digital_asset.js`, `grantAccess` stores `encryptedSymmetricKey` in the request, and `queryBuyReq` returns the whole request to the buyer with **no settlement-state gate** (it only checks `parsedReq.buyer === buyer`). The buyer can therefore: register → read key → decrypt → call `compareHashes` with a wrong hash → receive a **full refund**. The buyer obtains both the product and the money. This directly falsifies the paper's core fairness claim and Table 1's "false-reporting ✓" for the Fabric version.

**F8. The consortium token contract permits unlimited minting. [TF, V]**
`tokenERC20.js`, `_transfer`: the insufficient-balance check is **commented out**. `from` and `to` balances are updated independently, so a self-transfer from an account with 0 yields a positive balance. The escrow/payment layer is economically meaningless, and any Caliper throughput measured on this chaincode was measured with the payment logic disabled.

**F9. `initialize()` can be called repeatedly. [TF, V]**
`DigitalAssetContract.initialize(...)` has no `initializer` guard and no `require(owner == address(0))`. Anyone can re-initialize any clone, replace `owner`, `digitalAssetPrice`, `parentAsset`, and `commissionRate`, redirect royalties, or freeze pending deposits. This is a critical access-control vulnerability in the public deployment.

**F10. De-listing has no effect on trading. [TF, V]**
`DamMartketplace.isAssetActive` is written by `cancelListing`/`reportPlagiarism` but is **never read** by `DigitalAssetContract`. A de-listed or plagiarism-flagged asset still accepts `registerRequest` and `grantAccess`. The takedown mechanism is cosmetic.

**F11. The plagiarism mechanism is not implemented. [TF, V]**
- `reportPlagiarism(DigitalAssetContract)` takes **one** address (Eq. (2) has two), is restricted to `contractOnwer`, performs **no pHash comparison**, uses **no threshold**, gives **no reward**, and applies **no ban**.
- Neither codebase contains a pHash field or a pHash library.
- `rateAsset(asset, star)` stores only a star; Eq. (3)'s `pHash_c` is absent; there is no aggregation into an "overall rating" and no seller reputation.
- The claimed "2 consecutive failures → permanent ban" and "2 false reports → ban" are absent from both codebases.

**F12. No liveness/timeout; funds can be frozen. [TF, V]**
No timeout on seller delivery or buyer confirmation. `cancelRequest` is blocked once access is granted. `updatePrice` is callable by the seller at any time, so a seller can raise the price after a deposit; the buyer then cannot complete (the `require(userFund >= digitalAssetPrice)` fails) and can only recover by deliberately failing the comparison — which, under the paper's own ban rule, would eventually ban the buyer.

**F13. Payment accounting bugs. [TF, V]**
- `registerRequest` accepts `msg.value >= price` but on success credits only `digitalAssetPrice` and zeroes `userFund` → any excess is trapped with no accounting.
- `compareHashes` on success executes `userFundWithdrawable[msg.sender] = 0`, wiping any prior refund owed to the buyer.
- `withdrawFund` uses `.transfer` (2,300 gas), which breaks smart-contract wallets.
- `receive()` credits the owner for any stray ETH.
- `listingFee` is collected but there is no withdrawal path → locked forever.

**F14. No per-buyer key wrapping → O(n·|D|) storage and bandwidth. [TF, I]**
Algorithm 1 generates a fresh `K_sym` and uploads a fresh `D_enc` **for every buyer**. A popular asset sold n times is stored n times on IPFS and encrypted n times. The paper's claim "the trading cost is fixed no matter the data size" (p. 41824) is true only for gas; storage, pinning cost, upload bandwidth, and encryption time scale linearly with buyers × file size. Standard hybrid encryption (encrypt once, wrap the content key per buyer) removes this.

**F15. Plagiarism detection is fragile and unevaluated. [TF/RG, V]**
- pHash is DCT-based, 64-bit, image-only; it is known to be weak under rotation, mirroring, cropping, bordering, and adversarial perturbation. Peer-reviewed surveys report geometric recall far below photometric recall.
- The paper gives **no threshold**, no Hamming-distance definition, no FAR/FRR, no ROC, no attack suite, no dataset.
- The "majority of customers" rule is undefined (mean? median? mode? window?) and Sybil-able: a seller can buy its own asset with sockpuppet addresses and attach a forged pHash.
- pHash cannot handle the paper's own 3D car example, nor text/audio/video AIGC.
- Style-level plagiarism (LoRA fine-tuned on an artist) is invisible to pHash.

**F16. Royalty semantics contradict between paper and code. [TF, V]**
Paper §II-D3: "This proportion is decided by the owner of the parent AIGC contract." In Ethereum, `listAsset` passes the **child's** `commissionRate` into `initialize`; the parent has no say. In Fabric, `compareHashes` reads `parentAsset.commissionRate` with no bounds check and a raw multiplier (not basis points), so a parent can set a value > 1 and block or drain the child's escrow. The two implementations enforce opposite rules.

**F17. Inheritance is declarative, not verifiable. [RG, V]**
Nothing proves the child derives from the parent. A plagiarist can declare a cheap parent, declare none, set a near-zero price, or sell off-platform. The royalty is not enforceable outside the marketplace.

**F18. Single-owner marketplace reintroduces SPoF. [TF, V]**
`contractOnwer` is a single EOA controlling de-listing and "plagiarism adjudication." This directly contradicts §II-E6 ("third-party and SPoF-related issues are totally eliminated"). No multisig, timelock, DAO, or upgrade policy is described.

**F19. IPFS availability is assumed, not incentivized. [IL, V]**
"IPFS storage is immutable" (§II-E4) confuses **immutability** with **availability**. Content addressing means altered bytes change the CID (so the fetch fails); it says nothing about whether anyone still pins the file. There is no pinning bond, replication factor, erasure coding, retrieval proof, or Filecoin/Arweave integration. A buyer can pay and later be unable to retrieve. Public-gateway dependence is also an unaddressed SPoF.

**F20. Cryptographic notation is wrong. [TF, V]**
Algorithm 1 line 6 and Algorithm 2 line 10 use `ECDSA_enc`/`ECDSA_dec`. **ECDSA is a signature scheme, not an encryption scheme.** The repository uses secp256k1 + `eth-crypto`, i.e., ECIES-style encryption. The paper never specifies the KEM/DEM, curve, AES mode (CBC? CTR? GCM?), IV/nonce, or key-derivation function. The implementation also contains a hard-coded private key in `scripts/secp256.js` and `scripts/getPubKey.js`, and the "extract the buyer's public key from Tx_buy" step is not what those scripts do.

**F21. Transaction tuples lack replay protection. [TF, V]**
Eqs. (1)–(3) contain `Sig` but no nonce, deadline, chain ID, contract address binding, or EIP-712 domain. The contracts perform no signature verification at all; `Sig` is the implicit Ethereum transaction signature. Cross-chain/cross-contract replay and stale-transaction issues are unaddressed.

**F22. Unbounded on-chain data. [TF, I]**
`PDesc` and the IPFS URI/hash/key are unbounded strings stored per customer. There is no length cap, no IPFS CID validation, and no storage-growth analysis, despite the paper's own warning about blockchain storage costs.

## C. Mathematical and logical verification

**F23. There is no mathematical model to verify. [MW, V]**
Eqs. (1)–(3) are transaction records, not formulations of the system. The paper has:
- no formal definition of fairness, liveness, or non-repudiation;
- no adversary model or security game;
- no proof or reduction;
- no game-theoretic equilibrium for the incentive claims;
- no complexity analysis (gas is measured, not derived);
- no queueing model for the throughput claims;
- no statistical model (no CIs, no repeats, no significance tests).

**F24. The "similarity" and "threshold" are undefined. [TF, V]**
"Abnormally close" (p. 41821), "a predefined threshold" (p. 41822), and "the similarity value" are never quantified. Without a metric (Hamming? normalized correlation?), a threshold value, and a calibration procedure, the plagiarism decision is not reproducible or auditable.

**F25. The economic claims are asserted, not modeled. [MW, V]**
"Attackers' balance would be drained quickly" (p. 41822) has no cost/gain analysis. A failed comparison costs the buyer only gas (≈ $1.70) and yields a **full refund**, while imposing gas + IPFS upload on the seller. With free addresses, address-based bans do not deter. No bond sizing, no Sybil cost, no collusion analysis, no bribery analysis.

**F26. Internal inconsistency in throughput. [MW, V]**
Three different saturation points appear: "nearly 1500 TPS" (abstract/contributions), "more than 1,200" (p. 41825), "less than 1300"/"threshold of 1300" (p. 41826), and "limited at around 1,200 TPS" (Section IV). These are not reconciled.

**F27. Cost under-reporting. [MW, V]**
Table 2's 250,633 gas = 59,082 (`registerRequest`) + 101,676 (`grantAccess`) + 89,875 (`compareHashes`), exactly. It excludes:
- `initialize` (90,957 gas), which is part of every `listAsset` transaction;
- the listing itself (`listAsset` 159,133 gas);
- `withdrawFund` (28,549 gas), without which the seller never receives funds.
True cost for a single-sale listing ≈ 529,272 gas ≈ **$10.03**, not $4.74 (2.1× under-report). The $4.74 figure is only valid for a heavily amortized listing and still omits withdrawal.

**F28. The gas arithmetic itself is consistent. [verified]**
89,875 × 10⁻⁸ ETH × $1,894.65 ≈ $1.70; 101,676 → $1.93; 159,133 → $3.02. So the *arithmetic* is correct; the *scope* of what is counted is not. (Good to state explicitly: this is not an arithmetic error.)

## D. Experimental and evaluation limitations

**F29. No baseline comparison with the closest related work. [MW, V]**
Table 2 compares against RBAC-SC [24], MA-ABAC [25], and ABAC [26] — **access-control** frameworks with different functionality, not DAM/trading systems. [25] is a 5M-gas outlier that inflates the comparison. The actual baselines [6]–[10] are compared only qualitatively in Table 1.

**F30. No ablation, no sensitivity analysis. [MW, V]**
No ablation of pHash, banning, reputation, royalty, or encryption. No sensitivity to gas price, token price, file size, number of buyers, or threshold. The "optimal block size 400–500" is a single-machine observation with no error bars.

**F31. No statistical rigor. [MW, V]**
Single runs, no repetitions, no confidence intervals, no significance tests. Caliper results are known to vary run-to-run.

**F32. Unrealistic consortium testbed. [MW, V]**
100 peers / 50 orderers in Docker on **one** i9-13900K with 64 GB. All traffic is loopback; containers contend for the same CPU/memory/disk. Throughput and latency are not representative of a distributed consortium. No `tc netem` WAN emulation, no CPU pinning, no multi-host deployment.

**F33. Reproducibility of the Fabric results fails. [MW, V]**
The published Caliper config `benchmarks/samples/fabric/DAM/config.yaml` runs **one** round: `listItem` only, 600 TPS, 5 seconds, 50 workers. It does not exercise purchase/grant/compare, and it does not sweep block sizes. The workload passes `parentAsset = ""`, which makes the `compareHashes` success path throw (`queryItem("")`), so root assets cannot complete. The claimed Figs. 7–9 cannot be regenerated from the artifact.

**F34. The claimed 50-orderer network is not reproducible as published. [MW, V]**
`test-network/docker/docker-compose-test-net.yaml` defines orderers 1–30 and **comments out 31–50**; the channel config lists 50 consenters; the top-level `config/configtx.yaml` still says `OrdererType: solo`. The README says 50. These must be reconciled before the claim can be reproduced.

**F35. No plagiarism-detection experiment at all. [MW, V]**
The paper's headline management contribution has zero quantitative evaluation: no dataset, no transformations, no TPR/FPR, no threshold sweep, no adversarial test.

**F36. No user study despite UI/UX claims. [MW, V]**
§III-A2 lists six design principles and claims usability, inclusivity, and trust; no SUS score, task completion time, error rate, or participant count is reported.

## E. Implementation and reproducibility

**F37. Artifacts exist but are not runnable as-is. [TF, V]**
- `deploy/deploy.js` deploys `DigitalAssetContract` with constructor args `[assetPrice]`, but the contract has **no constructor** (it uses `initialize`). The deployment script does not match the contract.
- Only `DigitalAssetContract` is deployed; the marketplace deployment is absent from `deploy/`.
- `hardhat.config.js` targets Rinkeby/Kovan (both shut down) and mainnet; no Sepolia/local L2.
- Tests are single `it("")` blocks with almost no assertions and no negative/attack cases.
- No repository-level `LICENSE` (individual files carry MIT/Apache-2.0 SPDX tags).
- Hard-coded private key in `scripts/secp256.js` and `scripts/getPubKey.js`.

**F38. No datasets, seeds, or measurement scripts. [MW, V]**
No AIGC samples, no pHash threshold, no Fabric crypto material, no Caliper seeds, no raw result logs, no CI.

## F39. Paper–code contradictions (summary)

| # | Paper claim | Code reality |
|---|---|---|
| 1 | Hash/key "hidden under a private state" (p. 41820) | Ethereum storage is public; only the getter is gated |
| 2 | "Other users can also obtain the signed key" (p. 41821) | `getEncryptedSymmetricKey` requires `userComparedHashes` |
| 3 | "Only the IPFS URL is accessible by the associated customer" (p. 41820) | `getIpfsURI(address)` is unrestricted |
| 4 | Any party can report plagiarism and earn σ (p. 41819/41822) | `reportPlagiarism` is owner-only, no reward |
| 5 | Eq. (2) has two asset addresses | Function takes one |
| 6 | Eq. (3) includes `pHash_c` | Function takes only `star` |
| 7 | Ratings accumulate into overall/seller reputation (p. 41822) | No aggregation, no reputation |
| 8 | 2 failures / 2 false reports → permanent ban (p. 41821–41822) | No counter, no ban |
| 9 | Parent owner sets royalty (p. 41822) | Ethereum: child sets it; Fabric: parent sets it, unbounded |
| 10 | Raft, 50% crash tolerance (p. 41824) | Correct for CFT, but incompatible with "trust-free" |
| 11 | Trading cost independent of data size (p. 41824) | Gas only; storage/bandwidth O(n·|D|) |
| 12 | `ECDSA_enc` (Alg. 1/2) | ECDSA cannot encrypt; repo uses ECIES-style secp256k1 |
| 13 | Plagiarism-resistant (Table 1) | No pHash in either codebase |
| 14 | SPoF eliminated (p. 41823) | Single-owner marketplace + IPFS gateways + RPC providers |

## F. Security, privacy, reliability (domain-relevant only)

**F40. Sybil resistance is absent. [TF, V]**
Addresses are free. Bans, ratings, and reports are per-address with no stake, proof-of-personhood, or cost. A seller can Sybil its own rating; a competitor can Sybil false reports; a plagiarist can rotate addresses.

**F41. Griefing is cheap and asymmetric. [TF, I]**
A buyer can repeatedly register → receive grant → fail the hash → refund, imposing IPFS + gas on the seller at only gas cost to itself. A seller can deliver garbage and lose only gas. Neither side is deterred by the asserted "economic" mechanism.

**F42. Privacy leakage. [RG, V]**
Purchase history, buyer addresses, ratings, seller revenue, and every product's pHash are public. This enables customer deanonymization, competitive intelligence, and pHash harvesting (match a leaked file to its on-chain listing). GDPR is not discussed, despite [10] being GDPR-focused.

**F43. No key lifecycle. [RG, V]**
No rotation, revocation, social recovery, or forward secrecy. If a buyer's key is compromised after the signed key is on-chain, the content is exposed forever. No discussion of endpoint compromise (the "analog hole").

**F44. Smart-contract hardening gaps. [TF, I]**
No reentrancy guard; `.transfer`; unbounded strings; no pull-payment pattern; `receive()` credits owner; no pause/emergency stop; no upgrade policy; no formal verification or fuzzing. (CEI is mostly followed, so I do **not** claim a proven reentrancy exploit — this is a hardening gap, not a demonstrated bug.)

---

# PHASE 3 — Classification of findings

| ID | Finding | Type | Confidence |
|---|---|---|---|
| F1 | Trust set not empty | RG | I |
| F2 | Fair-exchange literature ignored | RG | V |
| F3 | "First work" unsupported | RG | V |
| F4 | AIGC-specific issues unaddressed | RG | V |
| F5 | No license semantics/revocation | RG | V |
| F6 | Hash not bound to product | **TF** | V |
| F7 | Key before payment (Fabric) | **TF** | V |
| F8 | Unlimited token minting | **TF** | V |
| F9 | Re-initialization / ownership takeover | **TF** | V |
| F10 | De-listing ineffective | **TF** | V |
| F11 | Plagiarism/rating/ban not implemented | **TF** | V |
| F12 | No timeout; price-change freeze | **TF** | V |
| F13 | Payment accounting bugs | **TF** | V |
| F14 | O(n·|D|) storage | **TF/IL** | I |
| F15 | pHash fragile, unevaluated | TF/RG | V |
| F16 | Royalty contradiction | **TF** | V |
| F17 | Inheritance not verifiable | RG | V |
| F18 | Single-owner SPoF | **TF** | V |
| F19 | IPFS availability assumed | IL | V |
| F20 | ECDSA notation error; crypto unspecified | **TF** | V |
| F21 | No replay protection | **TF** | V |
| F22 | Unbounded on-chain data | **TF** | I |
| F23 | No formal model | MW | V |
| F24 | Threshold/similarity undefined | **TF** | V |
| F25 | Economics asserted, not modeled | MW | V |
| F26 | Throughput inconsistency | MW | V |
| F27 | Cost under-reporting | MW | V |
| F28 | Gas arithmetic consistent | (positive) | V |
| F29 | Wrong baselines | MW | V |
| F30 | No ablation | MW | V |
| F31 | No statistics | MW | V |
| F32 | Single-host Fabric testbed | MW | V |
| F33 | Caliper config cannot reproduce Figs. 7–9 | MW | V |
| F34 | 50 orderers not reproducible | MW | V |
| F35 | No plagiarism experiment | MW | V |
| F36 | No user study | MW | V |
| F37 | Artifacts not runnable | **TF** | V |
| F38 | No datasets/seeds/logs | MW | V |
| F39 | 14 paper–code contradictions | TF/MW | V |
| F40 | No Sybil resistance | **TF** | V |
| F41 | Cheap asymmetric griefing | **TF** | I |
| F42 | Privacy leakage | RG | V |
| F43 | No key lifecycle | RG | V |
| F44 | Contract hardening gaps | TF | I |

**Explicit limitations acknowledged by the authors** (Section IV): gas-price volatility; ~1,200 TPS ceiling; interoperability; token/currency volatility; regulatory variation; AI-tool integration. These are genuine but **do not** include any of F6–F22, which are the substantive ones.

---

# PHASE 4 — Research gap matrix (ranked)

Ranking criteria: research significance, feasibility, novelty, data/tool availability, complexity, BSc suitability.

| ID | Identified problem | Category | Evidence | Why it matters | Proposed solution | Expected improvement | Difficulty | Rank |
|---|---|---|---|---|---|---|---|---|
| G1 | Settlement hash is seller-declared over seller's own ciphertext; payment not bound to product | TF | Alg. 1 step 5; Alg. 2 step 4; §II-E1; `grantAccess`/`compareHashes` | Free-riding/false-reporting guarantees false; buyer can pay for garbage | Pre-sale plaintext commitment + bonded optimistic settlement + sampled content proof | Attack success 100% → ≤ ε; +gas on dispute only | Med-High | **1** |
| G2 | Fabric key readable before payment | TF | `queryBuyReq` has no settlement gate | Buyer gets product + refund | Gate key on settlement; atomic reveal | 100% → 0% | Low-Med | **2** |
| G3 | Token contract allows negative balances/self-mint | TF | `_transfer` check commented out | Economic model void; benchmarks invalid | Restore checks; invariant fuzzing | Sound economy | Low | **3** |
| G4 | `initialize` re-callable | TF | `DigitalAssetContract.initialize` | Ownership takeover, fund freeze | Initializer guard / immutable args | Critical vuln removed | Low | **4** |
| G5 | Plagiarism mechanism unimplemented/centralized; pHash unevaluated | TF/RG | §II-D1; Eq. (2); `reportPlagiarism`; no pHash in code | Headline contribution unverified; trivial evasion | Calibrated multi-feature fingerprint + bonded reporting + threshold sweep | TPR/FPR, evasion cost | Medium | **5** |
| G6 | De-listing ineffective | TF | `isAssetActive` never read | Takedown useless | Check active in purchase/grant | 100% enforcement | Low | **6** |
| G7 | No timeout; price change after deposit | TF | `updatePrice`; `cancelRequest` | Fund freeze/griefing | Timelocks; price snapshot | Bounded settlement | Low-Med | **7** |
| G8 | Per-buyer re-encryption/upload | TF/IL | Alg. 1 steps 4–7 | O(n·|D|) storage/bandwidth | Encrypt once + key wrapping | O(|D| + nκ) | Low | **8** |
| G9 | Incentives asserted, not modeled; no Sybil cost | MW/RG | §II-D4; address bans | Attacks may be profitable | Game model + agent simulation + bonds | Attack ROI < 0 | Medium | **9** |
| G10 | Evaluation lacks baselines/ablations/stats | MW | §III; Table 2 | Claims unsupported | Re-run with baselines, 30 runs, CIs | Credible evidence | Medium | **10** |
| G11 | Raft CFT vs trust-free claim | RG | §III-A1; etcdraft | Byzantine orderer can censor | SmartBFT/BFT-SMaRt + eval | BFT guarantee | High | **11** |
| G12 | IPFS availability not incentivized | IL | §II-A3; §II-E4 | Paid buyer may not retrieve | Pinning bonds / erasure coding / Arweave | Availability under churn | Med-High | **12** |
| G13 | No AIGC provenance; pixel-level plagiarism only | RG | Fig. 3; §II-D1 | Style mimicry/model extraction unaddressed | Provenance manifest + style embeddings + C2PA | Detect derivative style | High | **13** |
| G14 | No license semantics/revocation | RG | Eq. (1) | Cannot express rights | ERC-4907/5635-inspired license tokens | Expressiveness + gas | Medium | **14** |
| G15 | Privacy leakage | RG | §II-D2; public state | Deanonymization | Commit-reveal ratings, ZK membership | Privacy metrics | High | **15** |
| G16 | Reproducibility of Fabric results | MW | Caliper config; compose file | Figs. 7–9 unverifiable | Full harness + seeds + artifacts | Reproducible | Low-Med | **16** |

---

# PHASE 5 — Seven thesis directions

## D1. MetaTrade-R: Auditing and Repairing Fairness, Availability, and Plagiarism Protection in Blockchain-Based AIGC License Trading

1. **Title:** as above.
2. **Research problem:** MetaTrade's claimed trust-free guarantees are not enforced by its protocol or code; can a repaired design provide *verifiable* fairness and plagiarism resistance at acceptable cost?
3. **Limitation addressed:** G1, G2, G4, G6, G7, G9, G10 (and G3 as a prerequisite).
4. **Technical solution:** (i) reproducible attack harness; (ii) pre-sale content commitment (Merkle root of plaintext + ciphertext); (iii) bonded optimistic settlement with timeouts and sampled content proof; (iv) enforced de-listing, parent-set royalty, access control, pull payments; (v) optional calibrated fingerprint for plagiarism.
5. **Novelty:** empirical audit + a *joint* settlement/plagiarism/royalty protocol for AIGC licenses + attack-cost analysis. Not a new cryptographic primitive.
6. **Algorithms/tech:** Solidity, Hardhat/Foundry, OpenZeppelin, ECIES (secp256k1), AES-GCM/CTR, Merkle trees, IPFS, Python attack harness, Echidna/Slither, Caliper (optional).
7. **Math foundation:** fairness definitions (buyer/seller fairness + termination), commitment binding, sampling soundness `(1-ε)^k`, bond conditions `b_s > p`, `b_b > p`, attack ROI.
8. **Data/experiments:** base vs repaired; 8–10 attacks; gas/latency; 30 runs; synthetic + public AIGC samples.
9. **Metrics:** attack success rate, gas/op, gas/cycle incl. listing+withdraw, p50/p95 latency, attacker ROI, invariant coverage.
10. **Expected results:** all G1–G7 attacks blocked under stated bonds; honest-path gas ≤ 2× base; dispute path bounded; quantified cost of fairness.
11. **Complexity:** medium-high; 2 semesters; strong Solidity + Python.
12. **Publication value:** high for a student track/workshop; possible short journal paper if evaluation is rigorous.

## D2. Robust, Calibrated, Attack-Aware Plagiarism Detection and Bonded Reporting for AIGC Marketplaces

1. **Title:** "Beyond pHash: Calibrated Multi-Feature Fingerprinting and Bonded Proof-of-Plagiarism for AIGC Marketplaces."
2. **Problem:** pHash is fragile and never evaluated; reporting is centralized, rewardless, and Sybil-able.
3. **Limitation:** G5 (+G6, G9).
4. **Solution:** build an attack suite (crop, rotate, scale, JPEG, color, noise, border, mirror, adversarial perturbation); benchmark pHash/dHash/aHash/PDQ/CLIP/DINOv2 embeddings; calibrate thresholds; design a compact on-chain fingerprint (e.g., 128-bit LSH) + similarity oracle; bonded reporting with slashing.
5. **Novelty:** first *empirical* robustness/calibration study for AIGC marketplace plagiarism; bonded reporting design.
6. **Tech:** Python, PyTorch/timm, FAISS, imagehash, OpenCV, Solidity, Hardhat.
7. **Math:** ROC/EER, TPR@FPR=1%, Hamming/LSH collision bounds, bond/reward conditions.
8. **Data:** Copydays, INRIA Holidays, Oxford5k; DiffusionDB/GenImage/CIFAKE; synthetic transformations.
9. **Metrics:** TPR/FPR/EER, evasion rate per attack, query latency, on-chain gas, report cost.
10. **Expected:** pHash geometric recall < 50% at 1% FPR; ensemble improves ≥ 20 pp; bonded reporting makes spam unprofitable.
11. **Complexity:** medium; very feasible.
12. **Publication value:** medium-high (applied ML + security).

## D3. O(1) Content-Key Wrapping and L2 Re-engineering of AIGC License Trading

1. **Title:** "Scalable AIGC License Distribution: Constant-Storage Key Wrapping and Layer-2 Settlement."
2. **Problem:** per-buyer re-encryption/re-upload is O(n·|D|); L1 gas is volatile and high.
3. **Limitation:** G8, G10, G12 (partly).
4. **Solution:** encrypt once with a content key; wrap the content key per buyer (ECIES); store one ciphertext; deploy on Optimism/Arbitrum; measure.
5. **Novelty:** modest; mostly engineering + measurement. Best as a component of D1.
6. **Tech:** Solidity, ECIES, IPFS, Optimism/Arbitrum testnets, Hardhat.
7. **Math:** storage/bandwidth complexity, cost model, amortization.
8. **Data:** synthetic files of varying size; n buyers 1–10,000.
9. **Metrics:** bytes stored, upload time, gas, $/sale, latency.
10. **Expected:** storage O(|D| + nκ) vs O(n|D|); L2 cost ~10²–10³× lower.
11. **Complexity:** low.
12. **Publication value:** low-medium alone; strong as a section.

## D4. BFT-Ordered Consortium AIGC Marketplace

1. **Title:** "From Crash-Fault to Byzantine-Fault Tolerance in Consortium AIGC Marketplaces."
2. **Problem:** Raft provides CFT, but the paper claims trust-free; malicious orderers can censor/reorder.
3. **Limitation:** G11, G16.
4. **Solution:** deploy Fabric with SmartBFT (or BFT-SMaRt), 4–7 orderers, f Byzantine; measure throughput/latency under attack.
5. **Novelty:** quantifies the trust/performance trade-off for AIGC marketplaces.
6. **Tech:** Fabric 2.5/3.0, SmartBFT, Docker, Caliper, Go/JS chaincode.
7. **Math:** BFT quorum `n ≥ 3f+1`, latency/throughput model.
8. **Data:** synthetic workloads; no ML data.
9. **Metrics:** TPS, latency, view-change time, censorship resistance.
10. **Expected:** BFT costs 2–5× throughput vs Raft but removes the trust assumption.
11. **Complexity:** high (infrastructure).
12. **Publication value:** medium.

## D5. AIGC Provenance and Style-Level Plagiarism

1. **Title:** "Provenance-Aware AIGC Marketplaces: Binding Generation Parameters and Detecting Style-Level Derivatives."
2. **Problem:** the framework records no model/prompt/seed/LoRA; pHash cannot detect style mimicry.
3. **Limitation:** G13, G4.
4. **Solution:** provenance manifest (model hash, prompt hash, seed, LoRA/ControlNet hashes, C2PA); style embedding similarity (e.g., DINOv2/CLIP) with calibration; on-chain compact commitment.
5. **Novelty:** high; AIGC-specific.
6. **Tech:** PyTorch, diffusers, CLIP/DINOv2, FAISS, C2PA, Solidity.
7. **Math:** embedding distance distributions, threshold calibration, provenance hash chain.
8. **Data:** DiffusionDB, GenImage, a small style dataset (e.g., WikiArt + generated derivatives).
9. **Metrics:** style-detection AUC, false accusation rate, provenance completeness, gas.
10. **Expected:** style detection AUC > 0.85; provenance improves attribution.
11. **Complexity:** high (ML + subjective labels).
12. **Publication value:** high, but risky for a BSc timeline.

## D6. Machine-Readable, Revocable AIGC License Tokens

1. **Title:** "License-Aware AIGC Trading: On-Chain Scope, Duration, Derivative Rights, and Revocation."
2. **Problem:** "license-based" assets have no license semantics; no revocation.
3. **Limitation:** G14, G5.
4. **Solution:** ERC-1155/4907/5635-inspired license tokens with scope/duration/derivatives; revocation registry; royalty enforcement.
5. **Novelty:** medium; standards integration.
6. **Tech:** Solidity, ERC-4907/2981/5635, Hardhat.
7. **Math:** rights algebra, gas model.
8. **Data:** synthetic license scenarios.
9. **Metrics:** expressiveness coverage, gas, revocation latency.
10. **Expected:** richer rights at ≤ 1.5× gas.
11. **Complexity:** medium.
12. **Publication value:** medium.

## D7. Privacy-Preserving Reputation and Dispute Resolution

1. **Title:** "Private but Accountable: Commit-Reveal Reputation and Privacy-Preserving Disputes for AIGC Marketplaces."
2. **Problem:** public purchase/rating data leaks privacy; ratings are Sybil-able.
3. **Limitation:** G15, G9.
4. **Solution:** commit-reveal ratings, stake-weighted reputation, ZK membership for eligible raters, encrypted dispute evidence.
5. **Novelty:** medium-high.
6. **Tech:** Solidity, circom/snarkjs, Semaphore, Python simulation.
7. **Math:** privacy games, Sybil cost, stake-weighted estimators.
8. **Data:** agent-based simulation; no real users.
9. **Metrics:** deanonymization resistance, Sybil cost, gas, latency.
10. **Expected:** privacy preserved at 2–5× gas; Sybil cost linear in stake.
11. **Complexity:** high.
12. **Publication value:** medium-high.

---

# PHASE 6 — Feasibility and reproducibility (top 3)

| Item | D1 | D2 | D3 |
|---|---|---|---|
| Base code available | Yes, both repos | Yes (for integration) | Yes |
| Base code runnable as-is | **No** (deploy script mismatch, dead testnets, trivial tests) | N/A | No |
| License | No repo LICENSE; Solidity files MIT SPDX; Fabric sample Apache-2.0 | N/A | Same |
| Datasets | Public AIGC samples (DiffusionDB, GenImage, CIFAKE); synthetic | Copydays, Holidays, Oxford5k + AIGC | Synthetic |
| Tools | Hardhat/Foundry, OZ, Echidna, Slither, IPFS, Python | PyTorch/timm, FAISS, imagehash, OpenCV | Hardhat, IPFS, L2 |
| Student laptop | Yes (local chain + Python); Fabric 100 nodes **no** | Yes; GPU optional (Colab) | Yes |
| Cloud/paid | No (testnet faucets, free RPC tiers) | No (Colab free) | No |
| Measurable | Yes (attacks, gas, latency, ROI) | Yes (TPR/FPR, evasion) | Yes (bytes, gas, $) |
| Main risk | Dispute mechanism complexity | "No fingerprint is robust" negative result | Incremental novelty |

**Key reproducibility facts:**
- Both repos are public and were inspected. The Ethereum repo has contracts, tests, gas reports, deploy scripts. The Fabric repo is largely a fork of `caliper-benchmarks` plus `DamChaincode`.
- The Ethereum gas numbers in the paper are reproducible from `gas-report.txt` (F28).
- The Fabric performance numbers are **not** reproducible from the published Caliper config (F33).
- The claimed 50-orderer network is not reproducible as published (F34).
- No dataset, seed, threshold, or raw log is provided.

---

# PHASE 7 — Preliminary framework for D1 (not a final proposal)

### 1. Title
**MetaTrade-R: Auditing and Repairing Fairness, Availability, and Plagiarism Protection in Blockchain-Based AIGC License Trading**

### 2. Background and motivation
AIGC licenses are sold repeatedly to pseudonymous buyers. The base paper claims trust-free trading but (i) binds payment to a seller-declared ciphertext hash, (ii) releases the key before payment in its Fabric version, (iii) does not implement its plagiarism mechanism, and (iv) has no liveness or Sybil resistance. A repaired design must make fairness *checkable*, not merely asserted.

### 3. Problem statement
Given a seller S, buyer B, asset D, price p, and no trusted arbitrator, design a protocol such that (a) B pays only if it obtains D matching a commitment made **before** the sale, (b) S is paid if it delivers D, (c) both parties terminate within a bounded time, and (d) plagiarism reports are costly to fake and profitable to make honestly — at a gas/latency cost acceptable for AIGC licenses.

### 4. Research questions
- **RQ1:** Which of MetaTrade's stated security properties are actually enforced by its published implementation?
- **RQ2:** Can a pre-sale content commitment + bonded optimistic settlement close the product-binding gap without a trusted arbitrator, and at what cost?
- **RQ3:** How robust is pHash-based plagiarism detection under content-preserving and adversarial transformations, and can a calibrated fingerprint improve the TPR/FPR trade-off?
- **RQ4:** Are the repaired incentives sufficient to make the identified attacks unprofitable for a rational adversary?

### 5. Objectives
O1 reconstruct and attack the base system; O2 formalize fairness/liveness and the attack-cost model; O3 design MetaTrade-R; O4 implement and verify (unit, invariant, fuzz); O5 evaluate attacks, gas, latency, fingerprint robustness, and attacker ROI.

### 6. Hypotheses
- **H1:** ≥ 6 of 8 attacks succeed on the base implementation; after repair, success ≤ ε under stated bonds.
- **H2:** Honest-path gas ≤ 2× base; settlement latency ≤ 5 s on L2.
- **H3:** pHash recall under geometric attacks < 50% at 1% FPR; a calibrated ensemble improves recall by ≥ 20 pp at the same FPR.

### 7. Identified gap
G1 (product binding), G2 (key-before-payment), G4/G6/G7 (enforcement/liveness), G9 (incentives), G5 (plagiarism).

### 8. Methodology
1. **Artifact reconstruction:** fix deployment, run base on a local chain, reproduce gas.
2. **Threat modeling:** STRIDE-like + fair-exchange adversary; define attack tree.
3. **Attack harness:** 8–10 scripts, each with success criterion and cost measurement.
4. **Protocol design:** commitments, bonds, timers, enforcement, reporting.
5. **Implementation:** Solidity + Python client; invariant tests (Echidna) + static analysis (Slither).
6. **Evaluation:** base vs repaired; gas/latency; fingerprint ROC; agent-based ROI simulation.
7. **Analysis/write-up:** threats to validity, reproducibility package.

### 9. System architecture (textual)
```
Seller ──list(commit C_plain, C_cipher, pHash, price, royalty, bond)──▶ Registry
Buyer  ──purchase(price + dispute bond)──────────────────────────────▶ Settlement
Seller ──deliver(CID, ECIES(K_content))──────────────────────────────▶ Settlement
Buyer  ──confirm()  or  dispute(sampled chunks + Merkle proofs)──────▶ Settlement
Settlement ──pay seller / refund buyer / slash bond───────────────────▶ Parties
Reporter ──report(bond, fingerprint pair)────────────────────────────▶ Plagiarism
Registry ──active flag enforced in purchase/deliver───────────────────▶ All
Storage  ──IPFS + pinning bond────────────────────────────────────────▶ CID
```
Contracts: `AssetRegistry`, `LicenseSale` (escrow/bonds/timers), `PlagiarismRegistry`, `Reputation` (commit-reveal), `StorageBond`.

### 10. Mathematical formulation
- **Commitment:** `C_plain = MerkleRoot(H(chunk_i))`, `C_cipher = MerkleRoot(H(enc_i))`, published at listing.
- **Buyer fairness:** if B pays p, then `Pr[¬Verify(D, C_plain)] ≤ ε`.
- **Seller fairness:** if B obtains D with `Verify(D, C_plain)=1`, then S receives p except with negligible probability.
- **Termination:** within `T_max = T_deliver + T_confirm`, either both or neither.
- **Sampling soundness:** if the delivered plaintext differs in an ε-fraction of chunks, `Pr[undetected] = (1-ε)^k`; choose `k = ⌈ln δ / ln(1-ε)⌉`.
- **Bond conditions:** `b_s > p` (garbage delivery), `b_b > p` (false refund), `b_r > reward` (spam reports).
- **Royalty:** `payout_child = p(1-r)`, `payout_parent = pr`, `r ∈ [0, r_max]` fixed by the parent at listing.
- **Reputation:** `R = Σ w_i s_i / Σ w_i`, `w_i = stake_i · e^{-λΔt}`.
- **Attack ROI:** `ROI(a) = (G(a) - C(a)) / C(a)`; deterrence requires `ROI(a) ≤ 0`.

### 11. Algorithms (pseudocode, to be refined)
- `list(asset, price, r, bond)`: compute `C_plain`, `C_cipher`, `pHash`; store; lock bond.
- `buy(asset)`: require active; lock `p + b_b`; snapshot price.
- `deliver(id, CID, K_wrapped)`: require active, within `T_deliver`; store; start `T_confirm`.
- `confirm(id)`: verify caller; pay seller; return bonds; mark license.
- `dispute(id, indices, chunks, proofs)`: require within `T_confirm`; verify Merkle proofs against `C_cipher`/`C_plain`; decrypt sampled chunks; if mismatch → slash seller, refund buyer; else slash buyer.
- `timeout(id)`: after `T_deliver` → refund buyer + slash seller; after `T_confirm` → pay seller.
- `report(a, b, bond)`: compare committed fingerprints; if similarity ≥ τ → de-list later asset, reward reporter, slash plagiarist; else slash reporter.
- `rate(asset, commitment)`: commit-reveal; weight by stake; no re-rating.

### 12. Implementation plan (indicative, 24 weeks)
W1–3 reproduce base; W4–6 threat model + attack harness; W7–10 protocol design + formal spec; W11–16 contracts + client + tests; W17–19 gas/latency + L2; W20–21 fingerprint experiments; W22 simulation; W23–24 write-up + artifact.

### 13. Experimental design
- **Conditions:** base MetaTrade (Ethereum + Fabric), MetaTrade-R, naive escrow baseline, FairSwap-style baseline (optional).
- **Attacks:** A1 garbage delivery; A2 key-before-payment; A3 re-initialization; A4 self-mint; A5 price-change freeze; A6 de-listed trading; A7 plagiarism evasion; A8 Sybil rating/report; A9 refund-and-keep; A10 IPFS unpinning.
- **Runs:** 30 repetitions; mean ± 95% CI; McNemar for attack success; Wilcoxon for gas/latency.
- **Datasets:** Copydays/Holidays for near-duplicate; DiffusionDB/GenImage/CIFAKE for AIGC; synthetic file sizes.
- **Environment:** Hardhat/Foundry local; Sepolia; Optimism Sepolia; Caliper optional.

### 14. Metrics
Attack success rate; gas per operation and per full cycle (including listing and withdrawal); p50/p95 latency; throughput; TPR/FPR/EER and evasion rate; attacker ROI; invariant/test coverage.

### 15. Expected contributions
1. A reproducible audit and attack harness for MetaTrade.
2. MetaTrade-R: a commitment + bond + timeout + enforcement protocol.
3. Empirical evidence on the cost of fairness and the robustness of AIGC plagiarism detection.
4. Design guidelines for AIGC license marketplaces.

### 16. Limitations and threats to validity
No full cryptographic proof (game-based sketch only); sampling soundness weak for tiny tampering (mitigate with full-hash for bounded sizes); L2 sequencer trust; image-only fingerprint evaluation; rational-adversary simulation; single-host Fabric numbers; legal/copyright questions out of scope.

### Inherited vs new

| Inherited from base paper | New in this thesis |
|---|---|
| Problem framing, actors, pHash idea | Threat model + attack harness |
| Hybrid AES + ECIES + IPFS | Pre-sale plaintext/ciphertext commitments |
| Per-product contract, marketplace | Bonded optimistic settlement + timeouts |
| Royalty and rating ideas | Parent-set, enforced royalty; commit-reveal, stake-weighted ratings |
| Dual Ethereum/Fabric deployment | Enforced de-listing; access-control fixes; pull payments |
| Gas/throughput evaluation style | Baselines, ablations, 30 runs, CIs, L2, attacker ROI |
| — | Bonded, Sybil-resistant plagiarism reporting |

---

# PHASE 8 — Academic integrity and novelty verification

### What is **not** novel (must be cited, not claimed)
- **Fair exchange / atomic exchange:** FairSwap (CCS 2018, DOI 10.1145/3243734.3243857); OptiSwap (AsiaCCS 2020, DOI 10.1145/3320269.3384749); FairDEx (DAPPS 2021); BDTS (arXiv:2211.10001); FDE/VECK (CCS 2024, DOI 10.1145/3658644.3690248); dual-deposit escrow (ICBC 2019, DOI 10.1109/BLOC.2019.8751482); Fair-Trade (IEEE TQ 2024).
- **Perceptual hashing and its weaknesses:** ACM TOMM survey 2025 (DOI 10.1145/3727880); hash-evasion/inversion (arXiv:2406.00918); Hamming distributions (arXiv:2212.08035); Ofcom 2022 report.
- **AIGC provenance/lifecycle:** AIGC-Chain / CTrace (arXiv:2406.14966; IEEE TDSC 2025); ACM CSUR 2025 AIGC security survey (DOI 10.1145/3729419).
- **License/royalty standards:** ERC-4907, ERC-2981, ERC-5635; NFT standards analysis (arXiv:2508.07190).
- **Metaverse reputation:** Cryptography 2025 review (DOI 10.3390/cryptography9040074).

### What **may** be novel (to be verified by the student)
1. A reproducible, code-level **audit** showing that MetaTrade's stated guarantees are not enforced (this is a factual contribution, not a claim of cryptographic novelty).
2. A **joint** protocol that binds content commitment, settlement, plagiarism adjudication, and royalty enforcement for **AIGC access licenses** (as opposed to generic fair exchange).
3. An **AIGC-specific threat model** and **attack-cost analysis** (garbage delivery, key-before-payment, Sybil reporting, pHash evasion).
4. Empirical evidence on the **cost of fairness** (gas/latency) for AIGC licenses, including L2.

### Honest risk statement
A reviewer may say: "This is FairSwap/FDE applied to AIGC." To avoid that, the thesis must:
- foreground the **audit** and the **negative result** (the base system does not enforce its claims);
- contribute the **joint** design (settlement + plagiarism + royalty + reporting), not just a swap;
- provide **AIGC-specific** evidence (pHash/style robustness, license semantics);
- position as **systems + empirical security**, not as a new cryptographic primitive.

### Novelty search terms to run before finalizing
`"fair exchange" AIGC`, `"AI-generated content" marketplace smart contract fairness`, `"perceptual hash" plagiarism blockchain`, `"bonded escrow" digital goods`, `"optimistic" content verification NFT`, `"license token" AIGC`, `"proof of plagiarism" blockchain`, `"AIGC" copyright blockchain 2024 2025 2026`.

---

# PHASE 9 — Top 3 and recommendation

## Rank 1 — D1: MetaTrade-R (audit + repair)
- **Why worthwhile:** addresses the most severe verified flaw (payment not bound to product) and the trust-free overclaim.
- **Exact weaknesses:** G1, G2, G4, G6, G7, G9, G10.
- **What we do differently:** pre-sale commitments, bonded optimistic settlement, timeouts, enforced de-listing/royalty, attack harness.
- **Measurable improvement:** attack success 100% → ≤ ε; honest-path gas ≤ 2×; quantified ROI.
- **BSc suitability:** high if scoped in tiers (audit + economic repair first; sampled proof second).
- **Publication:** strong student-track/workshop; possible short journal paper.

## Rank 2 — D2: Robust, calibrated plagiarism detection + bonded reporting
- **Why worthwhile:** the headline management contribution has zero evaluation; pHash is demonstrably fragile.
- **Exact weakness:** G5 (+G6, G9).
- **What we do differently:** attack suite, multi-feature calibration, compact on-chain fingerprint, bonded reports.
- **Measurable improvement:** TPR@1%FPR, evasion rate, report cost.
- **BSc suitability:** very high; low infrastructure risk.
- **Publication:** medium-high applied ML/security.

## Rank 3 — D3: O(1) key wrapping + L2 re-engineering
- **Why worthwhile:** fixes an unacknowledged O(n·|D|) inefficiency and the cost-volatility limitation.
- **Exact weakness:** G8, G10.
- **What we do differently:** encrypt once + wrap keys; L2 deployment; full cost accounting.
- **Measurable improvement:** storage/bandwidth and $/sale.
- **BSc suitability:** very high; low risk; but lower novelty.
- **Publication:** low-medium alone; strong as a component of D1.

## Recommendation
**Choose D1, scoped in three tiers:**
- **Tier 1 (must):** reproducible audit + attack harness + economic/enforcement repair + gas/latency + attacker-ROI simulation.
- **Tier 2 (should):** sampled content-proof dispute (dual Merkle commitments + chunk verification) on a local chain/L2.
- **Tier 3 (nice):** calibrated fingerprint + bonded plagiarism reporting + L2 cost comparison.

This gives a genuine research contribution (audit + protocol repair + empirical validation), is implementable on a laptop, and has a clear fallback if Tier 2 proves too complex. It also leaves room to absorb D2/D3 as components, which strengthens the thesis rather than diluting it.

**Do not** frame the thesis as "a new fair-exchange protocol" — frame it as "an empirical audit and a scoped repair of a deployed AIGC marketplace, with measured fairness/robustness/cost trade-offs."

---

## Appendix A — Key evidence index

| Topic | Location |
|---|---|
| Abstract / trust-free claim | p. 41815 |
| Related work [6]–[10] | pp. 41816–41817 |
| Open issues 1–3 | pp. 41817–41818 |
| Table 1 (self-assessed) | p. 41818 |
| Eq. (1) | p. 41820 |
| Algorithm 1 | p. 41820 |
| Algorithm 2 | p. 41821 |
| Eq. (2), Eq. (3) | p. 41822 |
| Plagiarism / rating / inheritance | pp. 41821–41822 |
| Economic model | p. 41822 |
| Security analysis | pp. 41822–41823 |
| Fig. 3 (SD/LoRA/ControlNet) | p. 41823 |
| Fabric setup (100 nodes/50 orderers) | p. 41824 |
| Gas/cost (Figs. 5–6, Table 2) | pp. 41824–41825 |
| Throughput/latency (Figs. 7–9) | pp. 41825–41826 |
| Open challenges | pp. 41826–41827 |
| Conclusion | p. 41827 |

## Appendix B — Repository evidence index

| Finding | File / function |
|---|---|
| Seller-declared hash | `contracts/DigitalAssetContract.sol` → `grantAccess`, `compareHashes` |
| Re-initialization | `initialize` (no guard) |
| Unrestricted IPFS URI | `getIpfsURI(address)` |
| Key gating | `getEncryptedSymmetricKey` (requires `userComparedHashes`) |
| Price change | `updatePrice` (onlyOwner, no timelock) |
| Refund blocked after grant | `cancelRequest` (requires empty `ipfsURI`) |
| Overpayment trapped | `registerRequest` + `compareHashes` |
| Prior refund wiped | `compareHashes` → `userFundWithdrawable[msg.sender] = 0` |
| Owner-only plagiarism | `dam-marketplace.sol` → `reportPlagiarism` |
| No rating aggregation | `rateAsset` |
| De-listing unused | `isAssetActive` never read by `DigitalAssetContract` |
| Key before payment (Fabric) | `DamChaincode/lib/digital_asset.js` → `queryBuyReq` |
| Unlimited mint | `DamChaincode/lib/tokenERC20.js` → `_transfer` (check commented) |
| Root-asset failure | `compareHashes` → `queryItem(item.parentAsset)` with `""` |
| Item overwrite | `listItem` (no uniqueness check) |
| Benchmark mismatch | `caliper-benchmarks/.../DAM/config.yaml` (listItem only, 600 TPS, 5 s) |
| Orderer mismatch | `test-network/docker/docker-compose-test-net.yaml` (31–50 commented) |
| Deploy mismatch | `deploy/deploy.js` (args to a constructor that does not exist) |
| Hard-coded key | `scripts/secp256.js`, `scripts/getPubKey.js` |
