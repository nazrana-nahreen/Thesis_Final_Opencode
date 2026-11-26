# MetaTrade-R

**Auditing and Repairing Content Binding, Confidentiality, and Dispute Resolution in Blockchain-Based AIGC Licence Trading**

A BSc CSE thesis project that audits the published MetaTrade framework (IEEE Access, 2024) and implements a repaired settlement protocol for AI-generated content (AIGC) licence trading.

## Overview

MetaTrade (IEEE Access 2024) claims trust-free AIGC trading but its settlement check compares a buyer-computed hash against a seller-declared hash — self-consistency, not product binding. MetaTrade-R provides:

1. **Reproducible audit** — 15 security findings with file/function/line evidence
2. **CRC settlement** — Commit-Recompute-Challenge protocol binding payment to pre-sale content commitments
3. **Confidentiality-preserving delivery** — per-buyer ECIES key wrapping (honest path)
4. **On-chain trustless dispute resolution** — Mode 1 (integrity) without arbitrator, Mode 2 (non-delivery) with seller reveal
5. **Economic model** — bond sizing linked to fingerprint detection probability
6. **Measured costs** — gas, latency, storage, attack success rates

## Architecture

```
metatrade-r/
├── src/                    # 5 Solidity contracts (Foundry)
├── test/                   # 6 Solidity test suites (59 tests)
├── script/                 # Deployment script
├── crypto/                 # TypeScript crypto (HMAC, Merkle, encryption, ECIES)
├── api/src/                # Fastify backend (17 endpoints)
├── tests/                  # Backend integration tests (14 tests)
├── audit/                  # Audit reports
├── harness/                # Python attack harness (17 scenarios)
├── watcher/                # Event watcher
├── experiments/            # Gas benchmark + baseline reports
├── validation/             # Validation report
├── thesis/diagrams/        # 20 architecture diagrams (PNG+SVG+Mermaid)
├── cli.ts                  # CLI (6 commands)
├── foundry.toml            # Foundry config
├── package.json            # Node.js dependencies
└── tsconfig.json           # TypeScript config
```

## Technology Stack

| Component | Technology | Version |
|---|---|---|
| Smart contracts | Solidity | 0.8.31 |
| Contract framework | Foundry | 1.10.0 |
| Local blockchain | Anvil | 1.10.0 |
| Backend | Fastify + TypeScript | 5.x / Node 22 |
| Ethereum client | viem | 2.x |
| IPFS | Kubo | 0.32.1 |
| Crypto | HMAC-SHA256, SHA-256, ECIES | — |
| Tokens | OpenZeppelin 5.x | ERC-1155 |

## Quick Start

### Prerequisites

- Git 2.45+
- Node.js 22 LTS
- Python 3.10+
- Foundry 1.10.0+
- IPFS Kubo 0.32.1+

### Installation

```bash
# Clone
git clone https://github.com/nazrana-nahreen/Thesis_Final_Opencode.git
cd Thesis_Final_Opencode/metatrade-r

# Install dependencies
npm install
# If the lib/ submodules are not initialised yet:
git submodule update --init --recursive
# ...or install them explicitly:
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
pip install web3

# Initialize IPFS
ipfs init
```

### Build & Test

```bash
# Compile Solidity
forge build

# Run Solidity tests (59 tests)
forge test

# Run backend tests (14 tests)
# Requires Anvil + Kubo + the backend server (node dist/api/src/server.js) running.
# The tests use 127.0.0.1 by default; override with API_BASE=...
node --test tests/backend.test.mjs

# TypeScript compilation
npx tsc --noEmit
```

### Run the full system

```bash
# 1. Start Anvil
anvil --host 0.0.0.0 --port 8545

# 2. Deploy contracts
node scripts/deploy.mjs

# 3. Start IPFS
ipfs daemon

# 4. Start backend
node dist/api/src/server.js

# 5. Health check
curl http://localhost:3001/health
```

### Run attack scenarios

```bash
python harness/attack_harness.py --system B3 --out harness/results
```

## Test Results

| Suite | Tests | Status |
|---|---|---|
| DisputeVerifier | 7 | PASS |
| CryptoVectors (RFC 4231, NIST, Merkle) | 10 | PASS |
| E2E | 2 | PASS |
| Invariants (fuzz) | 1 | PASS |
| Adversarial (AT-01..AT-17) | 27 | PASS |
| GasBenchmark | 12 | PASS |
| Backend (Node.js) | 14 | PASS |
| **Total** | **73** | **All pass** |

Attack scenarios: 17/17 executed, 15 blocked, 2 residual (documented).

## Gas Measurements (isolated, cold)

| Operation | Gas |
|---|---|
| Honest sale cycle | 448,119 |
| Mode 1 dispute | 324,580 |
| Mode 2 dispute | 132,030 |
| Deliver | 83,044 |
| Confirm | 163,417 |
| Buy | 201,658 |

## Key Design Decisions

1. **HMAC-CTR instead of AES-GCM:** Enables on-chain verification via SHA-256 precompile. Not AEAD — integrity comes from hash commitments.
2. **Per-buyer key wrapping:** ECIES (secp256k1) preserves confidentiality on honest path. Key revealed on dispute (accepted trade-off).
3. **Two-mode dispute:** Mode 1 (integrity, deterministic, no arbitrator). Mode 2 (non-delivery, seller must reveal).
4. **Bond sizing:** `b_s > ((1-P_d)/P_d) · p` — linked to fingerprint detection probability.

## Security

- 15 audit findings (0 critical, 2 high, 4 medium, 5 low, 3 info)
- All high/medium findings are design-level limitations, documented as residual risks
- No fund-loss bugs, access-control bypasses, or reentrancy vulnerabilities
- Trust set: TA1-TA12 (enumerated, not empty)

## Documentation

- `audit/` — Audit reports (FINAL_INDEPENDENT_AUDIT.md, AUDIT.md)
- `thesis/diagrams/` — 20 architecture diagrams (PNG + SVG + Mermaid)
- `experiments/` — Gas benchmark + baseline reconstruction reports
- `validation/` — Validation report
- `EMPTY_DIRECTORY_ARCHITECTURE_AUDIT.md` — Directory audit

## License

MIT (see SPDX headers in source files).

## Acknowledgments

Based on: Truong, Le & Le, "Trust-Free Blockchain Framework for AI-Generated Content Trading and Management in Metaverse," IEEE Access, vol. 12, 2024. DOI: 10.1109/ACCESS.2024.3376509

Adapted from: FairSwap (Dziembowski, Eckey, Faust, CCS 2018, DOI: 10.1145/3243734.3243857)
EOF