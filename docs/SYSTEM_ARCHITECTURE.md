# SYSTEM ARCHITECTURE

**Purpose:** to specify the complete system — on-chain contracts, off-chain services, data flows, storage, deployment topologies, and failure handling — at a level sufficient to implement without further design decisions.

---

## 1. Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│   Seller UI (Next.js)          Buyer UI (Next.js)        Auditor CLI     │
└───────────────┬────────────────────────┬──────────────────────┬──────────┘
                │                        │                      │
                ▼                        ▼                      ▼
┌───────────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐
│  api (Node/TS, Fastify)   │  │  verifier (Python)   │  │  harness (Python)│
│  encrypt · Merkle · IPFS  │  │  hash · Merkle · pHash│  │  attacks · stats │
│  ECIES wrap · tx builder  │  │  watcher · assertions │  │  gas · latency   │
└─────────┬─────────────────┘  └──────────┬───────────┘  └────────┬─────────┘
          │                               │                       │
          ▼                               ▼                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         EVM (Anvil / Sepolia / L2)                       │
│  AssetRegistry   SaleEscrow   LicenseToken   RoyaltySplitter             │
│  PlagiarismRegistry   Reputation   StorageBond (Tier 3)                  │
└──────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     IPFS (Kubo local / pinning service)                  │
│  C (ciphertext)   Λ_D, Λ_C (leaf lists)   preview   metadata.json        │
└──────────────────────────────────────────────────────────────────────────┘
```

**Design rule:** the chain stores only commitments and state; the bytes live on IPFS; the crypto runs client-side. No service is trusted for correctness — every service output is checkable against an on-chain commitment.

---

## 2. On-chain components

### 2.1 `AssetRegistry`

**Responsibility:** the immutable pre-sale commitment and the mutable listing state.

State per asset:

```solidity
struct Asset {
    address seller;
    bytes32 hD;          // H(0x04 || salt_D || L || D)
    bytes32 hC;          // H(0x05 || salt_C || L || C)
    bytes32 R_D;         // plaintext Merkle root
    bytes32 R_C;         // ciphertext Merkle root
    bytes32 cK;          // H(0x08 || K || N || s)
    bytes32 leafListD;   // IPFS CID hash of Λ_D
    bytes32 leafListC;   // IPFS CID hash of Λ_C
    bytes32 previewCid;  // IPFS CID hash of the preview
    bytes32 fingerprint; // 64-bit pHash padded, or 128-bit LSH
    uint32  m;           // number of blocks
    uint32  blockSize;   // β
    uint64  price;
    uint16  royaltyBps;
    address parent;
    bool    active;
    uint64  listedAt;
}
```

**Responsibilities:** create listing, deactivate listing, read commitments. **Does not** hold funds or adjudicate.

**Invariants:**
- `blockSize ∈ [256, 65536]`, `m ≥ 1`, `m · blockSize ≥ L`.
- `royaltyBps ≤ r_max`.
- `parent == address(0) || parent is LISTED`.
- Commitments are write-once (no setter after `list`).

### 2.2 `SaleEscrow`

**Responsibility:** the per-sale state machine, bonds, timeouts, and settlement.

State per sale:

```solidity
enum State { NONE, ESCROWED, DELIVERED, CHALLENGED, SETTLED, REFUNDED, EXPIRED }

struct Sale {
    address buyer;
    address seller;
    uint256 assetId;
    uint64  price;        // snapshot at purchase
    uint64  bondBuyer;
    uint64  bondSeller;
    uint64  tDeliver;
    uint64  tConfirm;
    uint64  tRespond;
    State   state;
    bytes   encK;         // ECIES ciphertext of K
}
```

**Functions:** `buy`, `deliver`, `confirm`, `disputeMode1`, `disputeMode2`, `respond`, `timeoutDeliver`, `timeoutConfirm`, `timeoutRespond`.

**Invariants:**
- Exactly one terminal state per sale.
- `state == SETTLED ⇒ seller paid p + b_s, buyer bond returned`.
- `state == REFUNDED ⇒ buyer paid p + b_b, seller bond slashed`.
- No function moves funds twice.
- All external value transfers use `call{value:}` after state updates (CEI) and a reentrancy guard.

### 2.3 `DisputeVerifier` (library)

**Responsibility:** the pure verification logic, separated for testability.

```solidity
library DisputeVerifier {
    function verifyMerkle(bytes32 root, bytes32 leaf, uint256 index, bytes32[] calldata proof)
        internal pure returns (bool);

    function keystreamBlock(bytes32 kEnc, uint256 i, uint256 j)
        internal pure returns (bytes32);

    function checkConsistency(
        bytes32 R_D, bytes32 R_C, bytes32 cK,
        bytes32 K, bytes32 N, bytes32 s,
        uint256 i, bytes calldata C_i,
        bytes32 leafD, bytes32[] calldata proofD, bytes32[] calldata proofC
    ) internal view returns (bool consistent);
}
```

**Why a library:** it has no state, can be fuzz-tested in isolation, and keeps `SaleEscrow` under the size limit.

### 2.4 `LicenseToken`

**Responsibility:** proof of licence.

ERC-1155, one token id per asset, balance = number of licences held. Metadata (off-chain JSON) encodes scope, duration, territory, derivatives, and the parent royalty. **Why ERC-1155 and not ERC-721:** a licence is non-unique and repeatable; ERC-1155 gives `balanceOf` semantics without one NFT per sale. ERC-4907-style expiry is recorded in the metadata and enforced by the front-end; on-chain enforcement of expiry is out of scope.

### 2.5 `RoyaltySplitter`

**Responsibility:** pull-payment royalty distribution.

```solidity
mapping(address => uint256) public credits;   // pull pattern

function credit(uint256 assetId, uint256 amount) internal;
function withdraw() external;                  // call{value:}, reentrancy guard
```

On `confirm`, the escrow calls `credit(child, p·(1-r))` and `credit(parent, p·r)`. **Pull, not push:** a reverting recipient cannot block settlement. This fixes MetaTrade's `.transfer` and stranded-fund bugs.

### 2.6 `PlagiarismRegistry` (Tier 2)

**Responsibility:** bonded reports and on-chain fingerprint comparison.

```solidity
function report(uint256 assetA, uint256 assetB) external payable;
```

The contract reads `fingerprint` for both assets, computes Hamming distance (XOR + popcount), and compares to `τ`. If `distance ≤ τ`, the later listing is deactivated, the reporter is rewarded from the plagiarist's bond, and the plagiarist is slashed. If not, the reporter's bond is slashed. **Limitation:** the fingerprint is self-reported; a bonded challenge can force a reveal and recomputation (Tier 3).

### 2.7 `Reputation` (Tier 2)

**Responsibility:** commit-reveal, stake-weighted ratings.

```solidity
function commit(uint256 saleId, bytes32 commitHash) external;
function reveal(uint256 saleId, uint8 stars, bytes32 salt) external;
```

Weight `w_i = stake_i · e^{-λΔt}`; aggregate `R = Σ w_i s_i / Σ w_i`. New identities have zero stake, so Sybil ratings have zero weight. The exponential decay is computed off-chain and supplied with a proof, or approximated with a step function on-chain (Tier 2 decision; documented).

### 2.8 `StorageBond` (Tier 3)

**Responsibility:** optional pinning bond. A pinner locks a bond and asserts it holds `C`; a challenge requires a retrieval proof within `T`; failure slashes the bond. Out of Tier 1.

---

## 3. Off-chain components

### 3.1 `api` (Node 20 + TypeScript + Fastify)

| Endpoint | Responsibility |
|---|---|
| `POST /assets` | accept `D` + metadata; encrypt; build Merkle trees; pin to IPFS; return commitments |
| `POST /assets/:id/list` | build and send `AssetRegistry.list` |
| `POST /sales/:id/buy` | build and send `SaleEscrow.buy` |
| `POST /sales/:id/deliver` | ECIES-wrap `K` to the buyer; send `deliver` |
| `POST /sales/:id/confirm` | fetch `C`, decrypt, verify `hC`/`hD`, send `confirm` |
| `POST /sales/:id/dispute` | locate an inconsistent block; build the proof; send `disputeMode1` or `disputeMode2` |
| `GET /assets/:id` | metadata + commitments |
| `GET /sales/:id` | state + deadlines |

**Rule:** the API never holds plaintext keys at rest. Encryption happens in the request handler; `K` is zeroed after wrapping. The buyer's key never leaves the client.

### 3.2 `verifier` (Python 3.11)

| Function | Responsibility |
|---|---|
| `verify_commitments` | recompute `hD`, `hC`, roots, leaf lists |
| `find_inconsistency` | compare decrypted leaves to `Λ_D`; return the first mismatch |
| `build_proof` | construct Merkle proofs from `Λ_D`, `Λ_C` |
| `phash` | compute pHash / dHash / aHash / PDQ / embedding |
| `watch` | poll for `CHALLENGED` sales; assert or counter-assert |
| `semantic_check` | compare `pHash(D)` to `pHash(preview)`; report distance |

**Why Python:** the plagiarism experiments (D2) need NumPy/Pillow/imagehash/timm, and the statistical analysis needs SciPy/statsmodels. Keeping all measurement in one language avoids cross-language numerical drift.

### 3.3 `web` (Next.js 14 + wagmi/viem)

Screens: marketplace, asset detail (preview, terms, price, bond), purchase, sale status, dispute, seller dashboard (listings, revenue, royalties), reporter dashboard.

**Security rule:** every hash and address displayed is recomputed client-side from the fetched bytes; the UI never trusts an API response for correctness.

### 3.4 `harness` (Python)

Attack scripts, gas measurement, latency measurement, statistical analysis. Detailed in `EXPERIMENTAL_METHODOLOGY.md`.

---

## 4. Data flows

### 4.1 Listing

```
Seller → api: D, metadata, price, royalty, parent
api: K ← random; N ← random; s ← random
api: C ← PRF-encrypt(K, D); Λ_D, R_D; Λ_C, R_C; hD; hC; cK
api: pin C, Λ_D, Λ_C, preview to IPFS
api → AssetRegistry.list(hD, hC, R_D, R_C, cK, CIDs, m, β, price, royalty, parent)
```

### 4.2 Purchase and delivery

```
Buyer → SaleEscrow.buy(assetId) {value: p + b_b}
Seller → api: saleId
api: encK ← ECIES(B_pub, K)
api → SaleEscrow.deliver(saleId, encK)
```

### 4.3 Verification and settlement

```
Buyer → api: saleId
api: C ← IPFS(cidC); assert H(C) == hC
api: K ← ECIES_dec(B_sk, encK)
api: D' ← PRF-decrypt(K, C); assert H(D') == hD
if ok:  api → SaleEscrow.confirm(saleId)
else:   api → SaleEscrow.disputeMode1(...) or disputeMode2()
```

### 4.4 Integrity dispute (Mode 1)

```
verifier: find i where H(0x06||i||Φ(K,i,C_i)) != Λ_D[i]
verifier: build π_i^D from Λ_D, π_i^C from Λ_C
Buyer → SaleEscrow.disputeMode1(saleId, K, N, s, i, C_i, Λ_D[i], π_i^D, π_i^C)
SaleEscrow → DisputeVerifier.checkConsistency(...)
  consistent  → seller paid; buyer bond forfeited
  inconsistent → buyer refunded; seller bond slashed
```

### 4.5 Non-delivery dispute (Mode 2)

```
Buyer → SaleEscrow.disputeMode2(saleId)         [state = CHALLENGED]
Seller → SaleEscrow.respond(saleId, K, N, s)    [within T_respond]
  no response      → refund + slash seller
  invalid cK       → refund + slash seller
  valid cK         → Mode 1 becomes available; buyer bond returned
```

### 4.6 Timeouts

```
now > T_deliver  → timeoutDeliver  → refund + slash seller
now > T_confirm  → timeoutConfirm  → pay seller
now > T_respond  → timeoutRespond  → refund + slash seller
```

### 4.7 Royalty

```
confirm → SaleEscrow → RoyaltySplitter.credit(child, p(1-r))
                     → RoyaltySplitter.credit(parent, p·r)
recipient → RoyaltySplitter.withdraw()
```

### 4.8 Plagiarism report

```
Reporter → PlagiarismRegistry.report{value: b_r}(assetA, assetB)
Registry: d ← Hamming(fp_A, fp_B)
  d ≤ τ → deactivate later asset; reward reporter; slash plagiarist
  d > τ → slash reporter
```

---

## 5. Storage layout

| Data | Location | Size | Bound to |
|---|---|---|---|
| `C` (ciphertext) | IPFS | `L` | `hC`, `R_C` |
| `Λ_D`, `Λ_C` | IPFS | `2·m·32` | `R_D`, `R_C` |
| Preview | IPFS | small | `previewCid`, `fingerprint` |
| Metadata JSON | IPFS | small | `metadataCid` |
| Commitments | chain | ~10 words | — |
| Sale state | chain | ~8 words | — |
| Wrapped keys | chain (per sale) | ~100 bytes | `cK` |
| Licence balance | chain | 1 word | — |
| Ratings | chain | 1 word per rating | — |

**Why leaf lists on IPFS and not on-chain:** for `m = 5120`, `Λ_D` is 160 KB; on-chain storage would cost millions of gas. The root is on-chain; the list is auxiliary and verifiable against the root.

---

## 6. Deployment topologies

### 6.1 Local (development and experiments)

```
Anvil (chain id 31337) + Kubo (IPFS) + api + verifier + web
```

Single host, deterministic accounts, instant blocks. Used for gas and correctness tests.

### 6.2 Public testnet

```
Sepolia + Pinata (or local Kubo with a public gateway)
```

Used for realistic latency and finality. Faucet-funded.

### 6.3 L2 (cost comparison)

```
Base Sepolia or Optimism Sepolia
```

Used only for the L2 cost arm of E6. No L2-specific contract changes.

### 6.4 What is deliberately not deployed

- Fabric (out of scope; see `FINAL_RESEARCH_DESIGN.md` DC-4).
- A production IPFS cluster.
- Kubernetes or multi-host orchestration.

---

## 7. Failure modes and recovery

| Failure | Detection | Recovery |
|---|---|---|
| IPFS unavailable | fetch timeout | Buyer opens Mode 2; refund |
| Gateway serves wrong bytes | `H(C) ≠ hC` | Buyer rejects; fetches from another gateway |
| RPC unavailable | tx failure | Retry with backoff; no state change |
| Seller offline after delivery | `T_respond` elapses | `timeoutRespond`; refund |
| Buyer offline after delivery | `T_confirm` elapses | `timeoutConfirm`; seller paid |
| Front-end compromised | user checks commitments | Client-side verification; signed listing |
| Chain reorg | finality check | Wait `k` confirmations before acting |
| Contract bug | invariant test / Slither | Pause (if upgradeable) or redeploy (immutable) |
| Bond insolvency | slash fails | Bond is escrowed at sale time, so it is collectible |

**Design choice:** contracts are **immutable** (no proxy). A bug means redeploy. This avoids the MetaTrade `initialize` vulnerability class entirely and is defensible for a research prototype. The trade-off (no patching) is documented.

---

## 8. Component interaction summary

| Component | Reads | Writes | Trusted for |
|---|---|---|---|
| `AssetRegistry` | — | commitments, `active` | Nothing beyond storage |
| `SaleEscrow` | registry, verifier | sale state, funds | Correct state machine |
| `DisputeVerifier` | — | — (pure) | Correct arithmetic |
| `LicenseToken` | escrow | balances | Correct minting |
| `RoyaltySplitter` | escrow | credits | Correct split |
| `PlagiarismRegistry` | registry | `active`, bonds | Correct Hamming check |
| `Reputation` | escrow | ratings | Correct weighting |
| `api` | chain, IPFS | chain txs, IPFS | Nothing (outputs are checkable) |
| `verifier` | chain, IPFS | chain txs (disputes) | Nothing (proofs are checkable) |
| `web` | api, chain | user txs | Nothing (client verifies) |

**The architectural claim:** no off-chain component is trusted for correctness. Every output it produces is either (a) a transaction whose effect is checked by a contract, or (b) a proof checked against an on-chain commitment. The only trusted components are the contracts themselves and the cryptographic assumptions.
