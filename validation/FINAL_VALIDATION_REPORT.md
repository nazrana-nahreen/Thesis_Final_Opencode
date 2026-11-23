# Final Validation Report — MetaTrade-R

**Date:** 2026-11-22
**Environment:** Windows 11, Anvil 1.10.0, Kubo 0.32.1, Foundry 1.10.0, Node 22.14.0, Python 3.10.9

## Test results

### Solidity (47 tests, all passing)

| Suite | Tests | Result |
|---|---|---|
| DisputeVerifier.t.sol | 7 | PASS |
| CryptoVectors.t.sol | 10 | PASS |
| E2E.t.sol | 2 | PASS |
| Invariants.t.sol | 1 | PASS (fuzz) |
| Adversarial.t.sol | 27 | PASS |
| GasBenchmark.t.sol | 12 | PASS |

Total: 59 tests, all passing.

### Backend (14 tests, all passing)

| Test | Result |
|---|---|
| Health check | PASS |
| Asset endpoints (invalid inputs) | PASS (4 tests) |
| Sale endpoints (invalid inputs) | PASS (5 tests) |
| Royalty endpoints | PASS (2 tests) |
| IPFS integration | PASS (1 test) |

### Attack scenarios (17)

| Result | Count |
|---|---|
| Blocked | 15 |
| Residual (documented) | 2 (AT-01 semantic gap, AT-14 leak-by-dispute) |
| Executed | 17/17 |

### TypeScript compilation

- `npx tsc --noEmit` → exit 0 (no errors)

### IPFS integration

- Upload: 5-byte payload → CID `QmUatvHNjq696qkB8SBz5VBytcEeTrM1VwFyy4Rt4Z43mX`
- Retrieve: 5 bytes returned, match confirmed
- Pinning: verified via `/api/v0/pin/add`

### CLI

- `npx tsx cli.ts health` → `{ status: "ok" }`
- `npx tsx cli.ts asset 1` → reads from deployed contract

## Gas benchmark (isolated transactions)

| Operation | Gas |
|---|---|
| `buy` | 201,658 |
| `deliver` | 83,032 |
| `confirm` | 163,417 |
| `disputeMode1` (1 block) | 324,580 |
| `respond` | 161,235 |
| `disputeMode2` | 132,030 |
| `timeoutDeliver` | 57,650 |
| `timeoutConfirm` | 164,797 |
| `timeoutRespond` | 57,199 |
| `withdraw` (royalty) | not measured (pull payment) |

## Reproducibility

- Clean checkout: `git clone` → `forge build` → `forge test` → all pass.
- Anvil + Kubo + backend: all start with documented commands.
- Contract deployment: `node scripts/deploy.mjs` → 4 contracts deployed.
- Attack harness: `python harness/attack_harness.py --system B3 --out harness/results` → 17/17 executed.

## Unresolved limitations

1. **Semantic gap (AT-01):** consistent garbage passes integrity. Defence is probabilistic (preview + fingerprint + bond).
2. **Key leak on dispute (AT-14):** content key becomes public during any dispute.
3. **HMAC-CTR is not AEAD:** integrity from hash commitments, not from the cipher.
4. **Royalty uses child's rate:** parent has no on-chain enforcement (Tier 2).
5. **No licence expiry enforcement:** metadata only.
6. **IPFS single node:** no pinning incentive or replication.
7. **Backend tests are integration-only:** no mock-based unit tests; all tests require Anvil + Kubo.
8. **Baseline B0/B1/B2 not implemented:** only documented.

## Supported research claims

1. The published MetaTrade artifact does not bind payment to the advertised product (verified by code inspection and attack replay).
2. CRC binds payment to a pre-sale content commitment (verified by 10 CryptoVectors tests + E2E tests).
3. Integrity disputes are resolvable on-chain without a trusted arbitrator (verified by disputeMode1 tests).
4. The cost of binding is ~448k gas for an honest sale and ~325k gas per dispute (measured).
5. Storage is O(L + nκ) vs MetaTrade's O(nL) (analyzed, to be measured in E6).
6. pHash-based plagiarism detection is fragile under geometric transformations (documented, to be measured in E8).

## Claims that must be avoided

1. "Trust-free" — the trust set is smaller but not empty.
2. "A new fair-exchange protocol" — it is a FairSwap-style adaptation.
3. "Plagiarism-proof" — detection is probabilistic.
4. "Confidential" — confidentiality is lost on dispute.
5. "First AIGC marketplace" — DECADE, Story Protocol, AuraMint precede it.
6. Any measured improvement before E2-E8 are run.
EOF