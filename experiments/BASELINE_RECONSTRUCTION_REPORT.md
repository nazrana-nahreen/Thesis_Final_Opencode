# Baseline Reconstruction Report — MetaTrade-R

## B0: Original MetaTrade

**Source:** Truong, Le & Le, "Trust-Free Blockchain Framework for AI-Generated Content Trading and Management in Metaverse," IEEE Access, vol. 12, 2024, pp. 41815–41828. DOI 10.1109/ACCESS.2024.3376509.

**Published implementation:** `github.com/duyhung2201/MetaTrade-Ethereum` (Solidity) and `github.com/duyhung2201/MetaTrade-Consortium` (Fabric).

**Reconstruction status:** Partially reproducible.

### What can be reconstructed (Ethereum path)
- Contracts: `DigitalAssetContract.sol`, `dam-marketplace.sol` (read from the published repo).
- Gas figures: reproducible from `gas-report.txt` (verified: 89,875 × 10⁻⁸ ETH × $1,894.65 ≈ $1.70).
- Attack scenarios: AT-01 (consistent garbage) and AT-02 (inconsistent commitment) can be replayed against the published contracts.

### What cannot be faithfully reconstructed
1. **Deployment script is broken:** `deploy/deploy.js` passes constructor args to a contract with no constructor (uses `initialize`). The marketplace is never deployed.
2. **Testnets are dead:** `hardhat.config.js` targets Rinkeby/Kovan (both shut down).
3. **Tests are near-empty:** single `it("")` blocks with almost no assertions.
4. **Fabric results are not reproducible:** Caliper config runs `listItem` only (600 TPS, 5 s), not the purchase/grant/compare flow. The 50-orderer compose file has orderers 31–50 commented out. `configtx.yaml` says `solo`.
5. **Plagiarism mechanism is not implemented:** `reportPlagiarism` is owner-only, takes one address, no pHash comparison. Neither codebase contains a pHash field.
6. **Rating/reputation is not implemented:** `rateAsset` stores a star with no aggregation.
7. **Banning is not implemented:** no counter, no ban.

### Reconstruction assumptions for comparison
- B0 is represented by the **published Ethereum contracts** deployed on a local Anvil chain (with a fixed deploy script).
- Only the Ethereum path is compared; Fabric is excluded.
- The comparison is on settlement integrity, gas, and attack success — not on plagiarism or reputation (which B0 does not implement).
- B0's "cost" is the published 250,633 gas (register + grant + compare), excluding `initialize`, `listAsset`, and `withdrawFund`. The thesis also reports the full cost (529,272 gas) for fairness.

### Differences affecting fairness
- B0's gas is under-reported (2.1×). The thesis reports both figures.
- B0's "security" is a prose checklist, not tested. The thesis tests it.
- B0 does not implement its own claimed features (plagiarism, rating, banning). The thesis does not claim to improve on unimplemented features.

## B1: Naive escrow baseline

**Definition:** Buyer pays; seller delivers; no verification; refund only if seller volunteers.

**Implementation:** A minimal contract (`NaiveEscrow.sol`) with `buy`, `deliver`, `confirm` (no hash check), and `refund` (seller-initiated). No bonds, no timeouts, no dispute.

**Purpose:** Lower bound on cost. Shows what "no verification" buys.

**Assumptions:** Seller is trusted to deliver; buyer is trusted to confirm. No adversarial behaviour is prevented.

## B2: FairSwap-style baseline

**Definition:** Public key reveal at settlement. Seller encrypts file with key k, commits to ciphertext. Buyer pays into escrow. Seller reveals k on-chain. Buyer decrypts and checks. If wrong, buyer proves misbehaviour by revealing a block.

**Implementation:** Adapted from FairSwap (Dziembowski et al., CCS 2018). Key is revealed publicly at settlement. No per-buyer confidentiality. Single-block verification via HMAC-CTR (same cipher as B3 for comparability).

**Purpose:** Closest fair-exchange baseline. Shows the cost of public key reveal vs. per-buyer wrapping.

**Assumptions:**
- The buyer and seller agree on `h(D)` out of band (as in FairSwap).
- Key is revealed on-chain (content becomes public after every sale).
- No license, royalty, or plagiarism layer.
- Implemented only for single buyer, single file.

**Differences affecting fairness:**
- B2 has no confidentiality in the honest path (key is public). B3 preserves confidentiality.
- B2's dispute requires the buyer to reveal the key publicly (leaking content). B3's Mode 1 also leaks K, but only on dispute.
- B2 is a fair-exchange primitive; B3 adds AIGC-license semantics.

## B3: MetaTrade-R

**Definition:** CRC settlement with per-buyer key wrapping, two-mode dispute, royalty split, and bonded plagiarism reporting.

**Implementation:** The full Tier-1 system (5 contracts + off-chain stack).

**Assumptions:**
- HMAC-SHA256 is a PRF (A3).
- SHA-256 is collision-resistant (A1).
- ECIES over secp256k1 is IND-CCA (A4).
- Keys are unique per asset (A5).

## Comparison fairness statement

1. B0's gas is reported both as published (250,633) and as corrected (529,272). The thesis uses the corrected figure for comparison.
2. B1 has no security; it is a cost floor.
3. B2 and B3 use the same cipher (HMAC-CTR) and the same block size (1 KB) for comparability. The only difference is key delivery (public vs. per-buyer) and dispute mode.
4. B0's "security" is a prose checklist, not tested. The thesis tests B0's attacks (AT-01..AT-12) and reports success rates.
5. B0's Fabric results are excluded (not reproducible).

## What cannot be compared

- Plagiarism detection: B0 does not implement it. No comparison possible.
- Rating/reputation: B0 does not implement it.
- Banning: B0 does not implement it.
- Licence semantics: B0 has none.
- Multi-buyer cost: B0 re-encrypts per buyer; B3 encrypts once. The comparison is at n=1 for gas and n>1 for storage.

## Baseline code status

| Baseline | Code location | Status |
|---|---|---|
| B0 | `b0-ethereum/` (cloned repo) | Reconstructed with fixed deploy script |
| B1 | Not yet implemented | Tier 2 task |
| B2 | Not yet implemented | Tier 2 task |
| B3 | `metatrade-r/` | Complete (Tier 1) |

B1 and B2 are documented but not yet coded. They are needed for the experimental comparison (E2-E6) but are not blocking for the thesis core.
EOF