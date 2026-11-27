# Base Paper Problems → MetaTrade-R Solutions

**Base paper:** V. T. Truong, H. D. Le, L. B. Le, "Trust-Free Blockchain Framework for AI-Generated Content Trading and Management in Metaverse," *IEEE Access*, vol. 12, pp. 41815–41828, 2024. DOI: 10.1109/ACCESS.2024.3376509

> **Status (2026-11-27).** Gas and test counts in this mapping use the measured build. The
> authoritative numbers and scope limits are in docs/MEASURED_RESULTS.md; the thesis draft is
> docs/THESIS_DRAFT.md.

**Sources:**
- Base-paper findings: `docs/base_paper_critical_review.md` (F1–F44)
- MetaTrade-R findings: `audit/FINAL_INDEPENDENT_AUDIT.md` (F-01–F-15)
- Implementation: `src/*.sol`, `crypto/*.ts`, `api/src/**`, `test/*.sol`, `harness/attack_harness.py`

**Legend — Confidence (base paper):** V = verified in text/code/arithmetic · I = inferred · S = suspected
**Legend — Status (solution):** ✅ Implemented · ◐ Partial · ✗ Not addressed · N/A = not applicable to our scope

---

## PART 1 — Problems identified in the base paper (44 findings)

### A. Conceptual / research-level

| ID | Problem | Evidence | Conf. |
|---|---|---|---|
| F1 | "Trust-free" is overclaimed — the trust set is not empty (consensus majority, non-Byzantine orderers, IPFS availability, DApp front-end, buyer endpoint, single-owner adjudicator) | Abstract vs §II-E6, `reportPlagiarism` owner-only | I |
| F2 | Fair-exchange literature entirely ignored — no FairSwap, OptiSwap, ZKCP, HTLC, timed commitment, dual-deposit escrow in refs [1]–[26] | Reference list scan | V |
| F3 | "First work" claim unsupported — no systematic comparison; FairSwap (2018) already provides formally secure fair exchange | p. 41818 | V |
| F4 | AIGC-specific properties not addressed — no model, prompt, seed, LoRA/ControlNet config, or dataset consent recorded | Fig. 3 vs contract fields | V |
| F5 | "Licence-based" is a misnomer — Eq. (1) has no scope, duration, territory, exclusivity, derivative rights, or revocation | Eq. (1) | V |

### B. Technical / algorithmic

| ID | Problem | Evidence | Conf. |
|---|---|---|---|
| **F6** | **Hash comparison does not bind payment to product identity** — `H = SHA(D_enc)` where `D_enc` is seller-produced; buyer compares against that same hash. Self-consistency, not commitment. pHash never used in settlement path | Algorithm 1 line 6, Algorithm 2 line 10, §II-E1 | **V** |
| F7 | Fabric version releases the content key **before payment** — `queryBuyReq` returns the request with no settlement-state gate | `DamChaincode/lib/digital_asset.js` → `queryBuyReq` | V |
| F8 | Consortium token permits **unlimited minting** — insufficient-balance check is commented out; `from`/`to` updated independently | `tokenERC20.js` → `_transfer` | V |
| F9 | `initialize()` can be called **repeatedly** — no `initializer` guard, no `owner == address(0)` check; anyone can replace owner, price, parent, commission | `DigitalAssetContract.initialize` | V |
| F10 | **De-listing has no effect** — `isAssetActive` is written but never read by the asset contract | `DamMartketplace` vs `DigitalAssetContract` | V |
| F11 | **Plagiarism mechanism not implemented** — `reportPlagiarism` takes one address (Eq. 2 has two), owner-only, no pHash comparison, no threshold, no reward, no ban; no pHash field anywhere | Both repos `grep pHash` → 0 hits | V |
| F12 | **No liveness/timeout** — no delivery or confirmation timeout; `cancelRequest` blocked after grant; seller can raise price after deposit → funds frozen | `cancelRequest`, `updatePrice` | V |
| F13 | **Payment accounting bugs** — overpayment trapped, prior refund wiped by `userFundWithdrawable = 0`, `.transfer` griefing, stray ETH to owner, listing fee unrecoverable | `registerRequest`, `compareHashes`, `withdrawFund`, `receive()` | V |
| F14 | **No per-buyer key wrapping** — fresh key + fresh encrypted copy per buyer → storage/bandwidth O(n·\|D\|) | Algorithm 1 | I |
| F15 | Plagiarism detection fragile and unevaluated — DCT-based 64-bit pHash, image-only, weak under rotation/crop/mirror; no threshold, FAR/FRR, ROC, or dataset | §II-D3 | V |
| F16 | **Royalty semantics contradict** — paper: parent owner sets rate; Ethereum: child sets it; Fabric: parent sets it unbounded | `listAsset` vs `compareHashes` | V |
| F17 | Inheritance is declarative, not verifiable — nothing proves the child derives from the parent | Design | V |
| F18 | Single-owner marketplace reintroduces SPoF — one EOA controls de-listing and adjudication | `contractOnwer` | V |
| F19 | IPFS **availability** assumed, not incentivised — no pinning bond, replication factor, retrieval proof, or Filecoin/Arweave integration | §II-E4 | V |
| F20 | Cryptographic notation wrong — `ECDSA_enc`/`ECDSA_dec`; ECDSA is a signature scheme, not encryption. No KEM/DEM, curve, AES mode, IV, or KDF specified | Algorithm 1/2; `scripts/secp256.js` | V |
| F21 | No **replay protection** — Eq. (1)–(3) carry `Sig` but no nonce, deadline, chain ID, contract binding, or EIP-712 domain | Eq. (1)–(3) | V |
| F22 | Unbounded on-chain data — `PDesc` and CID/key strings per customer with no length cap or CID validation | Contract storage | I |

### C. Mathematical / logical

| ID | Problem | Evidence | Conf. |
|---|---|---|---|
| F23 | **No mathematical model** — Eqs. (1)–(3) are transaction records; no fairness/liveness definition, adversary model, security game, proof, equilibrium, or complexity analysis | §II–III | V |
| F24 | "Similarity" and "threshold" undefined — "abnormally close", "predefined threshold" never quantified | pp. 41821–41822 | V |
| F25 | Economic claims asserted, not modelled — no cost/gain analysis, no bond sizing, no Sybil cost, no collision analysis | p. 41822 | V |
| F26 | Internal inconsistency in throughput — 1,500 / 1,200 / 1,300 / 1,200 TPS across abstract, §IV, Figs. 7–9 | pp. 41815–41826 | V |
| F27 | **Cost under-reporting 2.1×** — Table 2 sums to 250,633 gas but omits `initialize` (90,957), `listAsset` (159,133), `withdrawFund` (28,549); true ≈ 529,272 gas | Table 2, `gas-report.txt` | V |
| F28 | Gas arithmetic itself is consistent (not an arithmetic error — a scope error) | Recomputation | V |

### D. Experimental / evaluation

| ID | Problem | Evidence | Conf. |
|---|---|---|---|
| F29 | No baseline comparison with the closest related work — Table 2 compares against access-control frameworks, not DAM/trading systems | Table 2 | V |
| F30 | No ablation, no sensitivity analysis — no sweep on gas price, file size, buyer count, or threshold | §IV | V |
| F31 | No statistical rigour — single runs, no repetitions, no confidence intervals, no significance tests | §IV | V |
| F32 | Unrealistic consortium testbed — 100 peers / 50 orderers in Docker on one host, loopback traffic | p. 41824 | V |
| F33 | **Fabric results not reproducible** — published Caliper config runs one round of `listItem` only, 600 TPS, 5 s; does not exercise purchase/grant/compare | `caliper-benchmarks/.../DAM/config.yaml` | V |
| F34 | 50-orderer network not reproducible — compose file comments out orderers 31–50; `configtx.yaml` still says `OrdererType: solo` | `docker-compose-test-net.yaml` | V |
| F35 | **No plagiarism-detection experiment** — headline management contribution has zero quantitative evaluation | §II-D3 | V |
| F36 | No user study despite UI/UX claims — no SUS, task time, error rate, or participant count | §III-A2 | V |
| F37 | Artifacts not runnable as-is — deploy script passes constructor args to a contract with no constructor; marketplace never deployed; Hardhat targets Rinkeby/Kovan; tests nearly assertion-free; hard-coded private keys | `deploy/deploy.js`, `hardhat.config.js` | V |
| F38 | No datasets, seeds, or measurement scripts; no CI | Repo scan | V |

### E. Paper–code contradictions

| ID | Problem | Evidence | Conf. |
|---|---|---|---|
| F39 | **14-row claim-vs-code contradiction table** (storage privacy, key access, IPFS URI restriction, plagiarism reporting, Eq. (2)/(3) signatures, rating aggregation, ban rule, royalty ownership, Raft vs trust-free, O(1) cost, ECDSA_enc, plagiarism resistance, SPoF) | `docs/base_paper_critical_review.md` §F39 | V |

### F. Security / privacy / reliability

| ID | Problem | Evidence | Conf. |
|---|---|---|---|
| F40 | **Sybil resistance absent** — free addresses; bans, ratings, reports are per-address with no stake or proof-of-personhood | Design | V |
| F41 | Griefing cheap and asymmetric — buyer can register → get key → fail hash → refund, imposing IPFS + gas on seller | Design | I |
| F42 | Privacy leakage — purchase history, buyer addresses, revenue, and pHashes all public; GDPR undiscussed | Design | V |
| F43 | No key lifecycle — no rotation, revocation, recovery, or forward secrecy; endpoint compromise permanent | Design | V |
| F44 | Smart-contract hardening gaps — no reentrancy guard, `.transfer`, unbounded strings, no pull payment, no pause, no upgrade policy. *Explicitly not claimed as a proven reentrancy exploit* | Contracts | I |

---

## PART 2 — Solutions implemented in MetaTrade-R

| ID | Base problem | Solution | Implementation | Evidence | Status |
|---|---|---|---|---|---|
| S-01 | F6 | **Pre-sale cryptographic commitments** — `hD`, `hC`, `R_D`, `R_C`, `cK` registered before any buyer exists | `AssetRegistry.list` | `Adversarial.t.sol` | ✅ |
| S-02 | F6 | **On-chain chunk-consistency proof** — contract recomputes one block's keystream, XORs `C_i`, hashes, compares with committed Merkle path | `DisputeVerifier.checkConsistency`, `SaleEscrow.disputeMode1` | `DisputeVerifier.t.sol` (7 tests) | ✅ |
| S-03 | F7, F14 | **Per-buyer ECIES key wrapping** — encrypt once, wrap content key per buyer | `crypto/keywrap.ts` (`eciesjs`, secp256k1) | `keywrap.ts`, E2E | ✅ |
| S-04 | F7 | **Key delivered only after payment** — `deliver()` gated by `ESCROWED` state | `SaleEscrow.deliver` | `E2E.t.sol` | ✅ |
| S-05 | F8 | **ERC-1155 licence token with minter-only mint** | `LicenceToken.sol` | `Adversarial.t.sol` | ✅ |
| S-06 | F9 | **No `initialize()` at all** — constructor + immutable wiring | All 5 contracts | `Adversarial.t.sol` | ✅ |
| S-07 | F10 | **`isActive` enforced in `buy()` and `deliver()`** | `SaleEscrow.buy` | `Adversarial.t.sol` | ✅ |
| S-08 | F12 | **Three permissionless timeouts** — `timeoutDeliver`, `timeoutConfirm`, `timeoutRespond` | `SaleEscrow.sol` | `E2E.t.sol`, `Adversarial.t.sol` | ✅ |
| S-09 | F13 | **Exact payment + per-sale escrow + pull payment** — `msg.value == price + BUYER_BOND`; no shared mutable balance; `call{value:}` not `.transfer` | `SaleEscrow.buy`, `_pay`, `RoyaltySplitter` | `Adversarial.t.sol`, `Invariants.t.sol` | ✅ |
| S-10 | F16 | **Royalty capped at 5000 bps**; child-set rate documented as limitation (not parent-authorised) | `AssetRegistry.list`, `SaleEscrow._settle` | `Adversarial.t.sol` | ◐ |
| S-11 | F20 | **Correct ECIES naming and construction** — secp256k1, not "ECDSA_enc" | `crypto/keywrap.ts` | `keywrap.ts` | ✅ |
| S-12 | F27 | **Full honest-cycle gas measurement reported** - 456,691 gas (30-run mean), not a partial sum | experiments/run_chain_experiments.mjs | experiments/results/chain/ | OK |
| S-13 | F2, F3 | **Fair-exchange literature integrated** — CRC positioned as FairSwap-inspired adaptation, not a new protocol | `docs/LITERATURE_REVIEW.md`, paper §II-D | Literature review PDF | ✅ |
| S-14 | F1 | **Explicit trust set TA1–TA12** — "trust-free" claim withdrawn and replaced by enumerated assumptions | `docs/THREAT_MODEL.md` | Paper §III-D | ✅ |
| S-15 | F23 | **Adversary model + security objectives + proof sketches** — no formal verification claimed | `docs/THREAT_MODEL.md`, `docs/MATHEMATICAL_FORMULATION.md` | — | ◐ |
| S-16 | F25 | **Bond-sizing incentive-compatibility model** — `b_s > ((1−P_d)/P_d)·p` with stated assumptions | `docs/MATHEMATICAL_FORMULATION.md` §10 | — | ◐ |
| S-17 | F29, F31 | **Executable attack harness** — 18 scenarios (AT-01..17 + AT-30), 15 blocked, 1 mitigated, 2 documented residual | `harness/attack_harness.py` | `harness/results/` | ◐ |
| S-18 | F31 | **Cryptographic test vectors** — RFC 4231 HMAC-SHA256 (cases 1–4), NIST SHA-256, Merkle index binding | `CryptoVectors.t.sol` (10 tests) | `forge test` | ◐ |
| S-19 | F6, F11 | **Integrity vs semantic correctness separated** — integrity cryptographic, no trusted arbitrator; semantic probabilistic (preview + pHash signal + bond) | Paper §XI-E, `docs/THREAT_MODEL.md` | — | ✅ (conceptual) |
| S-20 | F22 | **Fixed-size commitments on-chain** — only hashes, roots, and CIDs on-chain; no unbounded content | `AssetRegistry` struct | — | ✅ |
| S-21 | F37, F38 | **Reproducibility package** — pinned versions, `REPRODUCE.sh`, `.env.example`, deploy script, seedless deterministic tests | `REPRODUCE.sh` | — | ◐ |

---

## PART 3 — Base-paper problems that MetaTrade-R does **not** solve

These must be stated honestly in the thesis; they are scope boundaries, not oversights.

| Base ID | Unaddressed problem | Reason |
|---|---|---|
| F4 | AIGC metadata (model, prompt, seed, LoRA) not recorded | Out of Tier-1 scope |
| F5 | Licence scope/duration/territory not enforceable | Metadata only; legal enforceability out of scope |
| F11 | No `PlagiarismRegistry` / bonded reporting | Tier 2, not implemented |
| F15, F24, F35 | pHash robustness, threshold calibration, detection experiment | Tier 2; pHash used only as a similarity signal |
| F17 | Inheritance not cryptographically verifiable | Open problem |
| F18 | Single backend operator remains a SPoF | No DAO/multisig deployment |
| F19 | IPFS availability not incentivised | No pinning bond / Filecoin integration |
| F21 | No EIP-712 signature scheme (msg.sender only, so no replay surface) | Different design; no signed intents |
| F29, F30 | No B1/B2 baselines, no ablation | Not implemented |
| F36 | No user study | Out of scope |
| F40, F41, F42, F43 | Sybil resistance, griefing economics, privacy leakage, key lifecycle | Partially mitigated (buyer bond), otherwise open |

---

## PART 4 — Residual limitations inside MetaTrade-R itself

From `audit/FINAL_INDEPENDENT_AUDIT.md` (15 findings: 0 critical, 2 high, 4 medium, 5 low, 3 info).

| ID | Limitation | Severity |
|---|---|---|
| F-01 | HMAC-CTR provides confidentiality only, **not AEAD** | High (design) |
| F-02 | **Semantic gap (AT-01)** — seller can commit to garbage consistently | High (design) |
| F-03 | **Key leaked on dispute (AT-14)** — `K` visible in calldata | Medium (accepted) |
| F-04 | Buyer bond forfeited in consistent dispute — verified *correct* by design | Medium |
| F-05 | Royalty uses child's stored rate, not parent's authorised rate | Medium |
| F-06 | No on-chain licence expiry enforcement | Low |
| F-07 | `deactivate` seller-only; no plagiarism-driven deactivation | Low |
| F-08 | HMAC key > 32 bytes not hashed (RFC 2104 §2 non-compliance for long keys) | Low |
| F-09 | `checkConsistency` is `view` while calling `pure` — informational only | Info |
| F-10 | Exact payment check — verified correct | Info |
| F-11 | `block.timestamp` used for 1–2 day windows | Low |
| F-12 | Permissionless timeouts — intentional, correct for liveness | Info |
| F-13 | `respond` rejects a key not matching `cK` — verified correct | Medium→OK |
| F-14 | Backend does not verify buyer's off-chain hash check | Low |
| F-15 | Single Kubo node is an IPFS SPoF | Low |

---

## One-line summary

**Base paper:** 44 findings — the core one being that payment is bound to a seller-declared hash of the seller's own ciphertext (F6), plus key-before-payment (F7), unlimited minting (F8), re-callable initialisation (F9), unimplemented plagiarism (F11), no timeouts (F12), and 2.1× cost under-reporting (F27).

**MetaTrade-R:** 21 solution items — 12 fully implemented, 8 partial, 1 conceptual. The integrity property is cryptographic and decided without a trusted arbitrator; semantic correctness remains probabilistic and is documented as residual risk AT-01, alongside dispute-path key disclosure AT-14.
