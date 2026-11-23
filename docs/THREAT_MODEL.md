# THREAT MODEL

**Scope:** MetaTrade-R (CRC settlement) and its AIGC-license layer.
**Method:** asset-centric threat modelling plus an explicit adversary catalogue. Every attack has a stated precondition, a success criterion, a mitigation, and a residual risk. Attacks that the design does **not** stop are listed as residual, not omitted.

---

## 1. Assets

| ID | Asset | Owner | Why it matters |
|---|---|---|---|
| A1 | Plaintext content `D` | Seller | Sale value; leakage destroys resale value |
| A2 | Content key `K` | Seller (until delivery) | Unlocks `D` |
| A3 | Payment `p` | Buyer → Seller | The thing being exchanged |
| A4 | Bonds `b_s`, `b_b`, `b_r` | Parties | Collateral for honest behaviour |
| A5 | License token | Buyer | Proof of rights |
| A6 | Royalty stream | Parent creator | Economic incentive to create derivatives |
| A7 | Fingerprint `fp` | Seller / registry | Basis of plagiarism claims |
| A8 | Reputation | Seller / buyer | Secondary quality signal |
| A9 | Availability of `C` | Pinner / network | Buyer must be able to fetch |
| A10 | Metadata privacy | Parties | Purchase history, revenue, identity linkage |

---

## 2. Actors and trust boundaries

| Actor | Trusted for | Not trusted for |
|---|---|---|
| Seller | Owning `D`, choosing `K` | Honest delivery, honest description |
| Buyer | Paying, verifying | Honest dispute |
| Watcher | Nothing (permissionless) | — |
| Committee / oracle | Semantic adjudication only | Integrity adjudication (not used) |
| Marketplace owner | Parameter updates (if any) | Adjudication, custody |
| IPFS pinner | Serving bytes | Availability guarantee |
| RPC provider | Submitting transactions | Correctness of returned state (verify) |
| Front-end | UX | Correctness of hashes/keys (verify client-side) |
| EVM validators | Finality | — |

**Trust boundary 1:** on-chain state vs off-chain content. The chain knows commitments, not bytes.
**Trust boundary 2:** buyer endpoint. The protocol assumes the buyer's machine is not compromised.
**Trust boundary 3:** storage. Content addressing gives integrity, not availability.
**Trust boundary 4:** front-end. A malicious front-end can show a different asset than the one being bought.

---

## 3. Adversary classes

| Class | Capability | Goal |
|---|---|---|
| **S1 Malicious seller** | Chooses `D`, `K`, commitments; can deliver late, wrong, or nothing | Take payment without delivering value |
| **S2 Malicious buyer** | Pays, receives, can dispute falsely; can withhold confirmation | Get content and refund |
| **S3 Colluding pair** | S1 + S2 coordinate | Extract bonds, launder reputation, evade royalty |
| **S4 External plagiarist** | Lists a derivative of another seller's asset | Capture sales without paying royalty |
| **S5 Spam reporter** | Files many plagiarism reports | De-list a rival; extort |
| **S6 Griefer** | Repeatedly opens/closes sales or disputes | Impose cost, exhaust state |
| **S7 Network observer** | Sees all on-chain data and IPFS traffic | Deanonymise, harvest fingerprints |
| **S8 Compromised front-end** | Controls the UI | Substitute asset or address at purchase time |
| **S9 Malicious pinner** | Controls storage | Withhold or serve altered bytes |
| **S10 Malicious committee member** | Sits on the semantic dispute committee | Rule falsely for a bribe |

---

## 4. Attack catalogue

Each attack is implemented as a script in the evaluation harness. "Success criterion" is what the harness measures.

### 4.1 Settlement attacks

| ID | Attack | Precondition | Success criterion | Mitigation | Residual |
|---|---|---|---|---|---|
| **AT-01** | **Consistent garbage listing.** Seller commits to garbage `D_g`, publishes matching `C_g`, `hD`, `hC`, `R_D`, `R_C`. | None | Buyer pays and receives `D_g` that passes integrity | Preview + committed fingerprint + bond sized by `P_d`; reputation | **Yes** — integrity cannot detect this. This is the semantic gap. |
| **AT-02** | **Inconsistent commitment.** Seller commits `hD` for the real asset but `C` for garbage (or vice versa). | None | Buyer pays and integrity check passes | CRC chunk-consistency proof catches it; buyer wins dispute | No |
| **AT-03** | **Wrong key delivery.** Seller posts `Enc_B(K')` with `K' ≠ K`. | None | Buyer cannot decrypt; seller still paid | Dispute Mode 2: seller must reveal valid `K` within `T_respond`; else refund + slash | Partial — seller can reveal late and still be paid; buyer loses only gas |
| **AT-04** | **Key-before-payment.** Buyer obtains key, then claims failure. | Key released pre-settlement | Buyer gets content + refund | CRC never releases `K` before settlement; Mode 1 requires a valid failing chunk | No |
| **AT-05** | **Re-initialisation / ownership takeover.** | Contract clone with public `initialize` | Attacker rewrites price, owner, royalty | `initializer` modifier + `require(owner == address(0))`; immutable args where possible | No |
| **AT-06** | **Price change after deposit.** Seller raises price while buyer's funds are escrowed. | `updatePrice` callable post-listing | Buyer cannot settle; funds frozen | Price snapshot at purchase; `updatePrice` only when no active sale | No |
| **AT-07** | **De-listed asset still trading.** | `active` flag not read by escrow | Flagged/plagiarised asset sells | Escrow reads `active` on buy, deliver, confirm | No |
| **AT-08** | **Overpayment stranding.** Buyer sends more than `p`. | No refund of excess | Excess locked | Exact-payment check or immediate refund of excess | No |
| **AT-09** | **Refund wiping.** A successful sale zeroes a prior pending refund. | Shared balance mapping | Buyer loses owed funds | Per-sale escrow records; pull payments; no shared mutable balance | No |
| **AT-10** | **`.transfer` griefing.** Seller uses a smart-contract wallet. | 2300-gas transfer | Payment fails, funds stuck | `call{value:}` with reentrancy guard, or pull pattern | No |

### 4.2 Dispute attacks

| ID | Attack | Precondition | Success criterion | Mitigation | Residual |
|---|---|---|---|---|---|
| **AT-11** | **False integrity dispute.** Buyer has correct content, claims a bad chunk. | Buyer holds valid `K` | Refund | Contract recomputes `D_i = C_i ⊕ HMAC(K,i)`; if consistent, buyer loses bond | No (deterministic) |
| **AT-12** | **Fabricated chunk proof.** Buyer supplies a chunk not in the tree, or mismatched proofs. | None | Refund | Merkle verification against `R_D`, `R_C`; index binding in leaves | No |
| **AT-13** | **Dispute spam.** Buyer opens and abandons disputes. | Low bond | Seller gas/state exhaustion | Mode 1 needs no seller response; small anti-spam bond; per-sale state is O(1) | Low |
| **AT-14** | **Leak-by-dispute.** Buyer disputes to force public key reveal. | Buyer already owns content | Content becomes public | No marginal harm (buyer could leak anyway); bond makes it costly | **Accepted** |
| **AT-15** | **Seller stalls after dispute.** Seller never reveals in Mode 2. | None | Buyer stuck | `T_respond` timeout → refund + slash | No |
| **AT-16** | **Buyer stalls confirmation.** Buyer neither confirms nor disputes. | None | Seller unpaid | `T_confirm` timeout → seller paid | No |
| **AT-17** | **Timestamp manipulation.** Miner shifts time to expire a window. | Miner collusion | Premature timeout | Bounded window tolerance; use block numbers where possible | Low |

### 4.3 Plagiarism and reputation attacks

| ID | Attack | Precondition | Success criterion | Mitigation | Residual |
|---|---|---|---|---|---|
| **AT-18** | **Geometric evasion.** Crop/rotate/scale/mirror/JPEG to defeat pHash. | None | Plagiarised asset not detected | Calibrated ensemble (D2); measured `P_d`; bond sized accordingly | **Yes** — probabilistic |
| **AT-19** | **Style mimicry.** LoRA/ControlNet derivative with different pixels. | Model access | Not detected by pHash | Out of scope; noted as D5 future work | **Yes** — accepted limitation |
| **AT-20** | **Sybil reporting.** Many addresses file reports against a rival. | Free addresses | Rival de-listed | `b_r > R`; reports need a valid similarity proof; losing report slashes bond | Partial — attacker pays linearly |
| **AT-21** | **Fingerprint spoofing.** Seller lists a fingerprint unrelated to the content. | Self-reported fingerprint | Evades plagiarism match | Bonded fingerprint; challenge reveals content and recomputes; slash on mismatch | Partial — needs a verifier |
| **AT-22** | **Sybil rating.** Seller buys own asset with sockpuppets. | Free addresses | Inflated reputation | Stake-weighted, commit-reveal, purchase-bound ratings; new identities have zero weight | Partial |
| **AT-23** | **Royalty evasion.** Child seller sets `r = 0`. | Child controls parameter | Parent unpaid | Parent sets `r` at authorisation; child cannot change it; `r` bounded | No |
| **AT-24** | **Royalty drain.** Parent sets `r > 1`. | Unbounded parameter | Escrow drained | `r ∈ [0, r_max]`, basis points, invariant test | No |

### 4.4 Infrastructure and privacy attacks

| ID | Attack | Precondition | Success criterion | Mitigation | Residual |
|---|---|---|---|---|---|
| **AT-25** | **IPFS unpinning.** Content disappears after sale. | No pinning incentive | Buyer cannot fetch | Pinning bond (Tier 3); buyer fetches before confirming; availability is a stated non-guarantee | **Yes** — stated |
| **AT-26** | **Gateway substitution.** Malicious gateway serves altered bytes. | Buyer uses untrusted gateway | Buyer accepts wrong content | Buyer checks `H(C) == hC`; content addressing | No |
| **AT-27** | **Front-end substitution.** Malicious UI swaps asset or address. | Compromised front-end | Buyer pays for wrong asset | Client-side verification of `hD`, `hC`, contract address; signed listings | Partial |
| **AT-28** | **Privacy harvesting.** Observer links purchases, revenue, fingerprints. | Public state | Deanonymisation | Commit-reveal ratings; avoid plaintext fingerprints where possible; note GDPR gap | **Yes** — stated |
| **AT-29** | **Cross-chain / cross-contract replay.** Reuse a signature on another deployment. | No domain separation | Unauthorised action | EIP-712 domain with `chainId` + `verifyingContract`; nonces; deadlines | No |
| **AT-30** | **Reentrancy on payout.** Malicious recipient re-enters. | External call before state update | Double withdrawal | Checks-effects-interactions; reentrancy guard; pull payments | No |

---

## 5. Explicit trust assumptions

The security claims hold only under these assumptions. They are numbered so the thesis can cite them.

| ID | Assumption | If violated |
|---|---|---|
| **TA1** | SHA-256 is collision-resistant | Commitments can be equivocated |
| **TA2** | HMAC-SHA256 is a pseudorandom function | Keystream predictable; content recoverable without `K` |
| **TA3** | ECIES over secp256k1 is IND-CCA secure (or IND-CPA + integrity) | Wrapped key recoverable |
| **TA4** | The EVM executes correctly; finalised state is not reorganised | Settlement can be reversed |
| **TA5** | The buyer controls its private key and verifies hashes locally | Buyer can be cheated by a substituted asset |
| **TA6** | `C` is retrievable during the delivery window | Buyer cannot verify; must dispute |
| **TA7** | Block timestamps are monotonic within a bounded tolerance | Timeouts can be gamed |
| **TA8** | For semantic disputes, at least one of: an honest watcher, or a bonded committee with public evidence | Semantic fraud goes unpunished |
| **TA9** | Adversaries are rational and risk-neutral for the economic claims | Bounded only by gas and bonds |
| **TA10** | The front-end is honest, or the user verifies commitments independently | Asset substitution |
| **TA11** | No collusion beyond the modelled pairs | Unmodelled coalitions may profit |
| **TA12** | `K` is unique per asset | Keystream reuse across assets leaks XOR of plaintexts |

---

## 6. Out of scope

- Legal enforceability of licence terms; copyright status of AIGC.
- Anonymity/unlinkability; GDPR compliance.
- Endpoint compromise, malware, screen capture (the analogue hole).
- Model/prompt/seed provenance (D5).
- Cross-chain bridges and fiat settlement.
- Long-term storage availability guarantees.
- MEV and transaction-ordering attacks beyond simple front-running.

---

## 7. Mapping to the base paper's claims

| Base paper claim | Location | Status under this threat model |
|---|---|---|
| No data leakage | §II-E2 | Holds in the honest path; **lost on dispute** (AT-14) |
| No data alteration | §II-E2 | Holds for integrity (AT-02 blocked); **not for semantic substitution** (AT-01) |
| No free-riding | §II-E3 | **False as published** (AT-04, and the seller-declared hash) |
| No false reporting | §II-E3 | Holds for integrity (AT-11 blocked); semantic false reports bounded by bond |
| Plagiarism-resistant | §II-D1 | **Not implemented** in the artifact; probabilistic at best (AT-18, AT-19) |
| No SPoF | §II-E6 | **False**: marketplace owner, IPFS gateways, RPC providers |
| Trust-free | Abstract | **False**: see TA1–TA12 |
| Economically disincentivised | §II-D4 | Replaced by explicit IC conditions; some attacks remain profitable (AT-01 with high `P_d` failure) |

---

## 8. Residual-risk statement (for the thesis)

MetaTrade-R closes the **integrity** gap and bounds the **semantic** gap. It does not close the semantic gap. A seller can still commit to a consistent but worthless file; the defence is a preview, a fingerprint, a bond, and reputation, all of which are probabilistic or economic. The thesis will report the measured detection probability `P_d` and the bond that `P_d` implies, rather than claiming plagiarism-proof operation. Confidentiality is preserved only on the honest path; a dispute publishes the content key. Both limitations are design choices, stated in advance, not discovered after the fact.
