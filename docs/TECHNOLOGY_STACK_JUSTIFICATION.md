# TECHNOLOGY STACK JUSTIFICATION

**Purpose:** to justify each technology choice against alternatives, and to justify the exclusions. The criterion is not "modern" or "popular" — it is *fit for a laptop-feasible, reproducible, security-relevant BSc thesis*.

---

## 1. Selection criteria

| Criterion | Weight | Meaning |
|---|---|---|
| **Reproducibility** | High | A second person can rebuild the environment from the repo |
| **Testability** | High | Fuzzing, invariants, deterministic runs |
| **Laptop feasibility** | High | Runs on 16 GB RAM, no cluster |
| **Ecosystem maturity** | Medium | Audited libraries, stable APIs |
| **Learning cost** | Medium | Reachable in the 24-week budget |
| **Direct relevance** | Medium | Exercises the skills the thesis claims |

A choice that is powerful but unreproducible (e.g., a 100-node Fabric network) loses to a simpler choice.

---

## 2. Stack decisions

| Layer | Choice | Alternatives considered | Justification | Risk |
|---|---|---|---|---|
| **Contract language** | Solidity `0.8.24` | Vyper, Huff | Largest ecosystem; OpenZeppelin; Foundry support; checked arithmetic by default | Low |
| **Contract framework** | **Foundry** (primary) | Hardhat, Truffle | Native Solidity tests; built-in fuzzing and invariant testing; `forge snapshot` for gas; fast; no JS config drift; deterministic | Low |
| **Secondary framework** | Hardhat — **only if** a required plugin has no Foundry equivalent | — | Avoids maintaining two toolchains | Low |
| **Contract libraries** | OpenZeppelin `5.x` | solmate, solady | Audited; standard interfaces (ERC-1155, ReentrancyGuard, Ownable2Step) | Low |
| **Static analysis** | Slither | Mythril, Securify | Fast, maintained, good CI integration | Low |
| **Fuzzing / invariants** | Foundry invariants; Echidna optional | Echidna only, Scribble | Foundry invariants are sufficient for the listed properties; Echidna adds stateful fuzzing if time permits | Low |
| **Off-chain language** | TypeScript on Node 20 LTS | Go, Rust, Python | Shared types with the UI; mature Ethereum tooling; fast enough for encryption/Merkle | Low |
| **API framework** | Fastify | Express, NestJS | Fast, schema-first, minimal; no decorator overhead | Low |
| **Ethereum client (TS)** | **viem** | ethers.js v6, web3.js | Typed, tree-shakeable, excellent ABI ergonomics; fewer breaking changes | Low |
| **Frontend** | Next.js 14 (App Router) + wagmi | Vite + React, SvelteKit | SSR for marketplace pages; wagmi/viem integration; large example base | Low |
| **UI scope** | Minimal, functional | Polished design system | The thesis is about protocol correctness, not UX; a CLI fallback exists | Low |
| **Measurement / ML** | Python 3.11 | R, Julia | NumPy/SciPy/statsmodels for statistics; PyTorch/timm for embeddings; imagehash/OpenCV for fingerprints | Low |
| **Python Ethereum client** | web3.py | eth-brownie, web3.js via subprocess | Direct ABI calls; no extra framework | Low |
| **Statistics** | SciPy + statsmodels | R | Paired tests, bootstrap, Holm–Bonferroni; reproducible in the same language as the harness | Low |
| **Storage** | IPFS via **Kubo** (local) + Pinata (optional, testnet) | Arweave, Filecoin, S3 | Content addressing matches the protocol; local Kubo is reproducible; Pinata gives testnet persistence | Medium — pinning is not incentivised (documented) |
| **Content encryption** | **HMAC-SHA256-CTR** (primary) | AES-256-GCM | The EVM can recompute one keystream block cheaply, enabling on-chain consistency proofs without ZK or an oracle. AES-GCM is standard but **not** EVM-recomputable; it is retained as **Mode B** with an oracle | **Medium — non-standard cipher; documented and bounded** |
| **Key wrapping** | ECIES over secp256k1 (`eciesjs`) | RSA-OAEP, X25519 + HKDF | Matches Ethereum key material; simple; well-tested JS library | Low |
| **Hashing** | SHA-256 (precompile `0x02`) | Keccak-256 | Cheap on-chain (60 + 12/word); Merkle proofs are hash-heavy; Keccak is more expensive and unnecessary here | Low |
| **Local chain** | **Anvil** | Ganache, Hardhat Network | Deterministic, fast, timestamp control, part of Foundry | Low |
| **Public testnet** | **Sepolia** | Goerli (deprecated), Holesky | Active faucet; widely supported; stable | Low |
| **L2 (cost arm)** | **Base Sepolia** (or Optimism Sepolia) | Arbitrum Sepolia | Cheap, EVM-equivalent, good faucet | Low |
| **Orchestration** | Docker Compose | Kubernetes, bare metal | One command to reproduce; laptop-friendly | Low |
| **CI** | GitHub Actions | GitLab CI, local only | Free for public repos; runs tests on push | Low |
| **Event indexing** | Simple poller in `api` | The Graph, Ponder | Avoids a hosted dependency; the event volume is small | Low |
| **Database** | **None** | Postgres, MongoDB | Chain + IPFS are the source of truth; a cache can be a JSON file | Low |

---

## 3. The one contentious choice: HMAC-CTR instead of AES-GCM

This is the only decision a reviewer is likely to challenge, so it is justified explicitly.

**Requirement.** The contract must be able to check, for a single block, that the committed ciphertext decrypts to the committed plaintext. Without that check, the dispute is not resolvable on-chain (this is exactly MetaTrade's failure).

**Option A — AES-256-GCM + ZK proof of correct decryption.** Standard cipher; but a ZK circuit for AES over a full block is large (tens of thousands of constraints per block), and proving/verifying on-chain is expensive. Too heavy for a BSc and for laptop-feasible experiments.

**Option B — AES-256-GCM + trusted oracle.** Standard cipher; the oracle decrypts and attests. But this reintroduces a trusted party for the *integrity* property, which is the property the thesis is trying to make trustless. It also makes the dispute subjective.

**Option C — HMAC-SHA256-CTR + hash commitments.** The EVM recomputes the keystream for one block with two SHA-256 precompile calls per 32 bytes. The contract checks the relation directly. No ZK, no oracle. The cipher is a standard PRF in counter mode, but it is **not** a standardised AEAD.

**Decision: C for the primary protocol, B documented as the production alternative.** The thesis:

- states that the cipher is not a contribution;
- states the assumption (HMAC-SHA256 is a PRF) and the uniqueness requirement on `K`;
- measures the gas cost of the on-chain recomputation;
- reports Mode B's cost and trust assumptions as a comparison point.

A reviewer who rejects C can still accept the thesis as an evaluation of the trade-off, because Mode B is specified and measured.

---

## 4. Deliberate exclusions

| Excluded | Why |
|---|---|
| **Hyperledger Fabric** | The base paper's Fabric results are not reproducible from the artifact; rebuilding a 50-orderer network is out of scope and does not strengthen the core claim |
| **Zero-knowledge proofs (circom/snarkjs)** | Proving correct decryption is too heavy for the timeline; noted as future work |
| **Hardhat as a second full toolchain** | Two frameworks double the maintenance; Foundry covers tests, fuzzing, scripts, and gas |
| **Truffle** | Deprecated |
| **Kubernetes / multi-host** | Not needed for a single-host evaluation; adds failure modes |
| **IPFS Cluster** | Overkill; a single Kubo node + optional Pinata is enough |
| **Postgres / MongoDB** | The chain and IPFS are the source of truth; a JSON cache is sufficient |
| **GraphQL** | REST endpoints are enough for the UI |
| **The Graph** | A hosted dependency; a simple poller is more reproducible |
| **Ethers.js** | viem is typed and lighter; mixing both adds confusion |
| **Model training / fine-tuning** | The thesis uses pretrained embeddings; training is out of scope |
| **A polished design system** | Not a research contribution; a CLI fallback exists |
| **Account abstraction / gasless UX** | Nice for production, irrelevant to the research questions |

---

## 5. Version pinning

All versions are pinned in the repository:

```
foundry.toml        solc = "0.8.24", evm_version = "cancun", optimizer_runs = 200
package.json        node 20.x, viem, wagmi, next, fastify, eciesjs
requirements.txt    python 3.11, numpy, scipy, statsmodels, web3, pillow,
                    opencv-python, imagehash, torch, timm
docker-compose.yml  anvil (foundry image), kubo (ipfs/kubo:<pinned>)
```

`REPRODUCE.md` records the exact commands. A `make doctor` target checks the versions and fails loudly on mismatch.

---

## 6. Environment setup (target)

```
git clone <repo>
cd metatrade-r
make doctor          # check tool versions
make install         # forge install; npm ci; pip install -r requirements.txt
make chain           # anvil
make ipfs            # kubo daemon
make test            # forge test + invariant tests
make e2e             # end-to-end honest + dishonest sale
make bench           # gas + latency + storage
make figures         # regenerate all plots from results/
```

The whole environment must come up with **one command** on a clean laptop. If it does not, the reproducibility claim fails before the experiments begin.

---

## 7. Cost of the stack

| Item | Cost |
|---|---|
| Foundry, Solidity, OpenZeppelin | Free |
| Node, Python, PyTorch (CPU) | Free |
| Kubo, Anvil | Free |
| Sepolia / Base Sepolia faucets | Free |
| Pinata (optional) | Free tier sufficient |
| GitHub Actions | Free for public repos |
| Cloud GPU (optional) | Free Colab tier, or CPU subset |

**Total cash cost: zero.** This matters for a BSc thesis and is stated in the feasibility assessment.
