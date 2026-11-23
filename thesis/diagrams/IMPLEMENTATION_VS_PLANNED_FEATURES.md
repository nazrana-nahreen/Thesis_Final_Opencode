# Implementation vs. Planned Features — MetaTrade-R

## Implemented (shown in diagrams as solid)

| Feature | Diagram | Implementation |
|---|---|---|
| Asset registration with commitments | D1, D4, D5, D13 | `AssetRegistry.list()` |
| Sale escrow with bonds | D1, D4, D5, D12 | `SaleEscrow.buy()` |
| Delivery with key wrapping | D1, D5, D7, D8, D11 | `SaleEscrow.deliver()` |
| Buyer confirmation | D5, D7 | `SaleEscrow.confirm()` |
| Integrity dispute (Mode 1) | D5, D9, D17, D18 | `SaleEscrow.disputeMode1()`, `DisputeVerifier.checkConsistency()` |
| Non-delivery dispute (Mode 2) | D5, D10 | `SaleEscrow.disputeMode2()`, `respond()`, `timeoutRespond()` |
| Timeouts (3 types) | D5, D10, D12 | `timeoutDeliver()`, `timeoutConfirm()`, `timeoutRespond()` |
| Royalty distribution | D5, D14 | `RoyaltySplitter.credit()`, `withdraw()` |
| Licence minting | D5, D6 | `LicenceToken.mint()` |
| HMAC-CTR encryption | D8, D11 | `crypto/encrypt.ts`, `DisputeVerifier.hmacSha256()` |
| Merkle commitments | D8, D13 | `crypto/crypto.ts` (merkleRoot, merkleProof) |
| ECIES key wrapping | D8, D11 | `crypto/keywrap.ts` (eciesjs) |
| IPFS upload/retrieve | D1, D3, D8, D15 | `api/src/ipfs.ts` |
| Fastify backend (16 endpoints) | D1, D2, D15 | `api/src/server.ts`, `api/src/routes/*.ts` |
| Event watcher | D1, D15 | `watcher/watcher.ts` |
| Attack harness (17 scenarios) | D17, D18 | `harness/attack_harness.py` |
| Gas benchmarking | D19 | `test/GasBenchmark.t.sol` |
| Experimental evaluation | D20 | `EXPERIMENTAL_METHODOLOGY.md` |
| Security threat model | D16 | `THREAT_MODEL.md` |
| CLI | D1, D3 | `cli.ts` |

## Planned but NOT implemented (excluded from diagrams)

| Feature | Status | Tier | Reason |
|---|---|---|---|
| Next.js web UI | Not implemented | Tier 3 | CLI is sufficient for demonstration |
| PlagiarismRegistry contract | Not implemented | Tier 2 | Tier 1 focuses on settlement integrity |
| Reputation contract | Not implemented | Tier 2 | Tier 2 task |
| StorageBond contract | Not implemented | Tier 3 | Optional pinning incentive |
| Semantic dispute oracle | Not implemented | Tier 3 | Subjective resolution requires committee |
| Baselines B0-B2 (executable) | Not implemented | Tier 2 | Only documented, not coded |
| L2 deployment | Not implemented | Tier 3 | Cost comparison only |
| Style embedding detection | Not implemented | Tier 3 | D5 future work |
| Licence expiry enforcement | Not implemented | Out of scope | Legal enforceability out of scope |
| Multi-parent royalty DAGs | Not implemented | Out of scope | Complexity |
| Cross-chain settlement | Not implemented | Out of scope | Out of scope |
| Formal verification | Not implemented | Out of scope | Proof sketches only |

## Diagram accuracy notes

1. All 20 diagrams represent implemented features only.
2. Planned features are excluded from the architecture diagrams.
3. Residual risks (AT-01, AT-14) are marked with amber/red in the diagrams.
4. No diagram claims formal verification, AEAD, or complete confidentiality.
5. The state machine (D12) matches the actual Solidity enum exactly.
6. The sequence diagrams (D7, D9, D10) match the actual function call order in the contracts.
7. The gas benchmarking diagram (D19) shows measured values, not estimates.
EOF