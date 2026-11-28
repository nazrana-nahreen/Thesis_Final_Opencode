# MetaTrade-R: Auditing and Repairing Content Binding, Confidentiality, and Dispute Resolution in Blockchain-Based AIGC Licence Trading

**BSc Thesis Draft — Computer Science and Engineering**

Candidate: [name]  
Supervisor: [name]  
Department: [department]  
Date: 28 November 2026

> **Evidence status (not part of the thesis).** This draft distinguishes four evidence levels:
> *measured on this build*, *executed test*, *analytical model*, and *not evaluated*. Every measured
> number is read from an artefact under `experiments/results/` or from a test run recorded in
> `docs/MEASURED_RESULTS.md`. Where a claim is not supported, the text says so. The two headline
> negative results are that storage is at parity with the published baseline (not a reduction) and
> that classical perceptual hashes fail under rotation and horizontal flip.

---

## Abstract

Blockchain marketplaces for AI-generated content (AIGC) inherit a fair-exchange problem: payment
and digital content must be exchanged between parties who do not trust one another, while a smart
contract cannot directly inspect the content's meaning. This thesis audits MetaTrade (IEEE Access,
2024) and designs, implements, and evaluates MetaTrade-R, a prototype intended to bind settlement
to content committed before a sale.

The code-level audit catalogues 44 paper-to-artifact findings across MetaTrade's algorithms and
published Ethereum and Hyperledger Fabric implementations. It identifies a central settlement flaw:
the contract compares values derived from seller-supplied ciphertext and a seller-declared hash,
establishing self-consistency rather than binding payment to the advertised asset. Other findings
include a pre-settlement key disclosure in the Fabric flow, unimplemented plagiarism and rating
features, and discrepancies between the paper and code. A separate self-audit records 15 findings
in MetaTrade-R, including accepted design limitations.

MetaTrade-R adapts a FairSwap-style construction. The seller commits to plaintext and ciphertext
hashes, their Merkle roots, and a key commitment before listing. A buyer can challenge an
inconsistent block with an on-chain proof; the contract recomputes the relevant HMAC-CTR
keystream block. This provides deterministic integrity checking of committed bytes, not semantic
verification of the advertised asset. The thesis also derives a bond condition parameterised by
the probability that a semantic substitution is detected.

The prototype includes five Solidity contracts, a Fastify API, IPFS integration, a TypeScript
cryptographic reference, a CLI, a watcher, and minimal comparison baselines. Recorded evaluation
The evaluation record reports 99 passing test results (85 reverified in the latest rerun; 14
backend passes remain from the prior run), 17 of 20 executable attack scenarios blocked, one
mitigated, and two residual. The mean per-sale cycle costs 455,384 gas, and a Mode-1 dispute costs 243,048 gas
(10-run mean). Across four local 100-cycle runs, median throughput is 16.73 sales/s (median run
mean cycle time: 61.35 ms). An 80-image,
non-AIGC pilot of classical perceptual hashes achieves 76.8% ensemble TPR at 1.01% test FPR
overall, but 0% under ±15-degree rotation and 9.4% under horizontal flip.

These results do not establish AIGC originality, production security, or trust-free operation.
Disputes reveal the content key; HMAC-CTR is not authenticated encryption; parent-authorised
royalty rates are not enforced; and the fingerprint pilot does not establish AIGC robustness.
The contribution is an empirical audit and evaluated systems prototype, not a new cryptographic
primitive or a production marketplace.

**Keywords:** AIGC trading, blockchain, content binding, fair exchange, smart contracts, dispute
resolution, Merkle trees, HMAC-CTR, IPFS, perceptual hashing.

---

## Table of Contents

1. Introduction
2. Background and Related Work
3. A Code-Level Audit of MetaTrade
4. Design of MetaTrade-R
5. Implementation
6. Evaluation
7. Discussion
8. Conclusion and Future Work
References
Appendix A. Artefact Map
Appendix B. Reproduction Commands
Appendix C. Attack Matrix
Appendix D. Descriptive Gas Statistics
Appendix E. Glossary

---

# Chapter 1 — Introduction

## 1.1 AIGC as an economic good

Generative systems produce images, text, audio, video, and three-dimensional assets that can be
copied and redistributed at low marginal cost. This creates a licensing challenge: digital
exclusivity is difficult to enforce through the file itself, while authorship and provenance do
not follow automatically from the content. A marketplace must therefore communicate the offered
asset and licence terms, transfer payment, and deliver the corresponding digital goods.

Blockchain systems can represent listings and licence records, hold payment in escrow, and expose
settlement state for public inspection. They do not, however, make the exchange fair by themselves.
The central problem is *fair exchange*: how can mutually distrustful parties exchange payment and
content so that neither party can benefit by withholding, substituting, or misrepresenting what it
owes?

## 1.2 The fair-exchange problem

Digital goods can be copied, so a simple exchange creates asymmetric risk. If the buyer pays first,
the seller may fail to deliver; if the seller delivers first, the buyer may refuse payment.
Escrow reduces payment risk but does not solve content verification: a contract can hold funds and
check cryptographic values, but it cannot directly determine whether a file has the advertised
meaning, quality, or provenance.

The fair-exchange literature offers several answers. FairSwap [14] encrypts a file with a stream
cipher whose keystream is derived from a public PRF, commits to the ciphertext with a Merkle tree,
and lets the contract recompute one block of keystream to adjudicate a misbehaviour proof. OptiSwap
[15] adds an optimistic challenge period. FDE/VECK [16] and verifiable encryption [19] provide
stronger guarantees with zero-knowledge proofs at substantially higher cost. Dual-deposit escrow
[17] requires both parties to post bonds. Each design makes a different trade-off between on-chain
cost, cryptographic assumptions, and the confidentiality of the goods.

## 1.3 The MetaTrade claim and its gap

MetaTrade [1] proposes to solve AIGC exchange with hybrid encryption and IPFS. The seller encrypts
the asset, stores the ciphertext off-chain, and publishes hashes on-chain. After payment, the seller
delivers the content key wrapped to the buyer's public key. The contract checks that a
buyer-computed hash of the ciphertext equals the hash the seller declared.

This check is insufficient as a content-binding mechanism. Both sides of the comparison are
derived from the seller-supplied ciphertext and seller-declared value. A seller can therefore
publish arbitrary bytes and their matching hash; the check can pass without establishing that the
bytes correspond to the advertised asset. It proves internal consistency, not correspondence to a
pre-sale commitment. The security objective is to bind settlement to content commitments fixed
before the buyer pays.

The distinction is not cosmetic. It separates two properties that the literature frequently
conflates:

- **Integrity** — the bytes the buyer receives are the bytes the seller committed to before
  payment. This is a cryptographic property and can be enforced deterministically.
- **Semantic correctness** — the committed bytes really are the advertised asset (the promised
  style, subject, quality, or model output). This is not a property of any hash; it requires
  similarity detection, human judgement, or an oracle, and can at best be enforced
  probabilistically and economically.

MetaTrade claims both, implements neither, and its plagiarism and rating components are not present
in the published code. This thesis makes the gap explicit and turns it into a design requirement.

## 1.4 Research questions

The work is organised around five questions:

- **RQ1.** Which of MetaTrade's stated security properties are actually enforced by its published
  implementation?
- **RQ2.** Can payment be bound to a pre-sale content commitment, with on-chain-provable disputes
  and no trusted arbitrator, at acceptable cost?
- **RQ3.** What are the gas, latency, storage, and bandwidth costs of that binding?
- **RQ4.** Under what bond and detection-probability conditions is honest participation
  economically rational?
- **RQ5.** What performance do classical perceptual hashes achieve in the evaluated image
  transformation pilot, and what do the results imply about their use for AIGC originality
  detection?

The corresponding objectives are: (i) conduct a reproducible audit of the published code; (ii)
design and implement a content-binding settlement protocol; (iii) separate integrity from semantic
correctness with distinct procedures and trust assumptions; (iv) measure the cost of the resulting
guarantees; and (v) connect bond sizing to detection probability.

## 1.5 Contributions

1. **Reproducible audit (C1).** A 44-item critical review of MetaTrade's paper, algorithms, and
   published implementations, with file/function/line evidence for code-level defects, plus a
   separate 15-item severity-ranked self-audit of the repaired system.
2. **Content-binding settlement (C2).** A Commit–Recompute–Challenge (CRC) protocol that adapts the
   FairSwap construction with per-buyer ECIES key wrapping. Payment is bound to commitments made
   before the sale, and confidentiality is preserved on the honest path.
3. **Integrity/semantic separation (C3).** A two-mode dispute design: deterministic on-chain
   recomputation for integrity and a reveal-based procedure for non-delivery, while explicitly
   keeping semantic correctness outside the protocol's cryptographic guarantees.
4. **Bond-sizing model (C4).** An explicit incentive-compatibility condition relating the seller
   bond to the probability that a semantic substitution is detected.
5. **Measured costs and negative results (C5).** Thirty-repetition gas measurements, a local
   latency/throughput measurement, a storage model that corrects an earlier overclaim, and a
   perceptual-hash pilot that reports rotation and flip failures rather than hiding them.
6. **Executable evidence (C6).** Baselines B1/B2, a 20-scenario attack matrix driven by the real
   Foundry tests, three stateful invariants, and watcher integration tests against a real chain.

We do not claim a new fair-exchange protocol, a new cryptographic primitive, a new perceptual hash,
or formal verification. The contribution is an audited repair, an implementation, and an empirical
characterisation of its guarantees and costs.

## 1.6 Scope and non-claims

The prototype is a research system evaluated on a local Anvil chain with a local IPFS node. It is
not a production deployment. In particular:

- Confidentiality is guaranteed on the honest path only. A dispute publishes the content key
  (AT-14), and this is an accepted residual risk.
- HMAC-CTR provides confidentiality but not authenticated encryption; integrity comes from hash
  commitments and Merkle proofs.
- Semantic correctness is not enforced cryptographically. Perceptual hashing is a similarity
  signal, not proof of originality or plagiarism.
- Royalty credit funding is implemented and tested. The prototype does not yet enforce
  parent-authorised royalty rates: it uses the derivative child's stored `royaltyBps` value.
- The system relies on twelve enumerated trust assumptions (TA1–TA12), including ledger finality,
  correct SHA-256 evaluation, IPFS availability during the delivery window, and wallet-key custody.
- Gas figures are 30-repetition local-chain measurements (10 for dispute paths), reported with
  mean, median, standard deviation, and p95. They are not mainnet estimates.
- The fingerprint experiment is a pilot on 80 public photographs with classical hashes. It does not
  evaluate Copydays, Holidays, Oxford5k, DiffusionDB, GenImage, PDQ, CLIP, or DINOv2.
- Theorems in this thesis are informal arguments, not machine-checked proofs.
- The Next.js user interface mentioned in earlier project documents was deleted and has not been
  recreated; the evaluated interface is the HTTP API and CLI.

## 1.7 Structure

Chapter 2 positions the work against AIGC provenance, fair exchange, commitment schemes,
confidentiality mechanisms, and blockchain dispute resolution. Chapter 3 reports the audit of
MetaTrade. Chapter 4 states the system model, adversary model, trust assumptions, and protocol.
Chapter 5 describes the implementation and the baselines. Chapter 6 reports the evaluation,
including negative results. Chapter 7 discusses what the evidence does and does not establish.
Chapter 8 concludes and lists future work.

---

# Chapter 2 — Background and Related Work

## 2.1 Blockchain settlement and escrow

A smart contract is a program whose execution and state transitions are replicated by a blockchain [2].
For a marketplace, the relevant capability is conditional custody: a contract can hold funds and
release them only when a specified condition is satisfied. The condition is evaluated by the
contract itself, so it must be expressible in deterministic code over on-chain data.

This is the root of the content-verification problem. A contract can check a hash, a signature, a
Merkle proof, or a timestamp. It cannot open a JPEG, judge whether an image is aesthetically the
advertised asset, or decide whether a model output infringes a style. Any design must therefore
decide which properties are enforced on-chain and which are delegated to cryptography, economics,
or off-chain judgement.

Ethereum's account model, ERC-20/ERC-721/ERC-1155 token standards, and the SHA-256 precompile are
the concrete primitives used in this thesis. The implementation targets Solidity 0.8.31 and the
Osaka EVM, with Foundry for testing and Anvil for a local chain.

## 2.2 Fair exchange

Fair exchange asks how two parties can swap items such that either both receive what they want or
neither does. The literature divides into three families.

**Optimistic protocols.** FairSwap [14] is the closest technical ancestor of the exchange core.
The seller encrypts a file with a stream cipher whose keystream is derived from a public PRF,
commits to the ciphertext with a Merkle tree, and allows the contract to recompute one block of
keystream to adjudicate a misbehaviour proof. The seller reveals the decryption key on-chain at
settlement, so the content becomes public after every sale. OptiSwap [15] adds an optimistic
challenge period and reduces on-chain cost.

**Verifiable-encryption protocols.** FDE/VECK [16] and Camenisch–Shoup-style verifiable encryption
[19] use zero-knowledge proofs to establish that a ciphertext encrypts a committed value. They
provide strong fairness but require heavy cryptography and proving infrastructure.

**Bonded protocols.** Dual-deposit escrow [17] requires both parties to post bonds and slashes the
bond of a party that misbehaves. The security argument is economic rather than cryptographic. A
generalisation of FairSwap and OptiSwap [18] improves efficiency but retains the public-key
assumption.

MetaTrade-R occupies the lightweight end of this spectrum. It keeps FairSwap's recomputation
mechanism, adds per-buyer ECIES key wrapping so that the key is not public on the honest path, and
uses bonds for the properties that cannot be decided deterministically. It does not use ZK proofs
and does not rely on an oracle for integrity.

## 2.3 Commitments and Merkle proofs

A cryptographic commitment binds a party to a value while hiding it. A hash commitment
`Com(x) = H(salt || x)` is hiding if the salt has sufficient entropy and binding if `H` is collision
resistant. Merkle trees provide membership proofs in `O(log n)` hash operations [20]. Transparency
overlays [21] use Merkle trees for provable consistency and popularise the idea of a proof of
inconsistency, which the dispute procedure in this thesis instantiates for content blocks.

MetaTrade-R commits to four objects: a salted hash of the plaintext, a salted hash of the
ciphertext, a Merkle root over plaintext blocks, and a Merkle root over ciphertext blocks. The pair
of roots is what makes the on-chain check meaningful: the contract can verify that a specific
ciphertext block is the one that was committed, decrypt it with the revealed key, and compare the
result against the committed plaintext leaf. A single root would only prove that *some* ciphertext
existed.

## 2.4 Confidentiality, ECIES, and stream ciphers

Public-key key wrapping is the standard way to deliver a symmetric key to one recipient. ECIES over
secp256k1 is widely deployed and supported by Ethereum tooling. The content itself is encrypted with
a symmetric stream cipher. In this work the keystream is generated by HMAC-SHA256 in counter mode:

```
kEnc    = HMAC-SHA256(K, 0x01)
ks(i,j) = HMAC-SHA256(kEnc, 0x03 || uint64(i) || uint32(j))
C_i     = D_i XOR ks(i,0) || ks(i,1) || ...
```

The construction is chosen because the EVM can recompute one word cheaply through the SHA-256
precompile, which is what makes on-chain adjudication possible without a zero-knowledge proof. It
is a PRF-based stream cipher, not AES-GCM and not an AEAD. It provides confidentiality under the
PRF assumption but no ciphertext authentication; integrity is provided separately by the hash
commitments and Merkle proofs. A production deployment should use a standardised AEAD and, where
semantic correctness matters, an oracle or attestation.

Cassiopeia [22] shows that heavy on-chain cryptography is feasible but expensive. The design here
deliberately avoids it. The trade-off is explicit: FairSwap-style protocols reveal the key to the
contract, and therefore to everyone, at settlement. Encrypting the key to the buyer preserves
confidentiality while the sale is honest, but the key must be revealed if the buyer disputes
non-delivery. A buyer who already holds the key can also publish it. Confidentiality is therefore
conditional on honest behaviour, not absolute.

## 2.5 AIGC provenance and perceptual hashing

Provenance systems such as C2PA content credentials and DECADE [3], and blockchain-based
authenticity frameworks such as [28], attach signed metadata to media.
They answer "who claims to have produced this, and with what tool", not "is this the file I paid
for". AIGC-Chain [9] tracks the lifecycle of generated content on a ledger, focusing on provenance
rather than trading fairness. Zhang et al. [8] survey AIGC security and identify the absence of a
binding between delivered content and payment as an open problem.

Perceptual hashing maps an image to a short fingerprint that is intended to be stable under
content-preserving transformations. pHash, dHash, aHash, and wHash are classical 64-bit
constructions. A survey of perceptual hashing [26] documents their fragility under rotation,
cropping, mirroring, and adversarial perturbation. The thesis uses perceptual hashing only as a
measured similarity signal for estimating the detection probability `P_d` in the bond model. It is
not part of the on-chain integrity guarantee, and it is not evidence of authenticity, authorship,
or originality. In particular, a hash miss does not prove the absence of plagiarism, while a hash
match does not prove that a seller committed the advertised AIGC asset.

## 2.6 MetaTrade in detail

Truong, Le, and Le [1] propose MetaTrade for AIGC trading in the metaverse, using AES-256 for
content, secp256k1 for key wrapping, and IPFS for ciphertext. The published system has two
implementations: an Ethereum/Solidity contract set and a Hyperledger Fabric chaincode set. The
paper claims resistance to free-riding, false reporting, data leakage, alteration, and plagiarism
without a trusted third party.

The settlement flow is roughly:

1. The seller encrypts the asset and uploads the ciphertext to IPFS.
2. The seller lists the asset on-chain with a hash of the ciphertext.
3. The buyer pays and receives a wrapped content key.
4. The buyer computes a hash of the ciphertext it retrieved and compares it with the seller's hash.
5. If the hashes match, payment is released; otherwise the buyer reports a mismatch.

Step 4 is the flaw. The buyer's hash is computed over the seller's ciphertext, and the seller's hash
was also computed over the seller's ciphertext. A malicious seller can choose both. The check
therefore establishes self-consistency, not binding to the advertised product.

## 2.7 Comparative positioning

**Table 2.1. Content binding, confidentiality, and dispute properties.**

| System | Year | Content binding | Confidentiality | Dispute mechanism | AIGC-specific |
|---|---|---|---|---|---|
| MetaTrade [1] | 2024 | No (self-hash) | Claimed; leaks in Fabric flow | Hash comparison | Partial (pHash) |
| FairSwap [14] | 2018 | Yes (PRF recomputation) | No (key public at settlement) | On-chain proof | No |
| OptiSwap [15] | 2020 | Yes | No | Optimistic challenge | No |
| FDE/VECK [16] | 2024 | Yes (ZK) | Partial | ZK proof | No |
| DECADE [3] | 2025 | No | Watermark-based | Off-chain | Yes (C2PA) |
| Story Protocol [4] | 2025 | No | Not specified | Not specified | Yes |
| UMA OO [23] | — | Not applicable | Not applicable | Oracle | No |
| **MetaTrade-R** | 2026 | **Yes (PRF recomputation)** | **Honest path only** | **On-chain, two modes** | **Partial** |

## 2.8 Research gaps

- **G1.** No reviewed system binds payment to the delivered content for AIGC licences.
  MetaTrade's check is self-consistency; FairSwap handles generic files but not licences.
- **G2.** No reviewed system combines content binding with confidentiality on the honest path.
  FairSwap publishes the key; MetaTrade's Fabric flow leaks it before payment.
- **G3.** Integrity and semantic correctness are conflated. No reviewed system separates them into
  distinct procedures with distinct trust assumptions.
- **G4.** Bond sizing is not linked to fingerprint robustness in existing AIGC marketplaces.
- **G5.** No AIGC marketplace has been empirically audited at the code level.

MetaTrade-R addresses G1 through CRC settlement, G2 through per-buyer key wrapping, G3 through
two-mode disputes, G4 through a detection-probability-linked bond condition, and G5 through a
scripted audit. Semantic disputes still require an oracle or human judgement, and AIGC-specific
licence semantics beyond royalty splitting are out of scope.

---

# Chapter 3 — A Code-Level Audit of MetaTrade

## 3.1 Method and evidence discipline

The audit follows a fixed procedure. For each claim in the paper, the corresponding code path is
located at file, function, and line level. The claim is then classified as:

- **verified** — the behaviour is directly visible in the artefact;
- **inferred** — it follows from the code but is not directly demonstrated by a test;
- **suspected** — plausible but not established by the available artefacts.

Every finding is tagged with a category: technical flaw (TF), research gap (RG), implementation
limitation (IL), or methodological weakness (MW). Severity is assigned per finding rather than as a
single aggregate distribution, because the findings span code defects, unsupported claims, and
evaluation gaps. The full catalogue is `docs/base_paper_critical_review.md`; this chapter
summarises the findings that drive the design.

The Ethereum implementation audited here is the published `MetaTrade-Ethereum-main` tree. The
Fabric implementation is the published chaincode tree. The Fabric performance results could not be
reproduced because the commercial Caliper configuration and the described 50-orderer network are
not included in the artefacts (F33, F34); those results are therefore not used as a baseline.

## 3.2 The core binding flaw

**F6 (TF, verified).** The settlement check is self-referential. In the Ethereum contract,
`compareHashes` compares a buyer-supplied hash with a seller-declared hash over the seller's own
ciphertext. In the Fabric chaincode, the same pattern appears in the access and comparison flow.
The seller controls the ciphertext, the declared hash, and the key. A seller can upload arbitrary
bytes `D_g`, compute `H(D_g)`, publish `H(D_g)`, and deliver a key that decrypts `D_g`. The buyer's
check succeeds, payment is released, and the buyer receives garbage.

This is not a cryptographic subtlety. It is a missing commitment. A binding check requires a value
that was fixed *before* the seller knew the buyer or the payment, and that the seller cannot change
afterwards. MetaTrade has no such value. The audit therefore treats "content binding" as a
first-class requirement, not as a property that follows from hashing.

The flaw also explains why the plagiarism and rating components matter so much in the paper's
argument. If the settlement check bound content, plagiarism detection would be a secondary
reputation mechanism. Because the check does not bind content, the paper's security argument leans
on mechanisms that are not implemented.

## 3.3 Security-relevant defects

**F7 (TF, verified). Pre-payment key disclosure in the Fabric flow.** In
`DamChaincode/lib/digital_asset.js`, `grantAccess` stores the encrypted symmetric key in the
request, and `queryBuyReq` returns the whole request to the buyer with no settlement-state gate. The
buyer can register, read the key, decrypt the content, call `compareHashes` with a wrong hash, and
receive a full refund. The buyer obtains both the product and the money. This directly falsifies the
fairness claim for the Fabric version.

**F8 (TF, verified). Unlimited token minting.** In `tokenERC20.js`, `_transfer` has the
insufficient-balance check commented out, and the `from` and `to` balances are updated
independently. A self-transfer from an account with zero balance yields a positive balance. The
payment layer is economically meaningless, and any throughput measured on that chaincode was
measured with the payment logic disabled.

**F9 (TF, verified). Re-callable initialisation.** `DigitalAssetContract.initialize(...)` has no
initializer guard and no `require(owner == address(0))`. Anyone can re-initialise a clone, replace
the owner, change the price or parent, redirect royalties, or freeze pending deposits.

**F10 (TF, verified). De-listing has no effect.** `DamMartketplace.isAssetActive` is written by
`cancelListing` and `reportPlagiarism`, but it is never read by `DigitalAssetContract`. A
de-listed or plagiarism-flagged asset still accepts `registerRequest` and `grantAccess`. The
takedown mechanism is cosmetic.

**F11 (TF, verified). Plagiarism and rating are not implemented.** The paper describes a
plagiarism report and a rating aggregation, but the published code does not contain a working
implementation. `reportPlagiarism` is owner-only and does not affect trading; the rating fields are
not aggregated into a decision.

**F12 (TF, verified). No timeout and price-change freeze.** A sale has no deadline. If the seller
never delivers, the buyer's funds remain locked. A seller can also raise the price after a buyer has
deposited, and the buyer's deposit is not protected by a snapshot. Both are liveness and fairness
defects.

**F13 (TF, verified). Payment accounting bugs.** `registerRequest` accepts `msg.value >= price` but
credits only the listed price, so any excess is trapped with no accounting. `compareHashes` zeroes
`userFundWithdrawable`, wiping a prior refund owed to the buyer. `withdrawFund` uses `.transfer`,
which breaks smart-contract wallets. `receive()` credits the owner for stray ETH. The listing fee is
collected but has no withdrawal path.

**F16 (TF, verified). Royalty semantics contradict the paper.** The paper says the parent owner
decides the royalty rate. In the Ethereum implementation, the child's `commissionRate` is passed
into `initialize`, so the parent has no say. In the Fabric implementation, `compareHashes` reads the
parent's rate with no bounds check and a raw multiplier, so a parent can set a value greater than
one and block or drain the child's escrow. The two implementations enforce opposite rules.

**F18 (TF, verified). Single-owner marketplace.** `contractOnwer` is a single externally owned
account controlling de-listing and plagiarism adjudication. This contradicts the paper's claim that
third-party and single-point-of-failure issues are eliminated. No multisig, timelock, DAO, or
upgrade policy is described.

**F20 (TF, verified). Cryptographic notation and specification.** The paper uses ECDSA where it
means key encapsulation or encryption, does not specify the KDF or the stream-cipher mode, and
provides no test vectors. The implementation's security therefore cannot be checked against the
paper's description.

**F21 (TF, verified). No replay protection.** The transaction tuples contain a signature but no
nonce, deadline, chain identifier, contract-address binding, or EIP-712 domain. The contracts perform
no signature verification; the signature is the implicit Ethereum transaction signature.
Cross-chain and cross-contract replay are unaddressed.

**F41 (TF, inferred). Cheap asymmetric griefing.** A buyer can repeatedly register, receive access,
fail the hash check, and obtain a refund, imposing IPFS and gas costs on the seller at only gas cost
to itself. A seller can deliver garbage and lose only gas. The asserted economic mechanism does not
deter either behaviour.

**F42 (RG, verified). Privacy leakage.** Purchase history, buyer addresses, ratings, seller revenue,
and every product's perceptual hash are public. This enables customer deanonymisation, competitive
intelligence, and fingerprint harvesting. GDPR is not discussed.

## 3.4 Evaluation and reproducibility problems

**F27 (MW, verified). Cost under-reporting.** Table 2 of the paper reports 250,633 gas, which is
exactly the sum of `registerRequest` (59,082), `grantAccess` (101,676), and `compareHashes` (89,875).
It excludes `initialize` (90,957), the listing transaction (`listAsset`, 159,133), and
`withdrawFund` (28,549), without which the seller never receives funds. A full single-sale cycle is
about 529,272 gas, roughly 2.1 times the reported figure. The arithmetic is correct; the scope of
what is counted is not.

**F33/F34 (MW, verified). Fabric results are not reproducible.** The Caliper configuration and the
50-orderer network described in the paper are not included in the artefacts. The reported
throughput and latency therefore cannot be independently reproduced, and they are not used as a
baseline in this thesis.

**F37 (TF, verified). Artefacts are not runnable as published.** Dependency versions, deployment
steps, and environment assumptions are incomplete. This thesis repaired the Foundry dependencies
and documented the exact commands used (Appendix B), but the base artefacts remain as published.

**F39 (TF/MW, verified). Fourteen paper–code contradictions.** The review records a table of
fourteen places where the paper's description and the published code disagree. Examples include
storage privacy, key access, IPFS URI restriction, plagiarism reporting, the signature equations,
rating aggregation, the ban rule, royalty ownership, Raft versus trust-free, O(1) cost, ECDSA
encryption, plagiarism resistance, and the single point of failure. The contradictions are not
cosmetic: several of them are the difference between a claimed guarantee and no guarantee.

**F14 (TF, inferred). Per-buyer re-encryption in the paper's algorithm.** Algorithm 1 generates a
fresh symmetric key and uploads a fresh ciphertext for every buyer. The paper's claim that "the
trading cost is fixed no matter the data size" is true for gas but not for storage, pinning cost,
upload bandwidth, or encryption time. The published Ethereum contract, however, stores one key
string per buyer rather than re-uploading the asset. This distinction matters for the storage
comparison in Chapter 6: the audit criticises the algorithm, while the measured comparison uses what
the published contract actually does.

## 3.5 What the audit implies for design

Five requirements follow directly from the findings:

1. **Bind before sale.** The seller must publish a commitment to the plaintext and ciphertext
   before the buyer pays. The commitment must be immutable for the life of the listing.
2. **Make the check deterministic where possible.** If the contract can recompute the relevant
   block, the integrity dispute does not need an arbitrator, an oracle, or a challenge period.
3. **Separate integrity from semantics.** A hash can bind bytes; it cannot prove that the bytes are
   the advertised asset. The design must say which mechanism handles which property.
4. **Protect liveness.** Timeouts and refunds are part of the security property, not an
   afterthought. A sale that can be locked forever is a denial-of-service vector.
5. **Account for every wei.** Bonds, refunds, royalties, and excess payments need explicit paths.
   The audit found trapped ETH and wiped refunds; the repaired design uses exact payment, pull
   royalties, and invariants over the escrow balance.

## 3.6 Summary

The audit does not show that MetaTrade is useless. It shows that its central security claim is not
enforced by its code, and that several secondary claims are also unsupported. For a thesis, this is
a useful starting point: the defects are concrete, reproducible, and they translate into design
requirements. The next chapter turns those requirements into a protocol.

---

# Chapter 4 — Design of MetaTrade-R

## 4.1 System model and roles

The system architecture consists of three participant roles, one on-chain modular contract suite, and three off-chain infrastructure components:

**Participant roles:**
- **Seller.** Owns the asset, computes cryptographic commitments, encrypts the content with a symmetric key `K`, uploads the ciphertext to IPFS, deposits the required seller bond, and lists the asset.
- **Buyer.** Pays the purchase price plus a spam-deterrent buyer bond, receives the ECIES-wrapped key, decrypts and validates the content locally, and either confirms the transaction or initiates an on-chain dispute.
- **Upstream Creator (Parent Seller).** Author of an original asset from which secondary derivatives are created; receives automated royalty disbursements enforced by on-chain lineage tracking.

**On-chain contract suite:**
- **`AssetRegistry`.** Maintains immutable listing records, cryptographic commitments (`hD`, `hC`, `R_D`, `R_C`, `cK`), pricing, and parent lineage.
- **`SaleEscrow`.** Manages escrowed funds, bonds, state transitions, and timeout adjudications.
- **`DisputeVerifier`.** Stateless verifier executing deterministic one-block HMAC-CTR keystream recomputations and Merkle proof validations.
- **`RoyaltySplitter`.** Pull-based royalty accrual and distribution preserving escrow solvency.
- **`LicenceToken`.** ERC-1155 token contract minting cryptographic proof-of-licence upon settlement.

**Off-chain components:**
- **Decentralised storage (IPFS / Kubo).** Hosts encrypted content addressed by cryptographic hashes (`C`).
- **Backend service (Fastify).** Handles asset packaging, encryption, client-side proof generation, and HTTP REST interface.
- **Watcher daemon.** Monotonically tracks on-chain events, updates local indexing, and auto-triggers expired settlement timeouts.

The adversary is a probabilistic polynomial-time participant who controls one or more roles and may
deviate arbitrarily from the protocol. The ledger is assumed live and eventually final; the SHA-256
precompile is assumed correct; IPFS is assumed available during the delivery window; wallets are
assumed to protect their keys.

## 4.2 Trust assumptions

**Table 4.1. Trust assumptions.**

| ID | Assumption | Consequence if false |
|---|---|---|
| TA1 | SHA-256 is collision-resistant | Commitments can be equivocated |
| TA2 | HMAC-SHA256 is a pseudorandom function | Keystream predictable; content recoverable without `K` |
| TA3 | ECIES over secp256k1 is IND-CCA secure (or IND-CPA plus integrity) | Wrapped key recoverable |
| TA4 | The EVM executes correctly; finalised state is not reorganised | Settlement can be reversed |
| TA5 | The buyer controls its private key and verifies hashes locally | Buyer can be cheated by a substituted asset |
| TA6 | `C` is retrievable during the delivery window | Buyer cannot verify; must dispute |
| TA7 | Block timestamps are monotonic within a bounded tolerance | Timeouts can be gamed |
| TA8 | For semantic disputes, at least one of an honest watcher or a bonded committee with public evidence | Semantic fraud goes unpunished |
| TA9 | Adversaries are rational and risk-neutral for the economic claims | Bounded only by gas and bonds |
| TA10 | The front-end is honest, or the user verifies commitments independently | Asset substitution |
| TA11 | No collusion beyond the modelled pairs | Unmodelled coalitions may profit |
| TA12 | `K` is unique per asset | Keystream reuse across assets leaks XOR of plaintexts |

The list is deliberately explicit. The system is not trust-free: it reduces the trust set relative
to a platform marketplace, but it does not empty it.

## 4.3 Content preparation and commitments

Let `D` be the plaintext, `L = |D|` its byte length encoded as a 32-bit big-endian integer, and `β`
the block size in bytes, with `256 ≤ β ≤ 65536`. The seller samples independent random values `K`
(content key), `N` (nonce), `s` (key-commitment salt), `salt_D`, and `salt_C`, and computes:

```
hD = SHA-256(0x04 || salt_D || L || D)
hC = SHA-256(0x05 || salt_C || L || C)
```

The domain tags prevent a hash computed for one purpose from being reinterpreted as another. The
salts make the commitments hiding: without `salt_D`, a low-entropy asset could be recovered by
guessing. Binding follows from collision resistance: finding `D' ≠ D` with `hD(D') = hD(D)` is a
SHA-256 collision.

The listing stores `hD`, `hC`, the two Merkle roots, the key commitment, the block size, the block
count, the price, the royalty rate (capped at 5000 basis points), and an optional parent asset. The
seller cannot change these values after listing without creating a new listing, and the escrow
snapshots the price at purchase time.

## 4.4 Encryption and key wrapping

The content key is expanded into a keystream with HMAC-SHA256:

```
kEnc    = HMAC-SHA256(K, 0x01)
ks(i,j) = HMAC-SHA256(kEnc, 0x03 || uint64(i) || uint32(j))
C_i     = D_i XOR ks(i,0) || ks(i,1) || ...
```

Here `i` is the block index and `j` the 32-byte word index within the block. The construction is a
counter-mode stream cipher with HMAC-SHA256 as the PRF. It is chosen because the EVM can recompute
one word cheaply through the SHA-256 precompile, which is what makes on-chain adjudication possible
without a zero-knowledge proof. It is not AES-GCM and it is not an AEAD; integrity is provided
separately by the hash commitments and Merkle proofs.

The key commitment is:

```
cK = SHA-256(0x08 || K || N || s)
```

The seller wraps `K` to the buyer's secp256k1 public key with ECIES:

```
encK = ECIES.Enc(pk_B, K)
```

`encK` is delivered on-chain. Only the buyer can unwrap it, so the honest path preserves
confidentiality even though the ciphertext is public on IPFS. The contract never needs `K` to verify
delivery; it needs `K` only when a dispute is adjudicated. This is the central architectural
trade-off: confidentiality on the honest path, disclosure on the disputed path.

## 4.5 Merkle commitments and consistency proofs

The seller splits `D` and `C` into the same `m = ceil(L/β)` blocks and computes leaves:

```
leafD_i = SHA-256(0x06 || uint64(i) || D_i)
leafC_i = SHA-256(0x07 || uint64(i) || C_i)
```

Internal nodes use a distinct tag:

```
node = SHA-256(0x09 || left || right)
```

Including the index in the leaf prevents a seller from permuting or reusing blocks across
positions. The roots `R_D` and `R_C` are stored on-chain. A proof for block `i` consists of the
sibling path in each tree, which is `O(log m)` hashes. For a 5 MiB asset with 1 KiB blocks
(`m = 5120`), each path is about 13 hashes, so a two-tree proof is roughly 26 hashes regardless of
file size.

The consistency relation checked by the contract is:

```
verify(R_C, leafC_i, i, proofC)
verify(R_D, leafD_i, i, proofD)
D_i' = C_i XOR ks(i)
SHA-256(0x06 || uint64(i) || D_i') == leafD_i
```

All three conditions must hold. The first two bind the supplied blocks to the committed trees; the
third binds the decryption of the committed ciphertext to the committed plaintext. Omitting the
first two would let a buyer fabricate a block that was never committed; omitting the third would
reduce the check to the self-consistency error criticised in MetaTrade.

## 4.6 Settlement state machine

A sale moves through the states in Table 4.2. `T_deliver`, `T_confirm`, and `T_respond` are absolute
timestamps derived from `block.timestamp`.

**Table 4.2. Sale states and transitions.**

| State | Transition | Caller | Guard | Next state | Value movement |
|---|---|---|---|---|---|
| — | `buy(assetId)` | buyer | `msg.value = price + 0.001 ETH`; seller credit ≥ price | `ESCROWED` | price + buyer bond held; seller bond reserved |
| `ESCROWED` | `deliver(encK)` | seller | `now ≤ T_deliver`; wrapped-key length 32–1024 bytes | `DELIVERED` | none |
| `ESCROWED` | `timeoutDeliver()` | anyone | `now > T_deliver` | `REFUNDED` | price + buyer bond to buyer; seller bond slashed to buyer |
| `DELIVERED` | `confirm()` | buyer | `now ≤ T_confirm` | `SETTLED` | price minus royalty to seller; royalty to parent; both bonds returned; licence minted |
| `DELIVERED` | `disputeMode1(proof)` | buyer | `now ≤ T_confirm` | `SETTLED` | consistent: seller paid, buyer bond forfeited; inconsistent: refund plus seller bond to buyer |
| `DELIVERED` | `disputeMode2()` | buyer | `now ≤ T_confirm` | `CHALLENGED` | none |
| `CHALLENGED` | `respond(K,N,s)` | seller | `now ≤ T_respond`; `cK` matches | `DELIVERED` | none; key becomes public |
| `CHALLENGED` | `timeoutRespond()` | anyone | `now > T_respond` | `REFUNDED` | refund plus seller bond to buyer |
| `DELIVERED` | `timeoutConfirm()` | seller | `now > T_confirm` | `SETTLED` | as `confirm()` |

The windows are one day for delivery, two additional days for confirmation or challenge, and one
day for a seller response. The buyer bond is a spam deterrent: a buyer who files an integrity
dispute that the contract rejects forfeits it. The seller bond is set to the sale price and is
reserved from a credit balance deposited before listing, which prevents a seller from listing an
asset it cannot back.

**Implementation notes (contract invariants enforced after audit fixes).**

- **Late-respond time-bar (AT-31):** On a valid `respond(K, N, s)`, `SaleEscrow` extends `T_confirm` to `max(T_confirm, block.timestamp + CONFIRM_EXTENSION)` (`CONFIRM_EXTENSION = 1 days`), giving the buyer a full dispute window following key revelation and preventing the seller from settling prematurely via `timeoutConfirm()`.
- **Revealed-key enforcement in Mode 1:** Separately from `AT-31`, whenever `keyRevealed` is true, `disputeMode1()` verifies `proof.K == revealedK`, `proof.N == revealedN`, and `proof.s == revealedS`, reverting with `InvalidKey()` if mismatched.
- **Mode-2 re-challenge cap (AT-32):** A boolean flag `mode2Challenged` limits each sale to at most one Mode-2 challenge, reverting any repeat `disputeMode2()` call with `AlreadyChallenged()` so a buyer cannot loop `disputeMode2()`/`respond()` to stall settlement indefinitely.

## 4.7 Dispute procedures

**Mode 1 — integrity dispute.** The buyer holds `K`, has decrypted the content locally, and has
found a block that does not match the committed plaintext. It submits
`(K, N, s, i, C_i, leafD_i, proofD, proofC)`. `DisputeVerifier` checks the key commitment, both
Merkle paths, and the recomputed leaf. If all checks pass, the seller committed an inconsistent pair
of trees and loses the bond; the buyer is refunded and receives the seller bond. If any check fails,
the buyer's claim is rejected, the sale settles to the seller, and the buyer forfeits its bond. The
decision is deterministic: there is no sampling, no challenge period, and no arbitrator.

**Mode 2 — non-delivery or bad key.** The buyer cannot decrypt because `encK` is malformed, because
the seller delivered the wrong key, or because the seller delivered nothing usable. The buyer opens
a challenge. The seller must reveal `(K, N, s)` within `T_respond`; the contract accepts the response
only if the key commitment matches. If the seller responds, the buyer can decrypt and, if the
content is inconsistent, proceed with Mode 1. If the seller does not respond, the buyer is refunded
and the seller bond is slashed. Mode 2 is therefore a forced-revelation procedure, not a correctness
oracle.

Both modes are necessary because they cover different failures. Mode 1 assumes the buyer can
decrypt; Mode 2 handles the case where it cannot. Collapsing them into one procedure either lets a
seller withhold the key (if only Mode 1 exists) or lets a buyer force disclosure without proving
anything (if only Mode 2 exists).

## 4.8 Bond economics

Let `p` be the price, `b_s` the seller bond, `P_d` the probability that a semantic substitution is
detected, `c_g` the cost of producing the garbage asset, and `c_d` the cost of defending a dispute. A
risk-neutral seller chooses between honest participation, with profit `p − c_h`, and a semantic
substitution, with expected profit:

```
E[π_semantic] = (1 − P_d)(p − c_g) − P_d(b_s + c_d).
```

Deterrence requires `E[π_semantic] < 0`, which gives:

```
b_s > ((1 − P_d)(p − c_g) − P_d c_d) / P_d.
```

For `c_g ≈ 0` and `c_d ≤ p`, the condition simplifies to:

```
b_s > ((1 − P_d)/P_d) · p.
```

Solvency adds a second constraint, because the bond must also cover the refund:

```
b_s = max(p, ((1 − P_d)/P_d) · p).
```

If detection is a coin flip (`P_d = 0.5`), the bond must exceed the price; if detection is one in ten
(`P_d = 0.1`), it must exceed nine times the price. The model assumes rationality and risk
neutrality. It does not deter a griefing attacker who derives utility from harm, and it does not
replace detection: if `P_d` is zero, no finite bond works. This is why the perceptual-hash
experiment matters, and why its negative results are reported rather than hidden.

## 4.9 Complexity

Let `L` be the content size, `β` the block size, `m = ceil(L/β)` the number of blocks, and `s` the
number of sampled blocks when sampling is used.

**Table 4.3. Asymptotic costs.**

| Operation | Cost | Notes |
|---|---|---|
| Encryption | `O(L)` | one pass, `ceil(β/32)` HMAC calls per block |
| Commitment | `O(m)` leaves plus `O(m)` internal nodes | `O(L)` hashing overall |
| Listing | `O(1)` on-chain storage | nine 32-byte commitment fields plus metadata (367 bytes measured) |
| Delivery | `O(1)` on-chain | wrapped key is bounded at 1024 bytes |
| Mode 1 dispute | `O(log m + β/32)` | two Merkle paths plus one block recomputation |
| Confirmation | `O(1)` on-chain | local verification is off-chain |
| Per-sale storage | `O(1)` | one wrapped key (129 bytes measured), not a re-encryption |

The ciphertext is stored once on IPFS in B0, B2, and B3. The published Ethereum B0 stores one key
string per buyer (`customerAddrToData[buyer].encryptedSymmetricKey`), and B3 stores one 129-byte
wrapped key per sale. The storage model is therefore near parity between B0 and B3; this thesis
does not claim a storage reduction. What B3 adds is buyer-side verification, a dispute procedure,
and royalty accounting, at roughly 2.1 times the per-sale gas.

## 4.10 What is deliberately not solved

Five limitations remain outside or alongside the cryptographic guarantee and are stated as such:

1. **Semantic correctness.** A seller can commit consistently to garbage. The preview, fingerprint,
   bond, and reputation are the defences; they are probabilistic and economic.
2. **Dispute-path confidentiality.** A dispute reveals `K`. Per-chunk keys would limit the leak to
   one chunk but would not eliminate it.
3. **Parent royalty authority.** The prototype fixes the royalty-funding defect and can transfer
   credited ETH to the registered parent, but the child listing still supplies `royaltyBps`; the
   parent has no on-chain mechanism that prevents a child from selecting a lower rate or a
   discrepancy with the parent's authorised terms.
4. **IPFS availability.** The design assumes the ciphertext is retrievable during the delivery
   window. A pinning bond or erasure coding would be needed for a production guarantee.
5. **Licence semantics and privacy.** The prototype mints an ERC-1155 licence and splits a royalty;
   it does not enforce expiry, scope, revocation, or privacy of purchase history.

---

# Chapter 5 — Implementation

## 5.1 Repository and toolchain

The implementation is a Foundry project with a TypeScript backend and cryptographic reference. The
main directories are:

- `src/` — five Solidity contracts;
- `test/` — seven Foundry suites;
- `crypto/` — TypeScript HMAC, Merkle, encryption, and ECIES code;
- `api/src/` — Fastify routes and services;
- `watcher/` — event watcher;
- `harness/` — attack-matrix runner;
- `experiments/` — E2–E8 runners and results;
- `scripts/` — deployment and end-to-end demo;
- `docs/` — audit, design, measured results, and thesis materials.

The pinned toolchain is Solidity 0.8.31, Foundry/Anvil 1.10.0, Node.js 22.14.0, Python 3.10.9, and
Kubo 0.32.1. The compiler uses `optimizer = true`, `optimizer_runs = 200`, and `via_ir = true`. The
development chain is Anvil with chain ID 31337.

## 5.2 Contracts

**`AssetRegistry`.** Stores listings and immutable commitments. `list` takes the plaintext and
ciphertext hashes, the two Merkle roots, the key commitment, the listing leaves, the preview CID,
the fingerprint, the block count and size, the price, the royalty rate, and an optional parent. It
checks the block size, royalty cap, non-zero price, non-zero block count, and parent existence. It
does not hold funds. `deactivate` is seller-only. The registry has no `updatePrice`; the escrow
snapshots the price at purchase, so a later listing change cannot affect an existing sale.

**`SaleEscrow`.** Holds funds and implements the state machine. `depositBond` creates a seller
credit; `buy` checks that the credit covers the price, deducts the seller bond, and locks the
buyer's payment and bond. `deliver` stores the wrapped key and moves to `DELIVERED`. `confirm`
settles. `disputeMode1` verifies a consistency proof and either settles to the seller (consistent)
or refunds the buyer and slashes the seller bond (inconsistent). `disputeMode2` opens a challenge;
`respond` checks the key commitment and returns to `DELIVERED`; `timeoutRespond` refunds if the
seller does not respond. `timeoutDeliver` and `timeoutConfirm` provide liveness. All external
state-changing functions use `nonReentrant`.

**`DisputeVerifier`.** A stateless library implementing HMAC-SHA256, the counter-mode keystream,
tagged Merkle verification, the key commitment, and the full consistency check. It is separated
from `SaleEscrow` so that it can be fuzz-tested in isolation and reused.

**`RoyaltySplitter`.** A pull-payment ledger. The escrow pays the splitter and calls `credit` for the
parent seller; the parent withdraws later. This avoids a push payment to an arbitrary address inside
settlement. The splitter has a `receive` function because the escrow funds the credit.

**`LicenceToken`.** An ERC-1155 token with one id per asset. Only the escrow can mint. A successful
sale mints one licence to the buyer.

## 5.3 Cryptographic reference

The TypeScript module mirrors the on-chain formulas: tagged SHA-256 commitments, HMAC-SHA256, the
counter-mode keystream, Merkle tree construction and proofs, and ECIES key wrapping with `eciesjs`
on secp256k1. It is checked against RFC 4231 HMAC vectors, NIST SHA-256 vectors, and Merkle test
vectors. The Solidity and TypeScript implementations are cross-checked through shared vectors.

One implementation defect was found and fixed during this work. `crypto/encrypt.ts` generated a
16-byte nonce `N`, while `SaleEscrow.respond` takes `bytes32 N`. A proof produced by the backend
would therefore have reverted on-chain. The nonce is now 32 bytes and the backend was rebuilt.

## 5.4 Backend and IPFS

The Fastify backend exposes 16 application endpoints plus a health probe:

- assets: create/encrypt, list, get, active status (4);
- sales: buy, deliver, confirm, dispute Mode 1, dispute Mode 2, respond, get, timeout deliver,
  timeout confirm, timeout respond (10);
- royalty: credit lookup and withdraw (2);
- health (1).

The backend encrypts an uploaded asset, pins the ciphertext to Kubo, computes the commitments, and
builds the listing transaction. It does not custody user keys in the evaluated flow; the operator
key is used for the demo deployment. This is a development convenience, not a production key
management design, and it is listed as a limitation.

## 5.5 CLI and watcher

The CLI exposes health checks and the main protocol operations. The watcher subscribes to contract
events, maintains a checkpoint, de-duplicates events, scans for expired timeouts, simulates a
transaction before submitting it, and surfaces seller-only actions that the caller cannot perform.
It is covered by seven integration tests that deploy fresh contracts on a dedicated Anvil instance
(port 8546), advance time with `evm_increaseTime`, and assert on-chain state after submission.

The watcher does not implement reorg or rollback handling. Its checkpoint assumes a linear chain.
This is a real limitation for a production deployment and is reported as such.

## 5.6 Baselines B1 and B2

Two deliberately weak baselines make the attack matrix meaningful:

- **B1, `NaiveEscrow`.** A pay-then-deliver escrow with no content verification. It is the
  "blockchain escrow" strawman that a practitioner might build without reading the fair-exchange
  literature.
- **B2, `FairSwapLite`.** A simplified FairSwap-inspired baseline that commits to a ciphertext,
  reveals one key at settlement, and verifies a one-block consistency proof. It is not a full
  FairSwap implementation and does not wrap keys per buyer.

B1 and B2 are not strawmen invented to lose. They implement the attacks they support, and the
baseline tests assert the attack outcome rather than asserting that the defence works. This is why
the matrix reports "succeeds" for B1/B2 where the attack is possible.

## 5.7 Test architecture

The Foundry suite has seven files and 78 test cases:

| Suite | Tests | What it covers |
|---|---:|---|
| `DisputeVerifier.t.sol` | 7 | Consistency check, Merkle paths, key commitment |
| `CryptoVectors.t.sol` | 10 | RFC 4231 HMAC, NIST SHA-256, Merkle vectors |
| `E2E.t.sol` | 2 | Honest sale and a full dispute |
| `Invariants.t.sol` | 1 suite, 3 invariants | Funds conservation, single state, terminal absorption |
| `Adversarial.t.sol` | 34 | AT scenarios (including AT-31, AT-32), reentrancy, and edge cases |
| `Baselines.t.sol` | 12 | B1/B2 attack outcomes |
| `GasBenchmark.t.sol` | 12 | Per-operation gas |

The invariant suite runs 256 campaigns at depth 256 (65,536 calls across all 10 Handler actions: list, buy, deliver, confirm, Mode-1/Mode-2 disputes, respond, and all three timeout transitions). The handler records terminal states after every
call, so `invariant_terminalAbsorbing` can detect a sale that leaves `SETTLED` or `REFUNDED`. The
funds-conservation invariant checks that the escrow balance equals the sum of locked stakes plus
unspent seller credit, not the trivial `balance >= 0` that an earlier draft used.

The backend suite has 14 integration tests (health, asset validation, sale validation, royalty
lookup, IPFS round-trip). The watcher suite has 7 integration tests against Anvil. In total, 99
tests pass on the recorded build.

## 5.8 Defects found and fixed during implementation

Five defects are worth reporting because they show where the evidence came from.

1. **Royalty credit was unfunded.** `_settle` and the consistent-dispute path called
   `royalty.credit(parentSeller, amount)` but never transferred the corresponding ETH to the
   splitter. `creditOf` returned the right number, so a superficial test passed, but `withdraw()`
   would have reverted for lack of balance. The escrow now pays the splitter before crediting, the
   splitter has a `receive` function, and the royalty test withdraws the credit and checks the
   recipient's balance.
2. **The nonce width was wrong.** The TypeScript encryption path produced a 16-byte `N`, while the
   contract expects `bytes32`. The backend could not have produced a valid Mode-1 proof. The nonce
   is now 32 bytes.
3. **The attack harness and the Ganache demo were not real.** The original
   `harness/attack_harness.py` returned hard-coded booleans, zero gas, and empty transaction hashes
   without executing anything. The original `scripts/ganache_demo.mjs` sent plain ETH to an
   externally owned "vault" with hand-written selectors in the calldata and printed simulated
   balances. Both were replaced. The harness now runs the Foundry tests and reports only outcomes
   that a test produced; the demo deploys the real contracts and asserts real state on Ganache or
   Anvil. The old files are not cited as evidence anywhere in this thesis.
4. **`respond()`/`T_confirm` time-bar and unchecked revealed key, found and fixed during implementation.**
   Previously `respond()` returned the sale to `DELIVERED` without extending `T_confirm`, making the
   `CHALLENGED && keyRevealed` guard in `disputeMode1()` unreachable and allowing a late seller
   response to time-bar Mode-1 disputes before settling via `timeoutConfirm()`. `respond()` now enforces
   `tConfirm = max(tConfirm, block.timestamp + CONFIRM_EXTENSION)` (`CONFIRM_EXTENSION = 1 days`),
   and `disputeMode1()` enforces `proof.K == revealedK`, `proof.N == revealedN`, and `proof.s == revealedS`
   whenever `keyRevealed` is true (covered by AT-31 and unit tests).
5. **Mode-2 re-challenge stalling loop (AT-32), found and fixed during implementation.**
   Extending `T_confirm` on `respond()` would let a buyer alternate `disputeMode2()` and `respond()`
   to extend `T_confirm` repeatedly and stall seller payment indefinitely. Added `Sale.mode2Challenged`
   to cap each sale at one Mode-2 challenge, reverting repeated calls with `AlreadyChallenged()`.

## 5.9 Known implementation quirks

The following remain visible in the code and are treated as limitations, not hidden (all contract defects caught up through AT-32 have been fixed):

- Timeouts are conditional liveness: they work only if someone submits the transaction (mitigated by the automated watcher daemon).
- The buyer bond is forfeited on a rejected integrity claim, but the licence is still minted to the buyer in the consistent case. The penalty is anti-spam, not a correctness remedy.
- Confidentiality holds on the honest path only: initiating an on-chain dispute requires publishing the content key `K`, making content publicly accessible.
- Semantic integrity does not establish semantic correctness: a consistently committed garbage or misrepresented asset remains outside the on-chain integrity proof.
- Royalty payment funding is implemented and tested, but parent-authorised royalty-rate enforcement remains unresolved: a child can currently store and use its own `royaltyBps` value rather than a parent-validated rate.

---

# Chapter 6 — Evaluation

## 6.1 Methodology and environment

### Research design and systems

This work uses a software-artifact audit and empirical evaluation. It first compares MetaTrade's
published claims with its paper, algorithms, and available Ethereum and Fabric artifacts, recording
code-level evidence in the 44-item audit. It then evaluates four systems with different evidential
roles: B0 is a partial reconstruction of MetaTrade's published Ethereum path; B1 is a minimal
naive-escrow baseline; B2 is a limited FairSwap-style baseline; and B3 is the implemented
MetaTrade-R prototype. B1 and B2 are deliberately narrow comparison systems, not full production
implementations. The Fabric path is audited but not reconstructed because the published artifact
does not support a reproducible end-to-end evaluation.

The evaluation maps to the research questions through E1–E8: E1 audits B0; E2 checks functional
correctness; E3 exercises the attack matrix; E4 measures transaction gas; E5 measures sequential
local latency; E6 measures off-chain compute and models storage; E7 analyses bond incentives; and
E8 evaluates classical perceptual-hash similarity under image transformations.

### Correctness and adversarial evaluation

Correctness is tested with cryptographic known-answer vectors, end-to-end contract tests,
adversarial tests, and stateful invariants. The recorded test suites contain 78 Foundry tests,
14 backend integration tests, and 7 watcher integration tests. The invariant suite executes
256 campaigns at depth 256 (65,536 handler calls). These tests establish behaviour only for the
covered inputs and state transitions; they are not a formal proof.

The executable attack matrix contains 20 scenarios supported by matching tests. Each is classified
as blocked, mitigated, or residual based on the observed test outcome: 17 are blocked, one is
mitigated by making dispute spam costly, and two remain residual. These counts describe the
implemented test scenarios, not a statistically sampled real-world attack-success rate. Other
documented scenarios that lack executable tests are not included as measured attacks.

### Cost, incentives, and fingerprint measurements

Gas is measured on local Anvil from fresh sale state. The chain experiment uses 30 repetitions for
ordinary operations and 10 for dispute operations; B3 delivery uses a 100-byte wrapped key.
The reported per-sale cycle sums `buy`, `deliver`, and `confirm`, excluding the one-time listing
transaction. Sequential latency is measured separately in four runs of 100 cycles, with a receipt
awaited for each transaction. E6 measures encryption and verification for files from 64 KiB to
10 MiB and computes an explicit storage model; the storage comparison is not a measurement of
mainnet storage cost. E7 is a closed-form, risk-neutral incentive model with a parameter sweep,
not observed market behaviour or a chain experiment.

For E8, the pilot reuses 80 public 512×512 Picsum photographs from a validated prior-run cache,
split by image identity into
calibration, validation, and test groups. It applies 28 transformations, evaluates 896 positive
and 494 negative test pairs, selects thresholds on validation at the false-positive rate closest
to 1%, and reports test TPR, FPR, EER, AUC, and per-transformation performance. This is a
classical-hash pilot on non-AIGC photographs; it cannot establish originality detection or
robustness on generated content.

### Environment and reproducibility

The recorded environment is Windows 11 on an Intel i9 laptop with 16 GB RAM; Node.js 22.14.0,
Python 3.10.9, Foundry/Anvil 1.10.0, and Solidity 0.8.31 (200 optimizer runs, via-IR, Osaka EVM).
The prior backend run used Kubo 0.32.1; Kubo was unavailable for this rerun. Experiments use local
Anvil, chain ID 31337, with fresh contract deployments where applicable.
Exact commands and source artifacts are listed in Appendix B and `docs/MEASURED_RESULTS.md`.
The attack harness invokes the Foundry tests; scripts for chain experiments, compute/storage,
economics, and fingerprints generate the corresponding result artifacts.

The design intentionally reports limitations alongside positive results. The local chain,
single-host latency, minimal baselines, non-AIGC image sample, and author-developed test suite
limit generalisation. No test count, attack outcome, or local measurement is treated as proof of
mainnet security or production performance.

## 6.2 E2 — correctness

**Table 6.1. Test results.**

| Suite | Tests | Result in this rerun |
|---|---:|---|
| Foundry | 78 | 78 pass |
| Backend integration | 14 | Not rerun: Kubo was unavailable; prior recorded run passed |
| Watcher integration | 7 | 7 pass |
| **Total** | **99 recorded** | **85 pass in this rerun; 14 prior passes not reverified** |

The Foundry suite includes three stateful invariants over 256 campaigns at depth 256, the two
baseline contracts, and the cryptographic vectors. The backend suite exercises the HTTP surface and
an IPFS round-trip; its 14 passing results are from the earlier recorded run, not this rerun, because
Kubo was not installed and the official release endpoint timed out. The watcher suite deploys fresh
contracts on a dedicated Anvil instance and advances time, so it tests real submission and state
transitions rather than mocks.

Correctness evidence is not the same as a security proof. The tests show that the implemented paths
behave as specified on the cases they cover. They do not show that the specification is complete,
and they do not cover every adversarial strategy.

## 6.3 E3 — attack matrix

The attack matrix maps AT-01..AT-17, AT-30, AT-31, and AT-32 to executable Foundry tests. A row is emitted only if
a matching test exists; the runner does not invent outcomes. For B3, a passing test asserts the
defence; for B1/B2, a passing test asserts the attack.

**Table 6.2. B3 attack outcomes.**

| Outcome | Count | Attacks |
|---|---:|---|
| Blocked | 17 | AT-02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 15, 16, 17, 30, 31, 32 |
| Mitigated | 1 | AT-13 (buyer bond forfeited; spam is costly, not impossible) |
| Succeeds (residual) | 2 | AT-01 (consistent garbage), AT-14 (key public after dispute) |

B1 (naive escrow): three tested attacks succeed (AT-01, AT-03, AT-08), one is blocked (AT-06), and
the other 16 are not implemented in B1 and are not tested. B2 (FairSwapLite): two succeed (AT-01,
AT-14), six are blocked (AT-02, 03, 11, 12, 15, 16), and the rest are not tested. The asymmetry is
reported rather than smoothed over: B1 and B2 are minimal baselines, not full systems.

AT-18..AT-29 are not covered by executable tests in this build. They are protocol, economics, or
fingerprint claims rather than settlement-contract attacks, and the thesis does not report them as
measured.

The two residual attacks are the honest core of the result. AT-01 is the semantic gap: a seller can
commit consistently to garbage, and no hash-based check can detect it. AT-14 is the dispute-path
key leak: a dispute publishes `K`, so confidentiality is lost. AT-13 is mitigated rather than
blocked: the buyer bond makes spam expensive, but a determined buyer can still impose costs.
These attack results do not imply a missing royalty fix: the royalty-funding defect was fixed
during implementation, and withdrawals are tested. The separate unresolved limitation is
parent-authorised royalty-rate enforcement, which the current implementation does not provide.

## 6.4 E4 — gas

Gas was measured over 30 repetitions per normal operation (10 for the dispute paths) on a local Anvil
chain, with a 100-byte wrapped key for B3. The key length matters: `deliver` stores `encK`, so a
32-byte key produces a different number from a 100-byte key. The figures below are not directly
comparable to a deployment with a different key size.

**Table 6.3. Gas by system and operation.**

| System | Operation | n | Mean | Median | SD | p95 |
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

**Table 6.4. Per-sale cycle gas.**

| System | Mean gas | Median gas | Ratio to B1 |
|---|---:|---:|---:|
| B1 | 217,860.2 | 217,863 | 1.00 |
| B2 | 220,845.4 | 220,847 | 1.01 |
| B3 | 455,383.9 | 457,508 | 2.09 |

B3 pays about 2.1 times the per-sale gas of the unverified baselines.* That is the price of
commitments, a 100-byte wrapped key, licence minting, royalty accounting, and the dispute path. The
earlier single-run figure of 448,119 is within 2% of the measured 455,384 for the same three
operations, but it was a single run and is superseded.

\* *Footnote: The 2.1x overhead of B3 over B1 (455,384 vs 217,860 gas) is a design cost of verifiable settlement; it is distinct from finding F27, which notes that MetaTrade's published paper reported a trading gas ~2.1x lower than what its own Solidity implementation actually consumes.*

The small standard deviations on `buy` and `confirm` are expected on an instant-mining local chain:
identical calldata produces identical gas. The larger standard deviations on B3 `buy` (3,122) and
`deliver` (14,754) come from cold versus warm storage and different path positions, not from
congestion. These are local-chain numbers; mainnet L1 gas is higher and calldata-dependent.

## 6.5 E5 — latency and sequential throughput

Four 100-cycle batches were executed sequentially on local Anvil. Each batch used a newly deployed
B3 contract suite and awaited every transaction receipt. The first batch followed the E4 transaction
measurements; the remaining batches measured latency only.

| Run | Mean cycle time | Sequential throughput |
|---|---:|---:|
| 1 | 39.96 ms | 25.03 sales/s |
| 2 | 51.49 ms | 19.42 sales/s |
| 3 | 71.20 ms | 14.04 sales/s |
| 4 | 84.04 ms | 11.90 sales/s |
| **Median across runs** | **61.35 ms** | **16.73 sales/s** |

These are local, single-host measurements with instant mining. The spread reflects host scheduling,
RPC, and runtime warm-up effects; it is not evidence of a contract-level throughput change. They
are not network-throughput claims and say nothing about concurrent users, L1 block times, or
wide-area latency. A production deployment would require a multi-node testbed and concurrent
workload, neither of which was evaluated. Per-run raw receipts are retained under
`experiments/results/full_rerun_20261128/chain_run_1..4/`.

## 6.6 E6 — off-chain compute and storage

The deterministic payload sizes (129-byte key wrap, 367-byte logical listing record, 399 bytes
including the mapping key slot, and storage-model byte totals) are unchanged. Compute timings below
come from the 28 November rerun (`experiments/results/full_rerun_20261128/e6/summary.json`):

**Table 6.5. Encryption time by input size (mean of 10 runs).**

| Input | Encryption time | Blocks `m` |
|---|---:|---:|
| 64 KiB | 12.681 ms | 64 |
| 256 KiB | 43.245 ms | 256 |
| 1 MiB | 189.239 ms | 1,024 |
| 5 MiB | 1,033.216 ms | 5,120 |
| 10 MiB | 2,008.809 ms | 10,240 |

- ECIES key wrap (secp256k1, `eciesjs`): **129 bytes** (65-byte ephemeral public key, 16-byte IV, 32-byte ciphertext, 16-byte tag), **33.939 ms** mean over 100 runs (SD 7.697 ms).
  This is a JavaScript implementation cost, not a bound.
- One-block consistency verification: **0.179 ms** mean (100 runs).
- Logical on-chain record per asset: 367 bytes (the raw sum of the `Asset` struct fields in `AssetRegistry.sol`: 20 bytes seller address + 9 * 32 bytes commitments/hashes + 4 bytes m + 4 bytes blockSize + 8 bytes price + 2 bytes royaltyBps + 32 bytes parentAssetId + 1 byte active + 8 bytes listedAt), or 399 bytes when including the 32-byte `mapping(uint256 => Asset)` lookup key slot.

Wall-clock timings vary across runs on the same host. Byte counts are deterministic; the compute
timings are indicative, not a benchmark against a fixed baseline.

**Storage model.** The ciphertext is stored once on IPFS in B0, B2, and B3. The published Ethereum
B0 stores a per-buyer key string (`customerAddrToData[buyer].encryptedSymmetricKey`); B3 stores a
129-byte wrapped key per sale. At 1,000 buyers, with a 5 MiB asset and a 128-byte B0 key assumption,
the model is:

**Table 6.6. Storage model at 1,000 buyers.**

| System | Total bytes |
|---|---:|
| B0 | 5,370,880 |
| B2 | 5,242,912 |
| B3 | 5,371,880 |

**There is no storage saving to claim.** At 1,000 buyers B3 is 1,000 bytes (about 0.02%) *larger* than
B0, because a 129-byte wrapped key is stored per sale against a 128-byte per-buyer key assumption for
B0. An earlier draft claimed a 976x reduction by assuming B0 re-uploads the full asset per buyer. The
published contract does not do that, so the claim is withdrawn. The comparison with B0 is about
verification, dispute rights, and royalties, not bytes.

## 6.7 E7 — bond economics

The model is closed-form, not a chain measurement:

```
E[π] = (1 − P_d)(p − c_g) − P_d(b_s + c_d)
b_s = max(p, ((1 − P_d)/P_d) p)
```

The deterrence bound is the raw ratio `(1 - P_d)/P_d`. The required bond multiple applies the `max(1.0, (1 - P_d)/P_d)` rule so that the bond is never less than the asset price (`1.00x`).

**Table 6.7. Bond multiple required for deterrence.**

| `P_d` | Deterrence bound | Required bond | Deterred at solvent bond |
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

The rerun uses `c_g = 0` and `c_d = 0.1p`; `c_h = 0.1p` is used only for the reported honest-profit
column. The script marks an attack deterred when its expected profit is negative. The result
remains conditional on a risk-neutral attacker,
proportional costs, a known detection probability, and a solvent bond. It does not establish that
sellers actually post such bonds, nor that `P_d` is known. At `P_d = 0.5`, a 1.00x bond makes
expected attack profit negative only because the model includes the positive defense cost; if that
cost is ignored, deterrence is marginal. For `P_d > 0.5`, the raw ratio falls below 1.00x, but the
solvency floor keeps the required bond at 1.00x.

## 6.8 E8 — perceptual-hash pilot

The fingerprint experiment is a pilot on 80 public photographs from Picsum (Unsplash), 512×512, seeds
1000..1079. In this rerun, the images were replayed from the successful prior-run manifest and
validated local cache; external dataset download was unavailable. The image identities and split
seed are unchanged. The image files are local experiment inputs and are not committed; a fresh
checkout must reacquire them online or provide a local cache. The identity split is
32 calibration / 16 validation / 32 test, with seed 1234. There are
28 transformations, 896 test positive pairs, and 494 test negative pairs. Thresholds are selected on
validation at the FPR closest to 1%.

**Table 6.8. Test results at the validation-selected threshold.**

| Method | TPR@1% FPR (95% CI) | Test FPR | EER | AUC |
|---|---|---:|---:|---:|
| pHash | 78.3% [75.5, 80.9] | 2.02% | 12.2% | 0.9351 |
| dHash | 78.6% [75.8, 81.1] | 2.23% | 12.7% | 0.9374 |
| aHash | 67.9% [64.7, 70.8] | 0.20% | 14.0% | 0.9283 |
| wHash | 61.4% [58.2, 64.5] | 0.20% | 18.8% | 0.9117 |
| Ensemble | 76.8% [73.9, 79.4] | 1.01% | 10.7% | 0.9586 |

Worst transformations (ensemble): `rotate_m15` 0.0%, `rotate_p15` 0.0%, `flip_h` 9.4%.
Geometric-only TPR: pHash 57.0%, ensemble 54.6%.

**This is a strong negative result for classical hashes as an originality detector.** A matching
score is not proof of semantic substitution or copy provenance: in this pilot, ±15-degree rotation
and horizontal flip are effectively invisible to the ensemble, and the geometric-only pHash TPR is
only 57.0%. The pre-registered hybrid (pHash + PDQ + DINOv2) was not built, so H6 is untested.
H5 (pHash geometric TPR below 50%) is refuted at 57.0%. No AIGC dataset (Copydays, Holidays,
Oxford5k, GenImage, DiffusionDB) was evaluated, and these photographs do not represent AIGC
distribution, generation artefacts, or adversarially optimised substitutes. Accordingly, the
results must not be extrapolated as evidence of AIGC robustness.

The pilot also has a data-quality caveat: three duplicate-content groups were found in the 80
images. The split is identity-level, but duplicate content across identities could inflate
similarity for those pairs. The effect is small and the report lists the groups; a full experiment
should de-duplicate before splitting.

## 6.9 Summary of evidence by research question

**Table 6.9. Evidence status.**

| Question | Evidence | Status |
|---|---|---|
| RQ1 | 44-entry audit with file/function/line evidence | Done |
| RQ2 | 78 Foundry tests, 20-scenario matrix, 3 invariants (65,536 calls) | Done for the implemented contract paths |
| RQ3 | 30-run gas, four 100-cycle latency runs, compute/storage model | Local only; no mainnet or multi-node |
| RQ4 | Closed-form model and parameter sweep | Analytical; no market data |
| RQ5 | 80-image, 28-transform classical-hash pilot | Pilot; no AIGC dataset or learned hashes |

## 6.10 Threats to validity

**Internal validity.** The contracts, tests, and experiments were written by the same author. This
creates a risk of testing the implementation against the author's misunderstanding of the
specification. The mitigation is published vectors (RFC 4231, NIST SHA-256), independent Python
recomputation in the fingerprint experiment, and negative results. It is not a full independent
audit.

**External validity.** The chain is a single local Anvil node. The latency measurement is loopback.
The storage model uses a 128-byte assumption for B0's per-buyer key. The fingerprint dataset is 80
web photographs. None of these generalises automatically to mainnet, a wide-area network, or an AIGC
distribution.

**Construct validity.** The attack matrix measures whether a specific test transaction succeeds or
reverts, not whether a real adversary would choose that strategy. The gas benchmark measures the
implemented operations, not the cost of a production deployment with larger keys, more royalties, or
more complex licence terms.

**Conclusion validity.** The thesis reports negative results (storage parity, rotation/flip failure,
two residual attacks, a non-AEAD cipher) rather than omitting them. This
reduces the risk of overclaiming, but it does not eliminate the risk that the chosen metrics miss a
property that matters.

**Reproducibility.** The commands and versions are recorded. Foundry dependencies were repaired and
are present in the repository. The backend requires Anvil, Kubo, and a running server; those are
documented but not containerised. A clean-machine validation script has not been run, so the
evidence is from this machine.

---

# Chapter 7 — Discussion

## 7.1 RQ1: which properties does MetaTrade enforce?

MetaTrade enforces payment custody and a self-consistency check. It does not enforce content
binding, because the seller chooses both sides of the comparison. It does not enforce
confidentiality in the Fabric flow, because the key is readable before settlement. It does not
enforce plagiarism resistance or rating aggregation, because those components are not implemented.
It does not enforce a trust-free model, because a single owner controls de-listing and adjudication,
and because the Fabric orderers are crash-fault tolerant rather than Byzantine-fault tolerant.

The audit therefore answers RQ1 negatively for the central claims. This is not a marginal
interpretation: the code paths are short and the comparisons are explicit. The finding is
reproducible by reading the published functions.

## 7.2 RQ2: can payment be bound to a pre-sale commitment?

Yes, for the integrity property. The seller commits to `hD`, `hC`, `R_D`, `R_C`, and `cK` before the
sale. The escrow holds payment. If the delivered ciphertext does not decrypt to the committed
plaintext, the buyer proves it on-chain and the contract recomputes one block. The decision is
deterministic and does not require an arbitrator, an oracle, or a ZK proof.

The qualification is important. The binding is to the committed bytes, not to the advertised
semantics. A seller can commit consistently to garbage. The protocol therefore answers "did I get
the bytes you committed to?" but not "are those bytes the asset I wanted?". The second question is
handled by preview, fingerprint, bond, and reputation, which are probabilistic and economic.

## 7.3 RQ3: what does the binding cost?

The per-sale cycle costs 455,384 gas on a local Anvil chain, about 2.1 times the unverified
baselines. A Mode-1 dispute costs 243,048 gas; Mode 2 costs 55,321; a response costs 141,636. The
dispute cost is higher than a hash comparison because it includes two Merkle verifications and one
keystream block recomputation. That is the price of binding.

The storage result is a negative result. The published B0 stores one key per buyer, and B3 stores
one wrapped key per sale, so the storage is at parity. The earlier 976x claim assumed B0 re-uploads
the asset per buyer; that assumption is false for the published contract. The thesis withdraws the
claim.

The latency result is local, single host, machine-dependent: 61.35 ms median of four run-mean
cycle times, and 16.73 sales/s median of the four per-run throughputs (100 cycles per run; mean
cycle range 39.96-84.04 ms). It is a sanity check on the implementation,
not a throughput claim.

## 7.4 RQ4: when is honesty rational?

Under the model, honesty is rational when the seller bond satisfies
`b_s > ((1 − P_d)/P_d) p` and the seller is solvent. At `P_d = 0.1`, the bond must exceed nine times
the price; at `P_d = 0.5`, it must exceed the price. The condition is simple and usable, but it is
only as good as `P_d`. The fingerprint pilot shows that classical hashes are weak under rotation and
flip, which means `P_d` can be low for those transformations and the required bond can be very high.

This is the link between the cryptographic and economic parts of the thesis. The bond is not a
substitute for detection; it is a way to make detection economically meaningful. If detection is
zero, no finite bond works.

## 7.5 RQ5: how robust is perceptual hashing?

The pilot finds that classical hashes are strong under photometric transformations (JPEG, resize,
brightness, contrast, noise, blur) and weak under geometric transformations, especially rotation and
horizontal flip. The ensemble reaches 76.8% TPR at 1.01% FPR overall, but 0% on ±15° rotation and
9.4% on horizontal flip. Geometric-only pHash TPR is 57.0%.

This is a **strong negative result against treating classical perceptual hashing as an AIGC
originality or semantic-correctness proof**. It does not mean perceptual hashing is useless: it is
a cheap similarity signal that may help triage near-duplicates under limited photometric changes.
However, the 0% rotation and 9.4% flip TPR show that a malicious or innocent geometric edit can
leave these hashes unable to detect the relationship, and the 57.0% geometric-only pHash TPR sets a
very weak lower bound on detection in this pilot. Consequently, a marketplace cannot rely on pHash
alone to identify copied, substituted, or misrepresented AIGC, and the bond model must use the
transformation-specific detection probability, not an optimistic or dataset-wide average. The
evidence supports only heuristic similarity assistance, not originality attribution.

## 7.6 Design tensions

Three tensions run through the design.

**Confidentiality versus verifiability.** On the honest path, the key is wrapped to the buyer. On
dispute, the key must be revealed for the contract to recompute the block. Without ZK proofs, you
cannot have both public verifiability and persistent confidentiality. The thesis chooses
verifiability on the dispute path and states the leak.

**Integrity versus semantics.** A hash can bind bytes; it cannot bind meaning. The design separates
the two and refuses to claim that the second is solved. This is less satisfying than a single
"verified content" claim, but it is honest.

**Cost versus guarantees.** The binding costs about 2.1 times the unverified baselines. A production
system might amortize the listing cost across many sales, use L2, or sample fewer blocks. The thesis
measures the implemented design rather than optimizing it.

## 7.7 What the results do not establish

- They do not establish that MetaTrade-R is secure against a real adversary on mainnet. The attack
  matrix is local and test-based.
- They do not establish AIGC-specific fingerprint robustness. The pilot uses web photographs and
  classical hashes.
- They do not establish that the bond model deters real sellers. It is a closed-form model with no
  market data.
- They do not establish that the storage or latency results generalise beyond one host.
- They do not establish formal correctness. The invariants and tests are evidence, not proof.
- They do not establish that the licence semantics are sufficient for real AIGC licensing. Expiry,
  scope, revocation, and privacy are out of scope.
- They do not establish that parent royalty rates are authorised or invariant: the prototype
  transfers funds at the child's stored royalty rate, because parent-side rate validation remains
  unresolved.

## 7.8 Ethical and legal considerations

The system handles payment and content licences, so it touches copyright, consumer protection, and
data protection. The prototype does not provide legal advice or enforce jurisdiction-specific
rules. Perceptual hashing can produce false positives, so it must not be used as the sole basis for
accusations of plagiarism. The public nature of the ledger leaks purchase history unless additional
privacy mechanisms are added. A production deployment would need a legal review, a dispute policy,
and a privacy impact assessment.

The audit itself uses published artefacts and does not redistribute proprietary content. The
fingerprint pilot uses public photographs from Picsum/Unsplash; the images are cached for
reproducibility and the report lists the source.

---

# Chapter 8 — Conclusion and Future Work

## 8.1 Summary

This thesis audited MetaTrade, a peer-reviewed AIGC trading framework, and found that its central
security check is self-referential. The seller chooses the ciphertext and the hash, so a malicious
seller can be paid for arbitrary bytes. The audit records 44 catalogue entries, including
pre-payment key disclosure in the Fabric flow, unlimited token minting, re-callable initialisation,
ineffective de-listing, unimplemented plagiarism and rating mechanisms, and gas under-reporting by a
factor of 2.1.

The thesis then designed and implemented MetaTrade-R, a content-binding settlement protocol. The
seller commits to the plaintext, ciphertext, Merkle roots, and key before the sale. Payment is
escrowed. An integrity dispute is decided on-chain by recomputing one HMAC-CTR block; a non-delivery
dispute forces the seller to reveal the key or lose the bond. The design separates cryptographic
integrity from semantic correctness and links the seller bond to the fingerprint detection
probability.

The prototype has five Solidity contracts, a 16-endpoint backend, an IPFS integration, a TypeScript
cryptographic reference, a CLI, a watcher, and two baselines. The evaluation record contains 99
passing tests (78 Foundry, 14 backend, 7 watcher); this rerun reverified 85, while the 14 backend
results remain from the prior run because Kubo was unavailable. It blocks 17 of 20 executable
attack scenarios, mitigates one by bond, and documents two residual risks. A per-sale cycle costs
455,384 gas; a Mode-1 dispute costs 243,048 gas; the four-run median sequential throughput is
16.73 sales/s (local, single host, machine-dependent). Storage is at parity with the published
baseline, not a reduction. The fingerprint pilot is a deliberately strong negative result: the classical-hash ensemble
reaches 76.8% TPR at 1.01% test FPR overall, but achieves 0% TPR under ±15-degree rotation and
9.4% under horizontal flip. It does not establish AIGC robustness or provenance and must not be
presented as a reliable originality or plagiarism detector.

The thesis is defensible as a systems and empirical security contribution. It is not a claim of a
new cryptographic primitive, a formal verification, a production marketplace, or a trust-free
system. The trust assumptions are enumerated, the negative results are reported, and the evidence is
reproducible from the repository.

## 8.2 Future work

1. **Full E8.** Evaluate PDQ, CLIP, and DINOv2 on Copydays, Holidays, Oxford5k, DiffusionDB, and
   GenImage, with a pre-registered protocol, multiple splits, and adversarial perturbations. The
   current pilot is a calibration, not the full experiment.
2. **Per-chunk keys.** Limit the confidentiality loss on dispute by encrypting each block under a
   separate key and revealing only the disputed chunk.
3. **AEAD plus an oracle.** Replace HMAC-CTR with a standard AEAD for production content, and use an
   oracle or attestation for semantic correctness. The on-chain recomputation would then move to a
   commitment to the AEAD tag or a ZK proof.
4. **Reorg-safe watcher.** Add block-hash checkpoints, reorg detection, and replay of orphaned
   events. The current watcher assumes a linear chain.
5. **Clean-machine validation.** Containerise Anvil, Kubo, the backend, and the test suites, and run
   the full evidence pipeline on a fresh machine. The current evidence is from one host.
6. **Mainnet/L2 measurement.** Measure gas and latency on a testnet and an L2, with realistic
   calldata, key sizes, and concurrent users. The current numbers are local.
7. **Formal verification.** Model the escrow state machine and the dispute verifier in a proof
   assistant or a model checker, and prove the invariants that are currently tested.
8. **Privacy.** Add commit-reveal ratings, private ownership, or ZK membership to reduce the
   purchase-history leak.
9. **Licence semantics.** Enforce expiry, scope, revocation, and transfer rules, and link them to the
   ERC-1155 token.
10. **Storage incentives.** Add a pinning bond or erasure coding so that IPFS availability is
    incentivised rather than assumed.

## 8.3 Closing statement

The most useful result of this thesis is not the gas number. It is the separation of two questions
that the literature often conflates: *did I receive the bytes you committed to?* and *are those
bytes the asset I wanted?* The first can be enforced deterministically on-chain. The second cannot,
and any system that claims otherwise is either using an oracle it does not disclose or overclaiming
what a hash can do. MetaTrade-R enforces the first, states the limits of the second, and reports
what it costs. That is a modest contribution, but it is an honest one.

---

## References

[1] V. T. Truong, H. D. Le and L. B. Le, "Trust-Free Blockchain Framework for AI-Generated Content
Trading and Management in Metaverse," *IEEE Access*, vol. 12, pp. 41815–41828, 2024.
DOI: 10.1109/ACCESS.2024.3376509.

[2] T. M. Hewa, Y. Hu, M. Liyanage, S. S. Kanhare and M. Ylianttila, "Survey on Blockchain-Based Smart
Contracts: Technical Aspects and Future Research," *IEEE Access*, vol. 9, pp. 87643–87662, 2021.
DOI: 10.1109/ACCESS.2021.3068178.

[3] K. Balan, A. Gilbert and J. Collomosse, "Decentralized Creative Copyright Exchange in the Age of
Generative AI," DECADE Technical Report, Nov. 2025.

[4] Story Protocol, "Programmable IP Licensing," 2025. [Online]. Available:
https://www.storyprotocol.xyz/.

[8] Z. Zhang et al., "Security of AI-Generated Content," *ACM Computing Surveys*, 2025.
DOI: 10.1145/3729419.

[9] AIGC-Chain/CTrace, "AIGC-Chain: A Blockchain-Based Framework for AIGC," arXiv:2406.14966, 2024.

[14] S. Dziembowski, L. Eckey and S. Faust, "FairSwap: How To Fairly Exchange Digital Goods," in
*Proc. ACM CCS*, 2018. DOI: 10.1145/3243734.3243857.

[15] L. Eckey, S. Faust and B. Schlosser, "OptiSwap: Fast Optimistic Fair Exchange," in *Proc.
AsiaCCS*, 2020. DOI: 10.1145/3320269.3384749.

[16] "FDE/VECK: Fair Data Exchange with Verifiable Encryption," in *Proc. ACM CCS*, 2024.
DOI: 10.1145/3658644.3690248.

[17] "Dual-Deposit Escrow for Fair Exchange," in *Proc. IEEE ICBC*, 2019.
DOI: 10.1109/BLOC.2019.8751482.

[18] "A Generalization of FairSwap and OptiSwap," *International Journal of Information Security*,
2025. DOI: 10.1007/s10207-025-01166-1.

[19] J. Camenisch and V. Shoup, "Practical Verifiable Encryption and Decryption of Discrete
Logarithms," in *Proc. CRYPTO*, 2003.

[20] S. R. Tadi, K. G. Rao, M. V. Gopalachari, C. C. Reddy and J. Bhimireddy,
"Merkle-Tree-Based Verifiable Public Data Auditing for Cloud Object Storage Using Smart
Contracts," arXiv:2610.36001 [cs.CR], Oct. 2026. DOI: 10.48550/arXiv.2610.36001.

[21] "Transparency Overlays and Applications," in *Proc. ACM CCS*, 2016.
DOI: 10.1145/2976749.2978404.

[22] "Cassiopeia: Practical On-Chain Witness Encryption," IACR ePrint 2023/635, 2023.

[23] UMA Protocol, "Optimistic Oracle V3," 2025. [Online]. Available:
https://docs.umaproject.org/.

[24] Z. Liu et al., "A Survey on Applications of Game Theory in Blockchain," arXiv:1902.10865, 2019.

[25] "Bet and Attack: Incentive Compatible Collaborative Attacks Using Smart Contracts,"
arXiv:2010.12280, 2020.

[26] "A Survey of Perceptual Hashing for Multimedia," *ACM Transactions on Multimedia Computing,
Communications, and Applications*, 2025. DOI: 10.1145/3727880.

[27] "Provenance Verification of AI-Generated Images via Perceptual Hash Registry on Blockchain,"
arXiv:2602.02412, 2026.

[28] E. Bureacă and I. Aciobăniței, "A Blockchain based Framework for Content Provenance and
Authenticity," in *Proc. 16th Int. Conf. Electronics, Computers and Artificial Intelligence
(ECAI)*, 2024, pp. 1–5. DOI: 10.1109/ECAI61503.2024.10607477.

---

## Appendix A — Artefact map

| Claim | Artefact |
|---|---|
| Base-paper audit, F1–F44 | `docs/base_paper_critical_review.md` |
| Self-audit, 15 findings | `audit/FINAL_INDEPENDENT_AUDIT.md` |
| Threat model, TA1–TA12 | `docs/THREAT_MODEL.md` |
| Protocol design | `docs/PAPER_SECTIONS_FINAL.md`, `docs/MATHEMATICAL_FORMULATION.md` |
| Contracts | `src/AssetRegistry.sol`, `src/SaleEscrow.sol`, `src/DisputeVerifier.sol`, `src/RoyaltySplitter.sol`, `src/LicenceToken.sol` |
| Baselines | `src/baselines/NaiveEscrow.sol`, `src/baselines/FairSwapLite.sol` |
| Foundry tests | `test/*.sol` (78 tests) |
| Backend | `api/src/` (16 endpoints + `/health`) |
| Backend tests | `tests/backend.test.mjs` (14) |
| Watcher | `watcher/watcher.ts` |
| Watcher tests | `tests/watcher.test.mjs` (7) |
| Attack matrix | `harness/attack_harness.py`, `harness/results/` |
| Gas/latency | `experiments/run_chain_experiments.mjs`, `experiments/results/chain/` |
| Compute/storage | `experiments/e6_storage_compute.mjs`, `experiments/results/e6/` |
| Economics | `experiments/e7_economics.py`, `experiments/results/e7/` |
| Fingerprints | `experiments/e8_fingerprint.py`, `experiments/results/e8/` |
| Measured summary | `docs/MEASURED_RESULTS.md` |
| End-to-end demo | `scripts/ganache_demo.mjs`, `scripts/ganache_lib.mjs` |

## Appendix B — Reproduction commands

```bash
# Foundry
forge build
forge test                       # 78 tests
forge test --match-path test/Invariants.t.sol

# Backend (requires Anvil + Kubo + server)
npx tsc
node dist/api/src/server.js
node --test tests/backend.test.mjs   # 14 tests

# Watcher (spawns its own Anvil on port 8546)
node --test tests/watcher.test.mjs   # 7 tests

# Attack matrix
python harness/attack_harness.py --system all --out harness/results

# Gas and latency
node experiments/run_chain_experiments.mjs --runs 30 --latency 100

# Compute and storage
node experiments/e6_storage_compute.mjs

# Economics
python experiments/e7_economics.py

# Fingerprints (pilot)
python experiments/e8_fingerprint.py --n-images 80 --seed 1234
```

## Appendix C — Attack matrix

| ID | Attack | B3 outcome | Note |
|---|---|---|---|
| AT-01 | Consistent garbage listing | succeeds | Residual; semantic gap |
| AT-02 | Inconsistent commitment | blocked | Proof refunds the buyer |
| AT-03 | Wrong key delivery | blocked | Mode-2 response rejects a bad key |
| AT-04 | Key before payment | blocked | No key material before payment |
| AT-05 | Re-initialisation | blocked | No initializer; constructor wires |
| AT-06 | Price change after deposit | blocked | Price snapshotted at buy |
| AT-07 | De-listed asset trading | blocked | `buy` reverts on inactive asset |
| AT-08 | Overpayment stranding | blocked | Exact `msg.value` required |
| AT-09 | Refund wiping | blocked | State guards reject replay |
| AT-10 | `.transfer` griefing | blocked | `call{value:}` pays gas-heavy receivers |
| AT-11 | False integrity dispute | blocked | False claim forfeits buyer bond |
| AT-12 | Fabricated chunk proof | blocked | Leaf not rooted in `R_D`/`R_C` reverts |
| AT-13 | Dispute spam | mitigated | Buyer bond forfeited; not prevention |
| AT-14 | Leak-by-dispute | succeeds | Residual; `K` public after dispute |
| AT-15 | Seller stalls after dispute | blocked | `timeoutRespond` refunds |
| AT-16 | Buyer stalls confirmation | blocked | `timeoutConfirm` pays seller |
| AT-17 | Timestamp manipulation | blocked | Fixed windows; boundary test |
| AT-30 | Reentrancy on payout | blocked | `nonReentrant` rejects reentry |
| AT-31 | Late-respond time-bar | blocked | `respond` extends `T_confirm`; Mode 1 remains available |
| AT-32 | Mode-2 re-challenge loop | blocked | Second `disputeMode2` reverts with `AlreadyChallenged` |

## Appendix D — Descriptive gas statistics

The full table is in `experiments/results/chain/summary.json` and reproduced in Chapter 6. The
columns are `n`, mean, median, standard deviation, and p95. The measurements are local-chain and
not mainnet estimates. The key size for B3 `deliver` is 100 bytes; changing it changes the number.

## Appendix E — Glossary

- **AEAD** — Authenticated Encryption with Associated Data. HMAC-CTR in this thesis is not AEAD.
- **AIGC** — AI-generated content.
- **CRC** — Commit–Recompute–Challenge, the settlement protocol in this thesis.
- **ECIES** — Elliptic Curve Integrated Encryption Scheme; used for per-buyer key wrapping.
- **HMAC-CTR** — HMAC-SHA256 in counter mode; the PRF-based stream cipher used here.
- **Merkle root** — A hash commitment to a tree of blocks.
- **Mode 1** — Integrity dispute; the buyer proves an inconsistent block.
- **Mode 2** — Non-delivery or bad-key dispute; the seller must reveal the key.
- **`P_d`** — Probability that a semantic substitution is detected.
- **pHash** — A classical 64-bit perceptual hash.
- **TA1–TA12** — The twelve trust assumptions in Chapter 4.
