# Audit of the Base Paper's Ethereum Implementation (B0)

**Source:** `MetaTrade-Ethereum-main/MetaTrade-Ethereum-main/` (public repository, cloned locally).
**Scope:** `contracts/DigitalAssetContract.sol` (159 lines), `contracts/dam-marketplace.sol`, `deploy/deploy.js`, `test/`, `gas-report.txt`.
**Method:** manual review + static analysis + attack replay. Each finding cites file and line.

---

## A. Findings (Ethereum)

### A1. Settlement hash is seller-declared (the decisive flaw)

- `DigitalAssetContract.sol:58-77` `grantAccess`: stores `encryptedFileHash` supplied by the owner.
- `DigitalAssetContract.sol:79-91` `compareHashes`: compares the buyer's hash against `customerAddrToData[msg.sender].encryptedFileHash`.
- `DigitalAssetContract.sol:10-11`: `customerAddrToData` is `private` but the mapping is readable on-chain (storage is public); only the getter is gated.
- **Consequence:** a seller uploads arbitrary bytes `G`, publishes `H(G)`, and `compareHashes` matches. Payment releases. The buyer decrypts garbage.
- **Paper claim contradicted:** §II-E1 ("If there are issues leading to an incorrect data downloaded by the customer, the hash_c will be completely different") is logically false.

### A2. `initialize()` is re-callable

- `DigitalAssetContract.sol:29-39`: no `initializer` guard, no `require(owner == address(0))`.
- **Attack:** anyone re-initialises a clone, seizes `owner`, rewrites `digitalAssetPrice`, `parentAsset`, `commissionRate`. Pending deposits can be frozen or redirected.
- **Severity:** critical.

### A3. De-listing is ineffective

- `dam-marketplace.sol`: `isAssetActive` is written by `cancelListing`/`reportPlagiarism` but is **never read** by `DigitalAssetContract`. A de-listed or plagiarism-flagged asset still accepts `registerRequest` and `grantAccess`.

### A4. Payment accounting

- `DigitalAssetContract.sol:45-56` `registerRequest`: accepts `msg.value >= price` but credits only `digitalAssetPrice` implicitly (stores `msg.value` in `userFund`); the excess is recoverable only via `withdrawFund`, but `compareHashes` on success zeroes `userFundWithdrawable[msg.sender]` (line 97), destroying prior refunds.
- `DigitalAssetContract.sol:79-91` `compareHashes`: on success, `userFundWithdrawable[msg.sender] = 0` (line 97) wipes any pending refund.
- `DigitalAssetContract.sol:95` `commissionFee = (commissionRate * digitalAssetPrice) / 10**18`: assumes 18-decimal `commissionRate`; the paper gives no scaling, so a rate of `0.1` yields `0`.
- `DigitalAssetContract.sol:127-133` `withdrawFund`: uses `.transfer` (2300 gas) — breaks smart-contract wallets.
- `DigitalAssetContract.sol:106-108` `receive()`: credits the owner for stray ETH.
- `dam-marketplace.sol`: `listingFee` is collected but has no withdrawal path — locked forever.

### A5. Royalty semantics

- `DigitalAssetContract.sol:29-39` `initialize`: the child passes `_commissionRate`. The parent has no say.
- Paper §II-D3: "This proportion is decided by the owner of the parent AIGC contract."
- **Contradiction:** the two disagree. A plagiarist can set `commissionRate = 0`.

### A6. Privacy claims

- `DigitalAssetContract.sol:122-125` `getIpfsURI(address)`: unrestricted. Paper: "only … accessible by the associated customer."
- `DigitalAssetContract.sol:110-113` `getEncryptedSymmetricKey`: requires `userComparedHashes[msg.sender]`. Paper: "Other users can also obtain the signed key." — contradicts the code.
- Ethereum storage is world-readable; "private state" does not exist on Ethereum.

### A7. Plagiarism and rating

- `dam-marketplace.sol` `reportPlagiarism(DigitalAssetContract)`: owner-only, takes one address (Eq. 2 specifies two), no pHash comparison, no threshold, no reward, no ban.
- `dam-marketplace.sol` `rateAsset(asset, uint8 star)`: no `pHash_c`, no signature, overwrites, no aggregation. Eq. 3's `pHash_c` is absent. No "overall rating", no seller reputation.
- The claimed "2 consecutive failures → permanent ban" and "2 false reports → ban" are absent.

### A8. Liveness

- `DigitalAssetContract.sol:41-43` `updatePrice`: callable any time by the owner. After a deposit, a price increase makes `compareHashes` fail (line 93) and `cancelRequest` is blocked (line 136 requires empty `ipfsURI`).
- No timeout on delivery or confirmation.

### A9. Gas under-reporting

- `gas-report.txt` and Table 2's 250,633 gas = 59,082 (`registerRequest`) + 101,676 (`grantAccess`) + 89,875 (`compareHashes`), exactly.
- Excluded: `initialize` (90,957), `listAsset` (159,133), `withdrawFund` (28,549).
- True single-sale cost ≈ 529,272 gas ≈ $10.03 vs reported $4.74 (2.1×).
- **Arithmetic check:** 89,875 × 10⁻⁸ ETH × $1,894.65 ≈ $1.70. The arithmetic is correct; the *scope* is not.

### A10. Artifacts not runnable

- `deploy/deploy.js`: passes constructor args to a contract with **no constructor** (it uses `initialize`).
- Only `DigitalAssetContract` is deployed; the marketplace is not.
- `hardhat.config.js`: targets Rinkeby/Kovan (both shut down) and mainnet; no Sepolia.
- Tests are near-empty `it("")` blocks with no negative cases.
- Hard-coded private key in `scripts/secp256.js` and `scripts/getPubKey.js`.
- No repository-level `LICENSE`.

### A11. Cryptographic notation

- Algorithms 1 and 2 use `ECDSA_enc`/`ECDSA_dec`. ECDSA is a signature scheme, not encryption. The repo uses secp256k1 + `eth-crypto` (ECIES-style).
- No KEM/DEM, curve, AES mode, IV/nonce, or KDF is specified.
- Eqs. (1)–(3) carry `Sig` with no nonce, deadline, chain ID, or EIP-712 domain; no signature is verified on-chain.

### A12. Unbounded on-chain data

- `PDesc` and the IPFS URI/hash/key are unbounded strings stored per customer. No length cap, no CID validation.

---

## B. Fabric findings (from the published repository)

See `base_paper_critical_review.md` for full detail. Summary:

| ID | Finding | File/function |
|---|---|---|
| B1 | Key readable before payment | `DamChaincode/lib/digital_asset.js` `queryBuyReq` |
| B2 | Unlimited token minting (check commented out) | `tokenERC20.js` `_transfer` |
| B3 | Root-asset failure (`queryItem("")`) | `digital_asset.js` `compareHashes` |
| B4 | Item overwrite (no uniqueness check) | `digital_asset.js` `listItem` |
| B5 | No plagiarism function | absent |
| B6 | No royalty bounds | `digital_asset.js` `compareHashes` |
| B7 | Caliper config runs `listItem` only (600 TPS, 5 s) | `caliper-benchmarks/.../DAM/config.yaml` |
| B8 | 50 orderers not reproducible (31–50 commented) | `docker-compose-test-net.yaml` |
| B9 | `configtx.yaml` says `solo` | root + `config-bft/configtx.yaml` |

**Caveat:** these findings come from the published repository, which may not be the exact artifact used for the paper. That uncertainty is itself a reproducibility finding.

---

## C. Attack replay plan (M1)

| Attack | Target | Expected outcome on B0 |
|---|---|---|
| AT-01 consistent garbage | B0 | succeeds (hashes match) |
| AT-02 inconsistent commitment | B0 | succeeds (no binding) |
| AT-03 wrong key | B0 | succeeds (buyer can't prove) |
| AT-04 key before payment | B0 (Fabric) | succeeds |
| AT-05 re-initialise | B0 | succeeds |
| AT-06 price change | B0 | succeeds (funds frozen) |
| AT-07 de-listed trading | B0 | succeeds |
| AT-08 overpayment | B0 | succeeds (stranded) |
| AT-09 refund wipe | B0 | succeeds |
| AT-10 `.transfer` grief | B0 | succeeds (if seller is a contract) |
| AT-11 false dispute | B0 | partial (no on-chain truth) |
| AT-12 fabricated proof | B0 | n/a (no proof mechanism) |

**Exit criterion (M1):** ≥ 6 of AT-01…AT-12 succeed on B0, each with a reproducible script and a log. Gas figures match `gas-report.txt` within measurement error.

---

## D. Evidence index (paper → finding)

| Paper location | Finding |
|---|---|
| Abstract, p. 41815 | trust-free claim |
| §II-C3, p. 41820 | "incorrect data → completely different hash" (false) |
| §II-D1, p. 41821 | proof-of-plagiarism (unimplemented) |
| §II-D2, p. 41821 | rating/reputation (unimplemented) |
| §II-D3, p. 41822 | parent-set royalty (contradicted) |
| §II-D4, p. 41822 | economic model (asserted) |
| §II-E1, p. 41822 | hash comparison as alteration protection (false) |
| §II-E2, p. 41822 | leakage resistance (key gating contradicts) |
| §II-E4, p. 41823 | IPFS immutability (confuses availability) |
| §II-E6, p. 41823 | SPoF eliminated (single owner) |
| §III-A1, p. 41824 | Raft, 50% CFT |
| Table 1, p. 41818 | self-assessed checkmarks |
| Table 2, p. 41824 | cost (under-reported) |
| Fig. 3, p. 41823 | SD/LoRA/ControlNet (AIGC-specific, unused) |
| §IV, p. 41826 | "limited at around 1,200 TPS" |

---

## E. What the audit does NOT claim

- It does not claim the paper's authors acted in bad faith. It reports what the published artifact does.
- It does not claim the arithmetic is wrong (it is correct; the scope is incomplete).
- It does not claim the Fabric findings apply to the paper's exact artifact (they may not; that is the reproducibility finding).
- It does not claim a mathematical error in the paper (there is no mathematics to err).
