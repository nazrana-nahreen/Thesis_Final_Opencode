# Empty Directory Architecture Audit — MetaTrade-R

**Date:** 2026-11-23
**Scope:** Three empty directories: `web/`, `contracts/`, `verifier/`

---

## 1. Current project architecture

The MetaTrade-R project uses the following directory structure:

```
metatrade-r/
├── src/                    # 5 Solidity contracts (Foundry source)
│   ├── DisputeVerifier.sol
│   ├── AssetRegistry.sol
│   ├── SaleEscrow.sol
│   ├── RoyaltySplitter.sol
│   └── LicenceToken.sol
├── test/                   # 6 Solidity test files (59 tests)
├── script/                 # 1 Foundry deploy script
├── crypto/                 # 3 TypeScript crypto modules
├── api/src/                # 8 TypeScript backend files (16 endpoints)
├── tests/                  # 1 Node.js backend test file (14 tests)
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
├── web/                    # EMPTY (0 files)
├── contracts/              # EMPTY (0 files)
└── verifier/               # EMPTY (0 files)
```

## 2. Actual location of each implemented component

| Component | Actual location | Technology |
|---|---|---|
| Solidity contracts (5) | `src/` | Foundry (solc 0.8.31) |
| Solidity tests (59) | `test/` | Foundry (forge test) |
| Deploy script | `script/Deploy.s.sol` | Foundry script |
| TypeScript crypto (HMAC, Merkle, commitments) | `crypto/crypto.ts` | Node.js crypto |
| Encryption + proof generation | `crypto/encrypt.ts` | Node.js crypto |
| ECIES key wrapping | `crypto/keywrap.ts` | eciesjs |
| Fastify backend (16 endpoints) | `api/src/` | Fastify + viem |
| Backend tests (14) | `tests/backend.test.mjs` | Node.js test runner |
| Event watcher | `watcher/watcher.ts` | viem + JSON checkpoint |
| Attack harness | `harness/attack_harness.py` | Python + web3.py |
| Audit documents | `audit/` | Markdown |
| Gas benchmark | `experiments/` | Foundry gas-report |
| CLI | `cli.ts` | TypeScript |
| Reproducibility | `REPRODUCE.sh` | Bash |

## 3. Dependency analysis

### Search results for references to `web/`, `contracts/`, `verifier/`

**`web/`:**
- `foundry.toml`: no reference
- `package.json`: no reference
- `tsconfig.json`: no reference (includes `crypto/**/*.ts`, `api/**/*.ts`, `cli.ts`)
- `README.md`: mentions "Minimal UI or CLI" as Tier 2/3, but no path reference
- `REPRODUCE.sh`: no reference
- All source files: no import or path reference
- Documentation: no reference to `web/` directory

**`contracts/`:**
- `foundry.toml`: `src = "src"` (Foundry's standard, NOT `contracts/`)
- No file references `contracts/` as a source directory
- The only mention of "contracts/" is in `audit/AUDIT.md`, which refers to the base paper's repository (`MetaTrade-Ethereum`), not this project

**`verifier/`:**
- No file references `verifier/` as a directory
- Verification logic is in `src/DisputeVerifier.sol` (Solidity library) and `crypto/crypto.ts` (TypeScript module)
- No standalone verifier service exists or is referenced

### Build configuration

- **Foundry** (`foundry.toml`): `src = "src"`, `out = "out"`, `libs = ["lib"]`. Standard Foundry layout. The `contracts/` directory is a Hardhat convention, not Foundry's.
- **TypeScript** (`tsconfig.json`): includes `crypto/**/*.ts`, `api/**/*.ts`, `cli.ts`. No `web/` or `verifier/` reference.
- **Node.js** (`package.json`): no `web/` or `verifier/` reference.

## 4. Classification

### A. `web/` — OPTIONAL (future extension)

**Classification:** OPTIONAL / FUTURE EXTENSION

**Evidence:**
- No source file, configuration, or documentation references `web/`.
- The project has a functional CLI (`cli.ts`) that provides asset registration, marketplace listing, purchase, licence access, and dispute initiation.
- The backend API (16 endpoints) provides all necessary functionality.
- The thesis scope (Tier 1) does not require a web UI. The README explicitly states "Minimal UI or CLI" as Tier 2/3.
- A Next.js frontend was planned (P7) but is outside the current Tier-1 scope.

**Recommendation:** Retain as a placeholder for future work. Do not populate unless a web UI is explicitly required. The CLI is sufficient for demonstration.

### B. `contracts/` — UNNECESSARY

**Classification:** UNNECESSARY

**Evidence:**
- Foundry uses `src/` as the standard source directory, configured in `foundry.toml` (`src = "src"`).
- All 5 contracts are in `src/` and compile successfully (`forge build` → 0 errors).
- All 47 Solidity tests pass with the current layout.
- No configuration file, import statement, or documentation references `contracts/` as a source directory.
- The `contracts/` directory is a Hardhat convention. This project uses Foundry, not Hardhat.
- Moving contracts to `contracts/` would require changing `foundry.toml` (`src = "contracts"`), updating all test imports, and re-running all tests — with no benefit.

**Recommendation:** Remove. The directory serves no purpose. Foundry's standard layout uses `src/`.

### C. `verifier/` — UNNECESSARY

**Classification:** UNNECESSARY

**Evidence:**
- Dispute verification is implemented as a Solidity library (`src/DisputeVerifier.sol`), not a standalone service.
- The TypeScript crypto module (`crypto/crypto.ts`) provides the off-chain reference implementation.
- No standalone verifier process exists or is referenced.
- The concept of a separate "verifier" service was part of an earlier (superseded) design that used an optimistic oracle pattern. That design was replaced by the CRC (Commit-Recompute-Challenge) protocol, which requires no separate verifier.
- The event watcher (`watcher/watcher.ts`) handles event monitoring but does not perform verification — it only detects timeout-eligible sales.

**Recommendation:** Remove. Verification is a library (Solidity) and a module (TypeScript), not a standalone service.

## 5. Recommended final project structure

```
metatrade-r/
├── src/                    # 5 Solidity contracts (Foundry source) — KEEP
├── test/                   # 6 Solidity test files (59 tests) — KEEP
├── script/                 # 1 Foundry deploy script — KEEP
├── crypto/                 # 3 TypeScript crypto modules — KEEP
├── api/                    # Fastify backend (16 endpoints) — KEEP
├── tests/                  # 14 Node.js backend tests — KEEP
├── audit/                  # 2 audit documents — KEEP
├── harness/                # 2 Python attack harness files — KEEP
├── watcher/                # 1 TypeScript event watcher — KEEP
├── experiments/            # 2 reports — KEEP
├── validation/             # 1 validation report — KEEP
├── cli.ts                  # Minimal CLI — KEEP
├── foundry.toml            # Foundry configuration — KEEP
├── package.json            # Node.js dependencies — KEEP
├── tsconfig.json           # TypeScript configuration — KEEP
├── .env / .env.example     # Environment configuration — KEEP
├── REPRODUCE.sh            # Reproducibility script — KEEP
├── README.md               # Project documentation — KEEP
├── web/                    # OPTIONAL — retain as placeholder for future UI
├── contracts/              # REMOVE — unnecessary (Foundry uses src/)
└── verifier/               # REMOVE — unnecessary (verification is a library/module)
```

## 6. Final answer

**Are these three directories necessary for a complete, reproducible, working MetaTrade-R thesis implementation?**

No.

- **`contracts/`** is unnecessary. Foundry uses `src/` as its standard source directory. All 5 contracts, 59 tests, and the deploy script are in `src/`, `test/`, and `script/`. Moving them would break `foundry.toml` and all imports with no benefit.
- **`verifier/`** is unnecessary. Dispute verification is implemented as a Solidity library (`src/DisputeVerifier.sol`) and a TypeScript module (`crypto/crypto.ts`). No standalone verifier service exists or is needed. The earlier design that contemplated a separate verifier was superseded by the CRC protocol.
- **`web/`** is optional. A web UI was planned as a Tier 3 (stretch) feature. The system can be fully demonstrated via the CLI (`cli.ts`) and the backend API (16 endpoints). No implementation depends on `web/`.

**Recommendation:** Remove `contracts/` and `verifier/`. Retain `web/` as an empty placeholder for future work, or remove it if a clean repository is preferred.

**Awaiting approval before making any structural changes.**