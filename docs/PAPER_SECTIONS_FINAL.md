# MetaTrade-R — Submission Draft: Abstract, Introduction, Related Work, Methodology

> **Status note (not part of the paper).** Numbers in this draft were re-verified against the
> repository on 2026-11-27: 72 Foundry test cases (including three stateful invariants), 14
> backend tests, 7 watcher integration tests, and 18 executable attack scenarios (AT-01..AT-17
> plus AT-30). B3 blocks 15, mitigates 1 (AT-13, by bond) and has 2 documented residuals (AT-01,
> AT-14). The self-audit of MetaTrade-R has 15 findings (0 critical, 2 high, 4 medium, 5 low, 3
> informational); the audit of the base paper contains 44 findings (F1–F44). Gas figures are now
> 30 repetitions per operation (10 for dispute paths) with mean, median, SD and p95; see
> `docs/MEASURED_RESULTS.md`. Claims are deliberately restricted to what the artefacts support:
> no formal verification, no AEAD claim, no "trust-free" claim, no storage-saving claim.

---

## Abstract

Blockchain-based marketplaces for AI-generated content (AIGC) promise to remove platform
intermediaries, but they inherit the classical fair-exchange problem: a buyer must pay before
it can inspect the goods, and a seller must reveal the goods before it is paid. This paper
reports a reproducible, code-level audit of MetaTrade (IEEE Access, 2024) and a repaired
protocol, MetaTrade-R. The audit shows that MetaTrade's settlement check compares a
buyer-computed hash of the seller-supplied ciphertext against a hash that the seller itself
published over the same ciphertext. The check is self-consistent by construction and therefore
does not bind payment to the advertised asset: a seller can list arbitrary bytes, publish their
hash, and be paid. Across the published Ethereum and Hyperledger Fabric implementations we
document 44 issues in the paper and code, including pre-payment key disclosure in the Fabric
flow, unlimited licence minting, re-callable contract initialisation, unimplemented plagiarism
and rating components, and gas under-reporting by a factor of 2.1. We also audit the repaired
system itself and report 15 findings (0 critical, 2 high, 4 medium, 5 low, 3 informational), of
which the two high-severity findings are accepted residual risks.

MetaTrade-R adapts a FairSwap-style exchange construction with per-buyer ECIES key wrapping.
Before listing, the seller commits to a plaintext hash, a ciphertext hash, plaintext and
ciphertext Merkle roots, and a key commitment. Payment is escrowed against those commitments.
If the delivered content is inconsistent with the committed plaintext, the buyer submits an
on-chain proof and the contract recomputes a single HMAC-CTR keystream block to decide the
dispute without an arbitrator. We separate cryptographic integrity, which is deterministic and
on-chain, from semantic correctness, which remains probabilistic and economic, and derive an
incentive-compatibility condition that links the seller bond to the fingerprint detection
probability. The prototype comprises five Solidity contracts, a 16-endpoint Fastify backend with
IPFS storage, and a TypeScript cryptographic reference implementation. We report 93 passing
tests (72 Foundry, 14 backend, 7 watcher), 15 of 18 attack scenarios blocked (one further
mitigated by a bond, two documented residuals), 456,691 gas for a per-sale cycle (buy, deliver,
confirm) and 241,278 gas for a Mode-1 integrity dispute, measured over 30 repetitions on a
local Anvil chain. Confidentiality holds on the honest path only, because a dispute reveals the
content key; HMAC-CTR is a stream cipher, not an authenticated-encryption scheme; and the system
relies on twelve explicitly enumerated trust assumptions. It is therefore not trust-free, and we
do not present it as such.

**Index Terms** — AIGC trading, blockchain, content binding, fair exchange, smart contracts,
dispute resolution, Merkle trees, HMAC-CTR, IPFS.

---

## I. Introduction

### A. Background

Generative models have turned images, text, audio, video, and 3D assets into goods that can be
produced at near-zero marginal cost. This changes the economics of digital content in two ways.
First, reproduction is effectively free, so exclusivity must be created contractually rather
than technically. Second, authorship and provenance are hard to establish, because a generated
asset carries no intrinsic proof of who created it or which model produced it. Creators
therefore need a way to license AIGC that is enforceable, auditable, and does not depend on a
platform that can change its terms or disappear.

Centralised stock marketplaces address distribution but charge substantial commissions, retain
custody of both payment and content, and act as a single point of failure. Blockchain-based
marketplaces are an attractive alternative: ownership and licence terms can be represented by
tokens, payment can be held in escrow by a contract, and the settlement history is publicly
auditable. The remaining difficulty is not storage or payment, but *exchange*: how can two
mutually distrusting parties swap money and digital content such that neither can cheat?

### B. The Fair-Exchange Problem and the MetaTrade Flaw

Digital goods can be copied, so the natural protocol is "pay, then receive". A buyer will not
pay first, because the seller may deliver nothing. A seller will not deliver first, because the
buyer may refuse to pay. Escrow removes the counterparty risk for payment but not for content:
the contract can hold money, yet it cannot read the file, so it cannot tell whether the file
matches what was advertised.

MetaTrade [1] proposes to solve this with hybrid encryption and IPFS. The seller encrypts the
asset, stores the ciphertext off-chain, and publishes hashes on-chain. After payment, the seller
delivers the content key wrapped to the buyer's public key. The contract checks that a
buyer-computed hash of the ciphertext equals the hash the seller declared.

This check cannot work as a content-binding mechanism. Both sides of the comparison are derived
from the same seller-supplied object. If the seller uploads random bytes, computes their hash,
and publishes that hash, the two values agree and the payment is released. The check proves
internal consistency, not correspondence with the advertised asset. In the language of the
fair-exchange literature, MetaTrade verifies that the seller is consistent with itself, while
the security goal requires that the seller be bound to a commitment made *before* the sale.

The distinction is not cosmetic. It separates two properties that the literature frequently
conflates:

- **Integrity** — the bytes the buyer receives are the bytes the seller committed to before
  payment. This is a cryptographic property and can be enforced deterministically.
- **Semantic correctness** — the committed bytes really are the advertised asset (the promised
  style, subject, quality, or model output). This is not a property of any hash; it requires
  similarity detection, human judgement, or an oracle, and can at best be enforced
  probabilistically and economically.

MetaTrade claims both, implements neither, and its plagiarism and rating components are not
present in the published code. Our audit makes this gap explicit and turns it into a design
requirement.

### C. Audit Findings and Motivation

We audited the published Ethereum and Hyperledger Fabric implementations of MetaTrade at the
level of file, function, and line. The audit reports 44 issues across the paper, the algorithms,
and both implementations. The security-relevant defects include a pre-payment key disclosure in
the Fabric flow, which lets a buyer decrypt before settlement; an unrestricted licence-minting
path on the Ethereum side; re-callable initialisation; missing access control on administrative
operations; and a settlement check that does not bind content. Severity is assigned per issue
rather than as one aggregate distribution, because the findings span code defects, unsupported
claims, and evaluation gaps. A separate self-audit of the repaired system reports 15 findings
(0 critical, 2 high, 4 medium, 5 low, 3 informational). Its two high-severity findings are
design-level limits — the confidentiality-only stream cipher and the semantic-verification gap —
and both are carried as accepted residual risks rather than presented as solved.

The audit also finds a scope error in the reported gas cost: the published 250,633 gas counts
only three transactions and omits initialisation, listing, and withdrawal, so a complete
single-sale cycle costs about 529,272 gas — roughly 2.1 times the published figure. The
arithmetic is correct; the scope of what is counted is not.

Each finding is tagged verified, inferred, or suspected; only verified defects are asserted as
demonstrated against the published artefacts. The 15-item self-audit of MetaTrade-R uses the
same evidence discipline and is reported separately from the base-paper review.

Three observations motivate this work:

1. **Published security claims are not enforced by published code.** This is a reproducibility
   failure with direct consequences for practitioners who build on the framework.
2. **Content binding is missing from existing AIGC trading systems.** FairSwap [14] provides it
   for generic files but publishes the key at settlement, which is unacceptable for licensed
   content. Commercial AI-IP platforms provide licensing but not on-chain proof of delivery.
3. **Integrity and semantic correctness are conflated.** Treating them as one problem produces
   protocols that either overclaim (hashes cannot prove semantics) or under-deliver (no
   enforceable guarantee at all).

### D. Research Questions and Objectives

The work is organised around five questions:

- **RQ1.** Which of MetaTrade's stated security properties are actually enforced by its
  published implementation?
- **RQ2.** Can payment be bound to a pre-sale content commitment, with on-chain-provable
  disputes and no trusted arbitrator, at acceptable cost?
- **RQ3.** What are the gas, latency, storage, and bandwidth costs of that binding?
- **RQ4.** Under what bond and detection-probability conditions is honest participation
  economically rational?
- **RQ5.** How robust is perceptual-hash similarity detection under content-preserving and
  adversarial transformations?

The corresponding objectives are: (i) conduct a reproducible audit of the published code;
(ii) design and implement a content-binding settlement protocol; (iii) separate integrity from
semantic correctness with distinct procedures and trust assumptions; (iv) measure the cost of
the resulting guarantees; and (v) connect bond sizing to detection probability.

### E. Contributions

1. **Reproducible audit (C1).** A 44-item critical review of MetaTrade's paper, algorithms, and
   published implementations, with file/function/line evidence for the code-level defects, plus
   a 15-item self-audit of the repaired system. The audit is scripted and repeatable.
2. **Content-binding settlement (C2).** A Commit–Recompute–Challenge (CRC) protocol that adapts
   the FairSwap construction with per-buyer ECIES key wrapping. Payment is bound to commitments
   made before the sale, and confidentiality is preserved on the honest path.
3. **Integrity/semantic separation (C3).** A two-mode dispute design: deterministic on-chain
   recomputation for integrity, and a bonded, reveal-based procedure for non-delivery, with
   semantic correctness left to a separate, explicitly probabilistic mechanism.
4. **Bond-sizing model (C4).** An explicit incentive-compatibility condition relating the seller
   bond to the probability that a semantic substitution is detected.

We do not claim a new fair-exchange protocol, a new cryptographic primitive, a new perceptual
hash, or formal verification. The contribution is an audited repair, an implementation, and an
empirical characterisation of its guarantees and costs.

### F. Scope and Non-Claims

The prototype is a research system evaluated on a local Anvil chain with a local IPFS node. It
is not a production deployment. In particular:

- Confidentiality is guaranteed on the honest path only. A dispute publishes the content key
  (AT-14), and this is an accepted residual risk.
- HMAC-CTR provides confidentiality but not authenticated encryption; integrity comes from hash
  commitments and Merkle proofs.
- Semantic correctness is not enforced cryptographically. Perceptual hashing is a similarity
  signal, not proof of originality or plagiarism.
- The system relies on twelve enumerated trust assumptions (TA1–TA12), including ledger
  finality, correct SHA-256 evaluation, IPFS availability during the delivery window, and
  wallet-key custody.
- Gas figures are 30-repetition local-chain measurements (10 for dispute paths), reported with
  mean, median, SD and p95. They are not mainnet estimates; see `docs/MEASURED_RESULTS.md`.
- Theorems in this paper are informal sketches, not machine-checked proofs.

### G. Organisation

Section II positions the work against AIGC provenance, fair exchange, commitment schemes,
confidentiality mechanisms, and blockchain dispute resolution. Section III states the system
model, adversary model, trust assumptions, and security objectives. Section IV describes the
architecture. Section V presents the methodology: commitments, encryption, Merkle proofs, the
CRC state machine, dispute algorithms, bond economics, complexity, and evaluation design.
Sections VI–VII cover the contract and backend implementations. Sections VIII–X report the
security analysis and experimental results. Sections XI–XIII discuss limitations, future work,
and conclusions.

---

## II. Related Work

### A. Blockchain Marketplaces and AIGC Licensing

Blockchain marketplaces replace platform custody with contract-enforced settlement and public
auditability. Truong, Le, and Le [1] propose MetaTrade for AIGC trading in the metaverse, using
AES-256 for content, secp256k1 for key wrapping, and IPFS for ciphertext. MetaTrade claims
resistance to free-riding, false reporting, data leakage, alteration, and plagiarism without a
trusted third party. Our audit contradicts the enforcement of several of these claims; the
settlement check is self-referential, and the plagiarism and rating mechanisms are absent from
the published code.

DECADE [3] combines C2PA content credentials, TrustMark watermarking, ODRL licence terms, and
on-chain escrow for generative assets. It targets provenance and machine-readable licensing, but
its published description does not provide on-chain proof that the delivered ciphertext decrypts
to the committed plaintext. Story Protocol [4], AuraMint [5], BonzAI [6], and GL1F [7]
commercialise AI-IP registration and royalty splits. These are product-level systems and useful
prior art for licence semantics, but they do not address fair exchange of confidential content.

AIGC-Chain [9] tracks the lifecycle of generated content on a ledger, focusing on provenance
rather than trading fairness. Zhang et al. [8] survey AIGC security and identify the absence of a
binding between delivered content and payment as an open problem. Our work takes that problem as
its starting point.

### B. Fair Exchange

Fair exchange asks how two parties can swap items such that either both receive what they want
or neither does. FairSwap [14] is the closest technical ancestor of our exchange core. It
encrypts a file with a stream cipher whose keystream is derived from a public PRF, commits to the
ciphertext with a Merkle tree, and allows the contract to recompute one block of keystream to
adjudicate a misbehaviour proof. The seller reveals the decryption key on-chain at settlement, so
the content becomes public after every sale. MetaTrade-R keeps the recomputation mechanism but
wraps the key to each buyer with ECIES, so the key is not public on the honest path.

OptiSwap [15] adds an optimistic challenge period and reduces on-chain cost. FDE/VECK [16] uses
zero-knowledge proofs and verifiable encryption, which provide stronger guarantees at
substantially higher cost. Dual-deposit escrow [17] requires both parties to post bonds. A
generalisation of FairSwap and OptiSwap [18] improves efficiency but retains the public-key
assumption. ZKCP and verifiable encryption [19] offer strong fairness but require heavy
cryptography. MetaTrade-R occupies the lightweight end of this spectrum: no ZK proofs, no
oracle for integrity, and a per-buyer key wrap as the only additional cryptographic machinery.

### C. Commitments and Merkle Proofs

Cryptographic commitments bind a party to a value while hiding it. Merkle trees provide
membership proofs in O(log n) hash operations [20]. Transparency overlays [21] use Merkle trees
for provable consistency and popularise the idea of a proof of inconsistency, which our dispute
procedure instantiates for content blocks.

MetaTrade-R commits to four objects: a salted hash of the plaintext, a salted hash of the
ciphertext, a Merkle root over plaintext blocks, and a Merkle root over ciphertext blocks. The
pair of roots is what makes the on-chain check meaningful: the contract can verify that a
specific ciphertext block is the one that was committed, decrypt it with the revealed key, and
compare the result against the committed plaintext leaf. A single root would only prove that
*some* ciphertext existed.

### D. Confidentiality and Key Management

Public-key key wrapping is the standard way to deliver a symmetric key to one recipient. ECIES
over secp256k1 is widely deployed and supported by Ethereum tooling. Cassiopeia [22] shows that
heavy on-chain cryptography is feasible but expensive; our design deliberately avoids it by
using a publicly recomputable PRF and a hash commitment to the key.

The trade-off is explicit. FairSwap-style protocols reveal the key to the contract, and
therefore to everyone, at settlement. Encrypting the key to the buyer preserves confidentiality
while the sale is honest, but the key must be revealed if the buyer disputes non-delivery. A
buyer who already holds the key can also publish it. Confidentiality is therefore conditional on
honest behaviour, not absolute; we state this as a limitation rather than a guarantee.

### E. Dispute Resolution and Incentives

UMA's Optimistic Oracle [23] is the canonical bonded-assertion pattern: a claim is accepted
unless challenged within a window. Our integrity dispute does not need an oracle or a challenge
window, because the contract can recompute the relevant block deterministically. The optimistic
pattern is reserved for semantic disputes, where no on-chain procedure can decide correctness.

Game-theoretic treatments of blockchain incentives [24] model attack costs and deterrence.
Bet-and-Attack [25] studies collaborative attacks. Our economic model is deliberately simple: a
risk-neutral seller compares the expected profit from a semantic substitution against the bond
that is slashed when the substitution is detected. This yields a closed-form condition linking
the bond to the detection probability, which we then connect to perceptual-hash robustness.

### F. Comparative Positioning

**Table 1. Content binding, confidentiality, and dispute properties.**

| System | Year | Content binding | Confidentiality | Dispute mechanism | AIGC-specific |
|---|---|---|---|---|---|
| MetaTrade [1] | 2024 | No (self-hash) | Claimed, leaks in Fabric flow | Hash comparison | Partial (pHash) |
| FairSwap [14] | 2018 | Yes (PRF recomputation) | No (key public at settlement) | On-chain proof | No |
| OptiSwap [15] | 2020 | Yes | No | Optimistic challenge | No |
| FDE/VECK [16] | 2024 | Yes (ZK) | Partial | ZK proof | No |
| DECADE [3] | 2025 | No | Watermark-based | Off-chain | Yes (C2PA) |
| Story Protocol [4] | 2025 | No | Not specified | Not specified | Yes |
| UMA OO [23] | — | Not applicable | Not applicable | Oracle | No |
| **MetaTrade-R** | 2026 | **Yes (PRF recomputation)** | **Honest path only** | **On-chain, two modes** | **Partial** |

### G. Research Gaps

- **G1.** No existing system binds payment to the delivered content for AIGC licences.
  MetaTrade's check is self-consistency; FairSwap handles generic files but not licences.
- **G2.** No existing system combines content binding with confidentiality on the honest path.
  FairSwap publishes the key; MetaTrade's Fabric flow leaks it before payment.
- **G3.** Integrity and semantic correctness are conflated. No reviewed system separates them
  into distinct procedures with distinct trust assumptions.
- **G4.** Bond sizing is not linked to fingerprint robustness in existing AIGC marketplaces.
- **G5.** No AIGC marketplace has been empirically audited at the code level.

MetaTrade-R addresses G1 through CRC settlement, G2 through per-buyer key wrapping, G3 through
two-mode disputes, G4 through a detection-probability-linked bond condition, and G5 through a
scripted audit. Semantic disputes still require an oracle or human judgement, and AIGC-specific
licence semantics beyond royalty splitting are out of scope.

---

## III. Methodology

### A. Research Design

The work follows a design-science cycle with an empirical audit at its centre. It has five
phases, and each phase produces an artefact that the next phase consumes:

1. **Audit (P1).** Read the published MetaTrade paper and both implementations; reproduce each
   claimed property against the code; record findings with location evidence and a confidence
   tag (verified, inferred, suspected).
2. **Threat modelling (P2).** Derive an adversary model, a trust set, and explicit security
   objectives from the audit. Properties that cannot be enforced cryptographically are marked
   as economic or out of scope rather than quietly assumed.
3. **Design (P3).** Specify commitments, encryption, Merkle proofs, the settlement state
   machine, dispute procedures, and bond conditions.
4. **Implementation (P4).** Build five contracts, a backend, a cryptographic reference, a CLI,
   and an event watcher.
5. **Evaluation (P5).** Run unit, integration, invariant, vector, and adversarial tests; measure
   gas, storage, and bandwidth; compare against the audited baseline where a comparison is
   meaningful.

The evaluation is intentionally adversarial: the attack harness is written before the results
are interpreted, and two attacks are expected to succeed. Reporting 15 of 18 blocked, one
mitigated and two residual is more informative than claiming immunity.

### B. System Model

There are four on-chain roles and two off-chain components.

- **Seller.** Owns the asset, computes commitments, encrypts the content, uploads the ciphertext
  to IPFS, and posts a bond.
- **Buyer.** Pays the price plus a buyer bond, receives the wrapped key, decrypts, verifies, and
  either confirms or disputes.
- **Contract suite.** `AssetRegistry` stores listings; `SaleEscrow` holds funds and the state
  machine; `DisputeVerifier` performs consistency checks; `RoyaltySplitter` accrues royalties;
  `LicenceToken` mints ERC-1155 licences.
- **Off-chain storage.** IPFS holds ciphertext; the chain holds only commitments and wrapped
  keys.
- **Backend.** A Fastify service that builds transactions, encrypts assets, pins to IPFS, and
  exposes the protocol over HTTP.
- **Watcher.** Subscribes to contract events and maintains a local index for the CLI and API.

The adversary is a probabilistic polynomial-time participant who controls one or more roles and
may deviate arbitrarily from the protocol. The ledger is assumed live and eventually final; the
SHA-256 precompile is assumed correct; IPFS is assumed available during the delivery window;
wallets are assumed to protect their keys. The full set contains twelve assumptions (TA1–TA12)
and is stated in Section III-D; the security analysis names the assumption behind each claim.

### C. Content Preparation and Commitments

Let `D` be the plaintext, `L = |D|` its byte length encoded as a 32-bit big-endian integer, and
`β` the block size in bytes, with `256 ≤ β ≤ 65536`. The seller samples independent random
values `K` (content key), `N` (nonce), `s` (key-commitment salt), `salt_D`, and `salt_C`, and
computes:

```
hD  = SHA-256(0x04 ‖ salt_D ‖ L ‖ D)
hC  = SHA-256(0x05 ‖ salt_C ‖ L ‖ C)
```

The domain tags prevent a hash computed for one purpose from being reinterpreted as another.
The salts make the commitments hiding: without `salt_D`, a low-entropy asset could be recovered
by guessing. Binding follows from collision resistance: finding `D' ≠ D` with
`hD(D') = hD(D)` is a SHA-256 collision.

The listing stores `hD`, `hC`, the two Merkle roots, the key commitment, the block size, the
block count, the price, the royalty rate (capped at 5000 basis points), and an optional parent
asset. The seller cannot change these values after listing without creating a new listing, and
the escrow snapshots the price at purchase time.

### D. Encryption and Key Wrapping

The content key is expanded into a keystream with HMAC-SHA256:

```
kEnc    = HMAC-SHA256(K, 0x01)
ks(i,j) = HMAC-SHA256(kEnc, 0x03 ‖ uint64(i) ‖ uint32(j))
C_i     = D_i ⊕ ks(i,0) ‖ ks(i,1) ‖ ...
```

Here `i` is the block index and `j` the 32-byte word index within the block. The construction is
a counter-mode stream cipher with HMAC-SHA256 as the PRF. It is chosen because the EVM can
recompute one word cheaply through the SHA-256 precompile, which is what makes on-chain
adjudication possible without a zero-knowledge proof. It is not AES-GCM and it is not an AEAD;
integrity is provided separately by the hash commitments and Merkle proofs. A production
deployment should use a standardised AEAD and, where semantic correctness matters, an oracle.

The key commitment is

```
cK = SHA-256(0x08 ‖ K ‖ N ‖ s)
```

and the seller wraps `K` to the buyer's secp256k1 public key with ECIES:

```
encK = ECIES.Enc(pk_B, K)
```

`encK` is delivered on-chain. Only the buyer can unwrap it, so the honest path preserves
confidentiality even though the ciphertext is public on IPFS. The contract never needs `K` to
verify delivery; it needs `K` only when a dispute is adjudicated. This is the central
architectural trade-off: confidentiality on the honest path, disclosure on the disputed path.

### E. Merkle Commitments and Consistency Proofs

The seller splits `D` and `C` into the same `m = ceil(L/β)` blocks and computes leaves:

```
leafD_i = SHA-256(0x06 ‖ uint64(i) ‖ D_i)
leafC_i = SHA-256(0x07 ‖ uint64(i) ‖ C_i)
```

Internal nodes use a distinct tag:

```
node = SHA-256(0x09 ‖ left ‖ right)
```

Including the index in the leaf prevents a seller from permuting or reusing blocks across
positions. The roots `R_D` and `R_C` are stored on-chain. A proof for block `i` consists of the
sibling path in each tree, which is `O(log m)` hashes; for a 5 MiB asset with 1 KiB blocks
(`m = 5120`), each path is about 13 hashes, so a two-tree proof is roughly 26 hashes regardless
of file size.

The consistency relation checked by the contract is:

```
verify(R_C, leafC_i, i, proofC)
verify(R_D, leafD_i, i, proofD)
D_i' = C_i ⊕ ks(i)
SHA-256(0x06 ‖ uint64(i) ‖ D_i') == leafD_i
```

All three conditions must hold. The first two bind the supplied blocks to the committed trees;
the third binds the decryption of the committed ciphertext to the committed plaintext. Omitting
the first two would let a buyer fabricate a block that was never committed; omitting the third
would reduce the check to the self-consistency error we criticise in MetaTrade.

### F. Settlement State Machine

A sale moves through four states. `T_deliver`, `T_confirm`, and `T_respond` are absolute
timestamps derived from `block.timestamp`.

**Table 2. Sale states and transitions.**

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
dispute that the contract rejects forfeits it. Audit finding F-04 questions whether this penalty
is proportionate, because the licence is still minted to the buyer even when the claim fails; we
retain it as an anti-spam measure and report the trade-off rather than hiding it. The seller
bond is set to the sale price and is reserved from a credit balance deposited before listing,
which prevents a seller from listing an asset it cannot back.

**Implementation note.** `respond()` returns the sale to `DELIVERED` and does not extend
`T_confirm`. Consequently the `CHALLENGED && keyRevealed` branch in `disputeMode1()` is
unreachable, and a response that arrives after `T_confirm` leaves the buyer unable to file
Mode 1, after which the seller can settle through `timeoutConfirm()`. This is recorded as a
known limitation and a Tier-2 remediation item; the protocol description above is the intended
behaviour, and the evaluation reports what the current code does.

### G. Dispute Procedures

**Mode 1 — integrity dispute.** The buyer holds `K`, has decrypted the content locally, and has
found a block that does not match the committed plaintext. It submits
`(K, N, s, i, C_i, leafD_i, proofD, proofC)`. `DisputeVerifier` checks the key commitment, both
Merkle paths, and the recomputed leaf. If all checks pass, the seller committed an inconsistent
pair of trees and loses the bond; the buyer is refunded and receives the seller bond. If any
check fails, the buyer's claim is rejected, the sale settles to the seller, and the buyer forfeits
its bond. The decision is deterministic: there is no sampling, no challenge period, and no
arbitrator.

**Mode 2 — non-delivery or bad key.** The buyer cannot decrypt because `encK` is malformed,
because the seller delivered the wrong key, or because the seller delivered nothing usable. The
buyer opens a challenge. The seller must reveal `(K, N, s)` within `T_respond`; the contract
accepts the response only if the key commitment matches. If the seller responds, the buyer can
decrypt and, if the content is inconsistent, proceed with Mode 1. If the seller does not respond,
the buyer is refunded and the seller bond is slashed. Mode 2 is therefore a forced-revelation
procedure, not a correctness oracle.

Both modes are necessary because they cover different failures. Mode 1 assumes the buyer can
decrypt; Mode 2 handles the case where it cannot. Collapsing them into one procedure either
lets a seller withhold the key (if only Mode 1 exists) or lets a buyer force disclosure without
proving anything (if only Mode 2 exists).

### H. Bond Economics

Let `p` be the price, `b_s` the seller bond, `P_d` the probability that a semantic substitution
is detected, `c_g` the cost of producing the garbage asset, and `c_d` the cost of defending a
dispute. A risk-neutral seller chooses between honest participation, with profit `p − c_h`, and
a semantic substitution, with expected profit

```
E[π_semantic] = (1 − P_d)(p − c_g) − P_d(b_s + c_d).
```

Deterrence requires `E[π_semantic] < 0`, which gives

```
b_s > ((1 − P_d)(p − c_g) − P_d c_d) / P_d.
```

For `c_g ≈ 0` and `c_d ≤ p`, the condition simplifies to

```
b_s > ((1 − P_d)/P_d) · p.
```

The formula is load-bearing: if detection is a coin flip (`P_d = 0.5`), the bond must exceed the
price; if detection is one in ten (`P_d = 0.1`), it must exceed nine times the price. Solvency
adds a second constraint, because the bond must also cover the refund:

```
b_s = max(p, ((1 − P_d)/P_d) · p).
```

The model assumes rationality and risk neutrality. It does not deter a griefing attacker who
derives utility from harm, and it does not replace detection: if `P_d` is zero, no finite bond
works. This is why the perceptual-hash experiment matters. Perceptual hashing is used as a
similarity signal for estimating `P_d`; it is not proof of plagiarism, and it is not part of the
on-chain integrity guarantee.

### I. Complexity

Let `L` be the content size, `β` the block size, `m = ceil(L/β)` the number of blocks, and `s`
the number of sampled blocks when sampling is used.

| Operation | Cost | Notes |
|---|---|---|
| Encryption | `O(L)` | one pass, `ceil(β/32)` HMAC calls per block |
| Commitment | `O(m)` leaves plus `O(m)` internal nodes | `O(L)` hashing overall |
| Listing | `O(1)` on-chain storage | nine 32-byte commitment fields plus metadata (367 bytes measured) |
| Delivery | `O(1)` on-chain | wrapped key is bounded at 1024 bytes |
| Mode 1 dispute | `O(log m + β/32)` | two Merkle paths plus one block recomputation |
| Confirmation | `O(1)` on-chain | local verification is off-chain |
| Per-sale storage | `O(1)` | one wrapped key (128 bytes measured), not a re-encryption |

The ciphertext is stored once on IPFS in B0, B2 and B3. The published Ethereum B0
stores one key string per buyer (`customerAddrToData[buyer].encryptedSymmetricKey`),
and B3 stores one 128-byte wrapped key per sale. The storage model is therefore
near parity between B0 and B3; we do not claim a storage reduction. What B3 adds is
buyer-side verification, a dispute procedure and royalty accounting, at roughly 2.1x
the per-sale gas (Section K). An earlier draft's `O(n*L)` comparison assumed B0
re-uploads the asset per buyer; the published contract does not, so that claim is
withdrawn.

### J. Implementation Mapping

**Table 3. Contracts and responsibilities.**

| Contract | Responsibility | Key entry points |
|---|---|---|
| `AssetRegistry` | Listings, commitments, block parameters, royalties | `list`, `deactivate`, `get`, `isActive`, `sellerOf` |
| `SaleEscrow` | Funds, state machine, bonds, timeouts, disputes | `buy`, `deliver`, `confirm`, `disputeMode1`, `disputeMode2`, `respond`, `timeout*` |
| `DisputeVerifier` | Stateless consistency and Merkle checks | `checkConsistency`, `keyCommitment` |
| `RoyaltySplitter` | Pull-payment royalty balances | `credit`, `withdraw`, `creditOf` |
| `LicenceToken` | ERC-1155 licence minting | `mint`, `setMinter` |

The backend exposes 16 application endpoints (assets, sales, royalty) plus a health probe, and
handles encryption, IPFS pinning, transaction construction, and event indexing. The TypeScript
cryptographic module is a reference implementation of the on-chain formulas; it is checked
against RFC 4231 HMAC vectors, NIST SHA-256 vectors, and Merkle test vectors, and against the
Solidity implementation through shared vectors.

### K. Evaluation Design

Each research question maps to a measurement:

**Table 4. Evaluation matrix.**

| Question | Metric | Procedure |
|---|---|---|
| RQ1 | Enforced vs claimed properties | Scripted audit against published code; finding table with evidence |
| RQ2 | Dispute soundness and completeness | Unit and adversarial tests; 18 executable scenarios |
| RQ3 | Gas, latency, storage, bandwidth | 30 repetitions on local Anvil; 100 sequential cycles; fixed 256-byte block |
| RQ4 | Deterrence condition | Analytic derivation plus parameter sweep over `P_d` and `p` |
| RQ5 | Similarity robustness | 80-image perceptual-hash pilot under 28 transforms |

Functional correctness is established with 72 Foundry test cases, including three stateful
invariants (funds conservation, single-state consistency, terminal-state absorption) run for 256
runs at depth 256, plus 14 backend integration tests and 7 watcher integration tests against a
real local chain. Cryptographic correctness is established with published vectors. Adversarial
behaviour is evaluated with 18 scenarios: 15 are blocked, one is mitigated by the buyer bond
(dispute spam), and two are reported as residual risks (semantic garbage that is internally
consistent, and key disclosure through dispute). AT-18..AT-29 are not settlement-contract tests
and are not counted.

Gas is measured over 30 repetitions per operation (10 for the dispute paths) on a local Anvil
chain with `optimizer_runs = 200` and `via_ir = true`. A per-sale cycle (buy, deliver, confirm)
costs 456,691 gas on average, versus 217,860 for B1 and 220,846 for B2; listing costs 181,647.
A Mode-1 integrity dispute costs 241,278 gas, Mode 2 costs 33,160, and a response costs 158,443.
The SDs and p95 are in `docs/MEASURED_RESULTS.md`. The earlier single-run figures (448,119 for a
cycle, 324,580 for a dispute) are within the same order but are superseded. The dispute cost is
higher than a hash comparison because it includes two Merkle verifications and one keystream
block recomputation; that is the price of binding.

Threats to validity are handled explicitly. Internally, the harness and the contracts were
written by the same author; we mitigate this with published vectors and independent recomputation
in Python. Externally, results come from a local chain with a single node, so they do not
establish behaviour under network partition or adversarial miners. Construct validity is
protected by measuring the properties the design claims, not proxies: integrity is tested by
tampering with committed blocks, not by checking that a function returns true. Conclusion
validity is protected by reporting negative results (the two residual attacks, the unreachable
branch, the non-AEAD cipher) rather than omitting them.
