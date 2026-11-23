# MATHEMATICAL FORMULATION

**Purpose:** to define every object, state every assumption, and state every claim with its exact scope. Proofs are given as **sketches** and are labelled as such. No claim is made that has not been derived or explicitly assumed.

---

## 1. Notation

| Symbol | Meaning |
|---|---|
| `λ` | Security parameter; `λ = 256` |
| `D` | Plaintext asset, `D ∈ {0,1}^L` |
| `L` | Plaintext length in bytes |
| `β` | Block size in bytes (default `β = 1024`) |
| `m` | Number of blocks, `m = ⌈L/β⌉` |
| `D_i` | Block `i` of `D`, `i ∈ {0,…,m-1}` |
| `K` | 256-bit content key |
| `N` | 128-bit nonce |
| `s` | 256-bit commitment salt |
| `salt_D, salt_C` | Independent 256-bit hiding salts |
| `H(·)` | SHA-256 |
| `HMAC(·,·)` | HMAC-SHA256 |
| `K_enc` | `HMAC(K, 0x01)` — keystream key |
| `C` | Ciphertext, `|C| = L` |
| `C_i` | Ciphertext block `i` |
| `hD` | Plaintext commitment |
| `hC` | Ciphertext commitment |
| `R_D` | Merkle root over plaintext-block leaves |
| `R_C` | Merkle root over ciphertext-block leaves |
| `Λ_D, Λ_C` | Published leaf lists (hashes), bound to `R_D`, `R_C` |
| `cK` | Key commitment |
| `p` | Price |
| `b_s, b_b, b_r` | Seller, buyer, reporter bonds |
| `r` | Royalty rate in basis points, `r ∈ [0, r_max]` |
| `P_d` | Probability a semantic substitution is detected |
| `c_h, c_g` | Seller's honest delivery cost; cost of producing garbage |
| `c_d` | Cost of running a dispute (gas + fees) |
| `R` | Reporter reward |
| `T_x` | Timeout for phase `x` |

---

## 2. Primitives and assumptions

| ID | Assumption | Used for |
|---|---|---|
| **A1** | SHA-256 is collision-resistant | Commitments, Merkle roots |
| **A2** | SHA-256 is preimage-resistant | Hiding of leaf lists |
| **A3** | HMAC-SHA256 is a pseudorandom function under a secret key | Keystream, key derivation |
| **A4** | ECIES over secp256k1 is IND-CCA secure | Wrapped key confidentiality |
| **A5** | `K` is sampled uniformly and used for exactly one asset | Keystream uniqueness |
| **A6** | The EVM computes SHA-256 correctly and gas is bounded | On-chain verification |
| **A7** | Block timestamps are monotonic within tolerance `δ_t` | Timeouts |

**Caveat on A3/A5.** The construction is a stream cipher in counter mode with HMAC-SHA256 as the PRF. It is not AES-GCM. It is chosen because the EVM can recompute one keystream block cheaply, which is what makes on-chain verification possible without a ZK proof. A production deployment should use a standardised AEAD and an oracle (Mode B in §12). The thesis states this trade-off explicitly and does not claim the cipher is a contribution.

---

## 3. Content commitment

### 3.1 Hiding commitments

```
hD = H(0x04 || salt_D || L || D)
hC = H(0x05 || salt_C || L || C)
```

**Binding:** under A1, finding `D' ≠ D` with `hD(D') = hD(D)` requires a collision.
**Hiding:** `salt_D` is uniform and secret until listing; under A2, `hD` reveals no information about `D` beyond length. (The salt is published at listing, so hiding holds only *before* listing — which is the point: the commitment is made public only when the asset is listed.)

### 3.2 Merkle commitment

Leaves (with index binding and domain separation):

```
L_i^D = H(0x06 || i || D_i)
L_i^C = H(0x07 || i || C_i)
```

`R_D` and `R_C` are binary Merkle roots over `L^D` and `L^C`. The leaf lists `Λ_D = (L_0^D,…,L_{m-1}^D)` and `Λ_C` are published on IPFS and bound to the roots by construction.

**Why index binding matters:** without `i` in the leaf, a seller could reorder blocks, or duplicate a leaf, and still produce a valid root. With `i`, the position is committed.

**Why domain tags matter:** `0x04…0x08` prevent cross-type collisions (e.g., a plaintext leaf being reinterpreted as a ciphertext leaf).

---

## 4. Encryption and the consistency relation

### 4.1 Keystream

```
K_enc = HMAC(K, 0x01)
ks(i) = HMAC(K_enc, 0x03 || i || 0) || HMAC(K_enc, 0x03 || i || 1) || … || HMAC(K_enc, 0x03 || i || (β/32 - 1))
C_i   = D_i XOR ks(i)                    for i ∈ {0,…,m-1}
```

`ks(i)` is `β` bytes, formed by concatenating `β/32` HMAC outputs. Each output is a 32-byte word indexed by `(i, j)`, which is exactly what `DisputeVerifier.keystreamWord(kEnc, i, j)` computes on-chain.

### 4.2 Consistency relation

Define, for a key `K` and block index `i`:

```
Φ(K, i, C_i) := C_i XOR ks(i)
```

The protocol is **consistent at block `i`** iff

```
Φ(K, i, C_i) = D_i        (equivalently, H(0x06 || i || Φ(K,i,C_i)) = L_i^D)
```

The whole asset is consistent iff this holds for all `i`.

### 4.3 Key commitment

```
cK = H(0x08 || K || N || s)
```

`cK` binds the key, nonce and salt. It is the only object that must be revealed to trigger an integrity dispute.

---

## 5. Merkle proofs

A proof `π_i` for leaf `L_i` is the sibling path of length `⌈log₂ m⌉`. Verification:

```
v ← L_i
for level = 0 … ⌈log₂ m⌉-1:
    if bit(level, i) = 0:  v ← H(0x09 || v || π_i[level])
    else:                  v ← H(0x09 || π_i[level] || v)
accept iff v = R
```

**Cost:** `⌈log₂ m⌉` hashes. For `m = 5120`, that is 13 hashes per proof; two proofs (plaintext and ciphertext) cost ≈ 26 hashes.

**Security:** under A1, a proof for a leaf not in the tree is rejected except with negligible probability. The index bits fix the path position, so a buyer cannot "move" a leaf to a different index.

---

## 6. Protocol state machine

States: `LISTED → ESCROWED → DELIVERED → {SETTLED, CHALLENGED}`, `CHALLENGED → {SETTLED, REFUNDED}`, plus `EXPIRED` from any pre-terminal state.

| Transition | Guard | Effect |
|---|---|---|
| `list` | seller only; `active = true` | write commitments; state `LISTED` |
| `buy` | `active`; `msg.value = p + b_b` | state `ESCROWED`; snapshot `p` |
| `deliver` | seller; `now ≤ T_deliver` | store `encK`; state `DELIVERED` |
| `confirm` | buyer; `now ≤ T_confirm` | pay seller; mint license; state `SETTLED` |
| `disputeMode1` | buyer; `now ≤ T_confirm` | verify chunk proof; resolve immediately |
| `disputeMode2` | buyer; `now ≤ T_confirm` | state `CHALLENGED`; start `T_respond` |
| `respond` | seller; `now ≤ T_respond` | verify `cK`; then Mode 1 becomes available |
| `timeoutDeliver` | anyone; `now > T_deliver` | refund; slash seller; state `REFUNDED` |
| `timeoutConfirm` | seller; `now > T_confirm` | pay seller; state `SETTLED` |
| `timeoutRespond` | anyone; `now > T_respond` | refund; slash seller; state `REFUNDED` |

**Termination bound:**

```
T_max = T_deliver + T_confirm + T_respond + δ_t
```

Every path reaches a terminal state within `T_max` provided blocks are produced (A7).

---

## 7. Security definitions

**Def. 1 (Integrity).** For any PPT seller `S*`, if buyer `B` follows the protocol and the sale reaches `SETTLED` via `confirm`, then `H(0x04 || salt_D || L || D_received) = hD` except with probability `negl(λ)`.

**Def. 2 (Buyer fairness).** For any PPT `S*`, if `B` pays `p` and follows the protocol, then either `B` obtains `D` with `H(…) = hD`, or `B` is refunded `p`, except with probability `negl(λ)`.

**Def. 3 (Seller fairness).** For any PPT buyer `B*`, if `S` delivers consistently and `B*` follows the protocol, then `S` is paid `p`, except with probability `negl(λ)`.

**Def. 4 (Dispute soundness).** For any PPT `B*`, if `S` committed consistently, then `B*` cannot produce a chunk proof that the contract accepts as an inconsistency, except with probability `negl(λ)`.

**Def. 5 (Dispute completeness).** If `S` committed inconsistently at some block `i`, then a buyer holding `K` can produce a proof that the contract accepts, with probability `1 - negl(λ)`.

**Def. 6 (Termination).** Every execution reaches a terminal state within `T_max`, except with probability `negl(λ)`.

---

## 8. Theorems (sketches)

### Theorem 1 (Integrity)
*If the buyer confirms, then the received plaintext equals the committed plaintext, except with negligible probability.*

**Sketch.** `confirm` requires the buyer to have checked `H(0x04 || salt_D || L || D') = hD` locally. Under A1, `D' ≠ D` implies a collision. ∎

### Theorem 2 (Dispute soundness)
*If the seller committed consistently, no buyer can produce an accepted inconsistency proof.*

**Sketch.** An accepted proof consists of `(i, K, C_i, π_i^C, L_i^D, π_i^D)` such that:
1. `H(0x08 || K || N || s) = cK` — so `K` is the committed key (A1).
2. `π_i^C` verifies `L_i^C = H(0x07 || i || C_i)` against `R_C` (A1).
3. `π_i^D` verifies `L_i^D` against `R_D` (A1).
4. `H(0x06 || i || Φ(K,i,C_i)) ≠ L_i^D`.

If the seller was consistent, then for every `i`, `Φ(K,i,C_i) = D_i`, hence `H(0x06 || i || Φ) = L_i^D`, contradicting (4). Therefore no such tuple exists. ∎

### Theorem 3 (Dispute completeness)
*If the seller committed inconsistently at block `i`, a buyer holding `K` can produce an accepted proof.*

**Sketch.** The buyer obtains `K` from `Enc_B(K)`, computes `Φ(K,i,C_i)`, and observes `H(0x06 || i || Φ) ≠ L_i^D` for the inconsistent block. It supplies the published `L_i^D` with its path from `Λ_D`, and `C_i` with its path from `Λ_C`. All four conditions hold; the contract accepts. ∎

### Theorem 4 (Termination)
*Every execution reaches a terminal state within `T_max`.*

**Sketch.** Each non-terminal state has a timeout transition guarded only by `now`; under A7 the guards eventually fire. The state graph is acyclic. ∎

### What is *not* proved

- No game-based computational proof with a reduction. The sketches are informal.
- No proof of the economic claims; those are incentive-compatibility arguments under A9 (rationality), not cryptographic theorems.
- No proof that the semantic layer detects substitution; `P_d` is measured, not derived.

The thesis will say this explicitly. It will not label the sketches "proofs."

---

## 9. Sampling bound (why it is not the soundness mechanism)

If a fraction `f` of blocks are corrupted and `s` blocks are sampled uniformly without replacement, the probability of missing all corrupted blocks is

```
P_miss = C(m(1-f), s) / C(m, s)  ≈  (1 - f)^s
```

For a target `δ`: `s ≥ ln(1/δ) / ln(1/(1-f)) ≈ ln(1/δ)/f`.

**Use:** this bound governs only an optional *bandwidth* optimisation (verify `s` blocks before downloading the rest). It does **not** govern correctness. Correctness comes from Theorem 2/3, which are deterministic. A design that relied on `P_miss` for correctness would be unsound (see `FINAL_RESEARCH_DESIGN.md` §3, DC-1).

---

## 10. Economic model

### 10.1 Setup

Adversaries are rational and risk-neutral (A9). Each attack has an outside option of `0` for a fraudulent entrant, or the honest payoff for a legitimate participant. Bonds are posted in the native asset and are slashed on a proven violation.

### 10.2 Seller: integrity cheat

The seller commits inconsistently. Detection is **certain** if the buyer verifies (the protocol requires it). Payoff:

```
Π_integrity = -b_s - c_d  < 0
```

Honest payoff `Π_honest = p - c_h > 0`. Honest strictly dominates. **No bond is required for deterrence**; `b_s ≥ p` is required only for refund solvency.

### 10.3 Seller: semantic cheat (misdescription)

The seller has no valuable asset and lists garbage at price `p`. The outside option is `0`. Detection occurs with probability `P_d`. Payoff:

```
E[Π_semantic] = (1 - P_d)(p - c_g) - P_d (b_s + c_d)
```

Deterrence requires `E[Π_semantic] < 0`:

```
b_s  >  ((1 - P_d)(p - c_g) - P_d c_d) / P_d
```

For `c_g ≈ 0` and `c_d ≪ p`:

```
b_s  >  ((1 - P_d)/P_d) · p                                   (★)
```

**This is the load-bearing formula.** It is why the plagiarism-detection experiment matters: if `P_d = 0.5`, the bond must exceed `p`; if `P_d = 0.1`, it must exceed `9p`; if `P_d = 0.9`, `0.11p` suffices.

Combined with solvency:

```
b_s  =  max( p , ((1 - P_d)/P_d) · p )                        (★★)
```

### 10.4 Buyer: false integrity dispute

Mode 1 verification is deterministic. A rational buyer knows the outcome and never files a false dispute. For an irrational or griefing buyer, the loss is `b_b + c_d`. Set `b_b ≥ c_d` to cover the anti-spam cost. No `b_b > p` condition is needed. (This corrects the previous "bond > price" heuristic.)

### 10.5 Seller: respond incentive (Mode 2)

The seller must reveal `K` within `T_respond`. It does so iff

```
p + b_s  >  c_d
```

which holds for any non-trivial sale. If it does not respond, it loses `b_s` and the sale.

### 10.6 Reporter

Honest report payoff: `R - c_report`. False report payoff: `-b_r - c_report`. Conditions:

```
R > c_report            (honest reporting is worth doing)
b_r > R                 (false reporting is unprofitable)
```

### 10.7 Sybil

Each identity must post the relevant bond per attack. The cost of `k` attacks is `k·(b + gas)`. There is no identity-based defence; the claim is **linear cost**, not Sybil-proofness.

### 10.8 Collusion

| Coalition | Attempt | Outcome |
|---|---|---|
| Seller + buyer | Fake a sale to move royalty | Royalty flows *to* the parent, so faking costs the colluders; under-reporting requires an off-chain side payment (out of scope) |
| Plagiarist + reporter | De-list a rival | The report needs a valid similarity proof; a false report loses `b_r` |
| Buyer + outsider | Leak content via dispute | The buyer already holds the content; no marginal leak |

### 10.9 Griefing

Mode 1 requires no seller response, so dispute spam imposes cost only on the spammer (gas + `b_b`). Mode 2 spam forces a key reveal, but the spammer already holds the content. Both are self-limiting.

### 10.10 Assumption register for the economic claims

The economic results hold only under: rationality, risk neutrality, no unmodelled collusion, honest measurement of `P_d`, and bonds that are actually collectible (i.e., the slashed party is solvent). The thesis will state these as limitations.

---

## 11. Royalty allocation

For a single parent with rate `r` (basis points, `r ∈ [0, r_max]`):

```
payout_child  = floor(p · (10000 - r) / 10000)
payout_parent = p - payout_child
```

`payout_child + payout_parent = p` exactly (dust goes to the parent). `r` is set by the **parent** at authorisation and stored immutably in the child listing; the child cannot change it (fixes MetaTrade's contradiction). For a chain of depth `d`, the split recurses; the thesis implements depth 1 and documents the recursion.

**Invariant:** `0 ≤ r ≤ r_max < 10000`, and the sum of payouts equals `p`.

---

## 12. Attack success probability

**Cryptographic attacks.** Success probability `≤ negl(λ)` under A1–A4. Examples: forging a commitment, forging a Merkle proof, recovering `K` from `cK`.

**Integrity attacks.** Success probability `0` for AT-02 (inconsistent commitment), AT-04 (key-before-payment), AT-11 (false dispute), AT-12 (fabricated proof), modulo `negl(λ)`.

**Semantic attacks.** Success probability `1 - P_d`, measured empirically. `P_d` is a function of the fingerprint, the threshold `τ`, and the transformation family:

```
P_d = TPR(τ)   at   FPR = α
```

**Economic attacks.** Success probability is the probability that the attack is profitable:

```
P_profit(a) = Pr[ Π(a) > 0 ]
```

and the design goal is `E[Π(a)] ≤ 0` for every `a` in the catalogue. The thesis reports `E[Π(a)]` under the measured `P_d`, not an assumed one.

---

## 13. Complexity

Let `n` be the number of buyers, `κ = 32` bytes the key size.

| Resource | MetaTrade-R | MetaTrade (base) |
|---|---|---|
| Ciphertext storage | `O(L)` (encrypt once) | `O(n·L)` (re-encrypt per buyer) |
| Key material | `O(n·κ)` | `O(n·κ)` |
| Commitment metadata | `O(m)` hashes | `O(1)` |
| On-chain storage | `O(1)` per listing + `O(1)` per sale | `O(1)` per sale |
| Listing gas | `O(1)` (roots only) | `O(1)` |
| Dispute gas | `O(log m + β/32)` | `O(1)` (but unsound) |
| Confirm gas | `O(1)` | `O(1)` |
| Encryption time | `O(L)` once | `O(n·L)` |
| Decryption time | `O(L)` per buyer | `O(L)` per buyer |
| Local verification | `O(L)` per buyer | `O(L)` per buyer |

**Dispute gas, concretely.** Two Merkle proofs: `2·⌈log₂ m⌉` hashes. Keystream: `β/32` HMAC evaluations, each two SHA-256 precompile calls. For `β = 1024`, that is 32 HMACs = 64 precompile calls. Estimated 8–20k gas; to be measured in E4.

**Why `O(L)` storage is the right target.** MetaTrade's per-buyer re-encryption is `O(n·L)`; for a 5 MB asset sold 1,000 times that is 5 GB of duplicate ciphertext. Encrypt-once reduces it to 5 MB plus 32 KB of wrapped keys. This is the D3 measurement.

---

## 14. Assumption register (summary)

| Claim | Depends on |
|---|---|
| Integrity | A1, A6 |
| Dispute soundness | A1, A6 |
| Dispute completeness | A1, A5, A6 |
| Confidentiality (honest path) | A3, A4, A5 |
| Termination | A7 |
| Semantic deterrence | A9, measured `P_d` |
| Refund solvency | `b_s ≥ p`, collectible bonds |
| Sybil cost linearity | bonds are per-attack |
| No new leak from dispute | buyer already holds `K` |

Every claim in the thesis must cite a row of this table or be marked as empirical.
