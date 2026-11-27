# Directory Cleanup Report — MetaTrade-R

> **Superseded (2026-11-27).** This report records an earlier snapshot. Test counts (59 Solidity, 73 total) and gas figures (448,119 cycle / 324,580 dispute) are historical; the current build has 72 Foundry + 14 backend + 7 watcher = 93 tests and 456,691 / 241,278 gas (30-run means). See docs/MEASURED_RESULTS.md and docs/THESIS_DRAFT.md.

**Date:** 2026-11-23

## Directories removed

1. `contracts/` — confirmed empty (0 files, 0 hidden files).
2. `verifier/` — confirmed empty (0 files, 0 hidden files).
3. `web/` — confirmed empty (0 files, 0 hidden files).

## Confirmation that they were empty

Each directory was inspected with `Get-ChildItem -Force -Recurse` before deletion. No files, hidden files, or subdirectories were found in any of the three.

## Files and configurations preserved

- All 5 Solidity contracts in `src/` (unchanged).
- All 6 test files in `test/` (unchanged).
- `foundry.toml` (unchanged — `src = "src"`).
- All TypeScript modules in `crypto/`, `api/`, `watcher/`.
- All Python files in `harness/`, `experiments/`.
- All documentation in `audit/`, `validation/`, root.
- `cli.ts`, `scripts/`, `tests/`, `.env`, `.env.example`, `REPRODUCE.sh`, `README.md`.
- No imports or configuration references were broken.

## Commands executed

1. `forge build` → EXIT: 0 (compilation successful, 0 errors)
2. `forge test` → 59 tests passed, 0 failed, 0 skipped
3. `node --test tests/backend.test.mjs` → 14 tests passed, 0 failed
4. `npx tsx cli.ts health` → `{ status: "ok" }`
5. `npx tsc --noEmit` → EXIT: 0 (0 errors)

## Actual test results

| Suite | Tests | Status |
|---|---|---|
| DisputeVerifier.t.sol | 7 | PASS |
| CryptoVectors.t.sol | 10 | PASS |
| E2E.t.sol | 2 | PASS |
| Invariants.t.sol | 1 | PASS |
| Adversarial.t.sol | 27 | PASS |
| GasBenchmark.t.sol | 12 | PASS |
| Backend (Node.js) | 14 | PASS |
| **Total** | **73** | **All pass** |

## Failures or remaining issues

None. All validation commands executed successfully. No files were modified. No imports or configurations were broken.

## Final project structure (post-cleanup)

```
metatrade-r/
├── src/                    # 5 Solidity contracts
├── test/                   # 6 Solidity test files (59 tests)
├── script/                 # 1 Foundry deploy script
├── crypto/                 # 3 TypeScript crypto modules
├── api/                    # Fastify backend (16 endpoints)
├── tests/                  # 14 Node.js backend tests
├── audit/                  # 2 audit documents
├── harness/                # 2 Python attack harness files
├── watcher/                # 1 TypeScript event watcher
├── experiments/            # 2 reports
├── validation/             # 1 validation report
├── cli.ts                  # Minimal CLI
├── foundry.toml            # Foundry configuration
├── package.json            # Node.js dependencies
├── tsconfig.json           # TypeScript configuration
├── .env / .env.example     # Environment configuration
├── REPRODUCE.sh            # Reproducibility script
├── README.md               # Project documentation
└── DIRECTORY_CLEANUP_REPORT.md  # This file
```
EOF