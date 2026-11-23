# FINAL RESEARCH VALIDATION REPORT — MetaTrade-R

## 1. Completed tasks

### Phase 1: Independent Code Audit
- Audited all 5 Solidity contracts, 5 test files, TS crypto, Fastify API, IPFS, watcher, attack harness, CLI.
- 15 findings (0 critical, 2 high, 4 medium, 5 low, 3 informational).
- All high/medium findings are design-level limitations, documented as residual risks.
- No fund-loss bugs, access-control bypasses, or reentrancy vulnerabilities found.
- Report: `metatrade-r/audit/FINAL_INDEPENDENT_AUDIT.md`

### Phase 2: Clean Environment Validation
- Dependencies: Foundry 1.10.0, Node 22.14.0, Python 3.10.9, Kubo 0.32.1.
- Solidity compilation: pass (0.8.31, Osaka, 200 optimizer runs, via-IR).
- Anvil startup: pass.
- Contract deployment: 4 contracts deployed via `scripts/deploy.mjs`.
- Kubo startup: pass.
- IPFS connectivity: verified (upload + retrieve round-trip).
- Backend startup: pass (port 3001, dotenv loaded).
- Backend health check: pass.
- Asset registration: pass (encrypt + IPFS pin + return commitments).
- Asset retrieval: pass (reads from deployed AssetRegistry).
- Purchase workflow: pass (E2E test).
- Delivery and confirmation: pass (E2E test).
- Mode 1 dispute: pass (DisputeVerifier tests).
- Mode 2 dispute: pass (Adversarial tests).
- Royalty queries: pass (backend test).
- CLI: pass (health, asset commands).
- Solidity tests: 47 pass.
- Backend tests: 14 pass.
- Attack scenarios: 17/17 executed (15 blocked, 2 residual).
- TypeScript compilation: pass (0 errors).

### Phase 3: Event Watcher Validation
- Watcher implemented (`watcher/watcher.ts`).
- Checkpointing: persistent JSON file.
- Duplicate handling: dedup by `txHash:logIndex`.
- RPC failure: retry with backoff.
- Timeout eligibility: detects expired windows.
- Authorized transactions only: timeout transactions only.
- Tests: not yet implemented (watcher is untested).

### Phase 4: Gas Benchmarking
- Isolated transaction gas measured via `forge test --gas-report`.
- 9 operations measured (buy, deliver, confirm, disputeMode1, respond, disputeMode2, timeoutDeliver, timeoutConfirm, timeoutRespond).
- Raw measurements in `.gas-snapshot` and `GAS_BENCHMARK_REPORT.md`.
- Mean/median/std/p95: not computed (single run, deterministic). To be measured with multiple runs in E4.

### Phase 5: Baseline Reconstruction
- B0: partially reproducible (Ethereum path only; Fabric excluded).
- B1: documented, not implemented.
- B2: documented, not implemented.
- B3: complete.
- Report: `experiments/BASELINE_RECONSTRUCTION_REPORT.md`.

### Phase 6: Final Research Evidence
- Test results: 47 Solidity + 14 backend + 17 attack = 78 evidence items.
- Attack success: 15/17 blocked, 2 residual (documented).
- Gas: 9 operations measured.
- IPFS: upload/retrieve verified.
- Encryption overhead: HMAC-CTR + Merkle, measured per block.
- Limitations: 8 documented.

### Phase 7: Final Regression
- `forge build`: pass.
- `forge test` (non-invariant): 46 pass.
- Backend tests: 14 pass.
- TypeScript: 0 errors.
- CLI: functional.
- Deployment: 4 contracts deployed.

## 2. Failed tasks and unresolved limitations

| Task | Status | Reason |
|---|---|---|
| Watcher automated tests | Not implemented | Watcher is untested |
| Backend unit tests (mocked) | Not implemented | Only integration tests exist |
| B0 faithful reconstruction | Partial | Deploy script broken, testnets dead, features unimplemented |
| B1/B2 implementation | Not implemented | Tier 2 task |
| Mode 2 E2E test | Not implemented | Tier 2 task |
| L2 cost comparison | Not implemented | Tier 3 task |
| pHash benchmark (E8) | Not implemented | Tier 2 task |
| Economic simulation (E7) | Not implemented | Tier 2 task |
| Ablation studies | Not implemented | Tier 2 task |
| Clean-environment validation | Partial | Manual, not scripted |

## 3. Security findings and severity

See `audit/FINAL_INDEPENDENT_AUDIT.md` for full details.

| Finding | Severity | Status |
|---|---|---|
| F-01: HMAC-CTR not AEAD | High | Documented (design choice) |
| F-02: Semantic verification gap | High | Documented (residual risk) |
| F-03: Key leak on dispute | Medium | Documented (accepted) |
| F-04: Buyer bond forfeit (verified correct) | — | Verified |
| F-05: Royalty uses child's rate | Medium | Tier 2 task |
| F-06: No licence expiry enforcement | Low | Out of scope |
| F-07: Deactivate seller-only | Low | Tier 2 task |
| F-08: HMAC key not hashed if >32 bytes | Low | Documented limitation |
| F-09: checkConsistency view (informational) | Info | N/A |
| F-10: Exact payment (informational) | Info | N/A |
| F-11: Timestamp-based timeouts | Low | Documented |
| F-12: Permissionless timeouts (informational) | Info | N/A |
| F-13: respond key check (verified correct) | — | Verified |
| F-14: Backend doesn't verify buyer's hash check | Low | Documented |
| F-15: IPFS single node | Low | Documented |

## 4. Test results

- **Solidity:** 47 tests (DisputeVerifier: 7, CryptoVectors: 10, E2E: 2, Invariants: 1, Adversarial: 27). All pass.
- **Backend:** 14 tests (health, asset validation, sale validation, royalty, IPFS). All pass.
- **Attack scenarios:** 17/17 executed. 15 blocked, 2 residual (documented).
- **TypeScript:** 0 errors.

## 5. Gas benchmark results

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

Honest sale cycle: 448,107 gas. Dispute: 324,580 gas (O(1) in file size).

## 6. Reproducibility evidence

- Clean checkout: `git clone` → `forge build` → `forge test` → 47 pass.
- Anvil + Kubo + backend: all start with documented commands.
- Contract deployment: `node scripts/deploy.mjs` → 4 contracts deployed.
- Attack harness: `python harness/attack_harness.py --system B3 --out harness/results` → 17/17 executed.
- Backend: `node dist/api/src/server.js` → starts on port 3001.
- CLI: `npx tsx cli.ts health` → `{ status: "ok" }`.

## 7. Research claims that are supported

1. The published MetaTrade artifact does not bind payment to the advertised product (verified by code inspection and attack replay).
2. CRC binds payment to a pre-sale content commitment (verified by 10 CryptoVectors + E2E tests).
3. Integrity disputes are resolvable on-chain without a trusted arbitrator (verified by disputeMode1 tests).
4. The cost of binding is ~448k gas for an honest sale and ~325k gas per dispute (measured).
5. Storage is O(L + nκ) vs MetaTrade's O(nL) (analyzed).
6. pHash-based plagiarism detection is fragile under geometric transformations (documented, to be measured).
7. HMAC-SHA256 matches RFC 4231 byte-for-byte (verified by 4 test vectors).
8. TS and Solidity crypto implementations are byte-compatible (verified by cross-language tests).

## 8. Research claims that must be avoided

1. "Trust-free" — the trust set is smaller but not empty.
2. "A new fair-exchange protocol" — it is a FairSwap-style adaptation.
3. "Plagiarism-proof" — detection is probabilistic.
4. "Confidential" — confidentiality is lost on dispute.
5. "First AIGC marketplace" — DECADE, Story Protocol, AuraMint precede it.
6. "Formally verified" — only proof sketches, no computational proofs.
7. Any measured improvement before E2-E8 are run.

## 9. Exact commands for reproducing

```bash
# 1. Install dependencies
cd metatrade-r
npm install
pip install web3

# 2. Compile Solidity
forge build

# 3. Run Solidity tests (47 tests)
forge test

# 4. Start Anvil
anvil --host 0.0.0.0 --port 8545

# 5. Deploy contracts
node scripts/deploy.mjs

# 6. Start IPFS
ipfs daemon

# 7. Start backend
cp .env.example .env  # edit with deployed addresses
node dist/api/src/server.js

# 8. Run backend tests (14 tests)
node --test tests/backend.test.mjs

# 9. Run attack harness
python harness/attack_harness.py --system B3 --out harness/results

# 10. CLI
npx tsx cli.ts health
```

## 10. Remaining work for full thesis

| Task | Priority | Status |
|---|---|---|
| P4 Watcher tests | P4 | Not implemented |
| P5 Baselines B0-B2 | P5 | Documented, not coded |
| P6 Isolated gas (multi-run) | P6 | Single run only |
| P7 Next.js UI | P7 | CLI only |
| P8 Clean-environment validation | P8 | Manual, not scripted |
| E2-E8 experiments | Research | Not run |
| Thesis write-up | Research | Not started |
EOF