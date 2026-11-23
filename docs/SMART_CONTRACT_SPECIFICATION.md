# SMART CONTRACT SPECIFICATION

**Purpose:** to specify every contract, interface, state variable, invariant, function, event and test obligation precisely enough to implement without further design decisions.

**Solidity:** `0.8.24`, `evm_version = "cancun"`, optimizer on, 200 runs.
**Libraries:** OpenZeppelin 5.x (`ReentrancyGuard`, `ERC1155`, `Ownable2Step` where needed, `SafeCast`).
**Upgradeability:** none. Contracts are immutable. A bug means redeploy. This is a deliberate choice that removes the MetaTrade `initialize` vulnerability class.

---

## 1. Contract map

| Contract | Kind | Tier | Responsibility |
|---|---|---|---|
| `AssetRegistry` | stateful | 1 | Pre-sale commitments, listing state, active flag |
| `SaleEscrow` | stateful, payable | 1 | Per-sale state machine, bonds, timeouts, settlement |
| `DisputeVerifier` | library (pure/view) | 1 | Merkle + keystream consistency check |
| `LicenseToken` | ERC-1155 | 1 | Licence balances |
| `RoyaltySplitter` | stateful, payable | 1 | Pull-payment royalty credits |
| `PlagiarismRegistry` | stateful, payable | 2 | Bonded reports, Hamming comparison |
| `Reputation` | stateful | 2 | Commit-reveal, stake-weighted ratings |
| `StorageBond` | stateful, payable | 3 | Optional pinning bond |

Tier 1 is the thesis core. Tier 2 and 3 are extensions that can be dropped without weakening the central claim.

---

## 2. Interfaces

### 2.1 `IAssetRegistry`

```solidity
interface IAssetRegistry {
    struct Asset {
        address seller;
        bytes32 hD;
        bytes32 hC;
        bytes32 R_D;
        bytes32 R_C;
        bytes32 cK;
        bytes32 leafListD;
        bytes32 leafListC;
        bytes32 previewCid;
        bytes32 fingerprint;
        uint32  m;
        uint32  blockSize;
        uint64  price;
        uint16  royaltyBps;
        address parent;
        bool    active;
        uint64  listedAt;
    }

    event AssetListed(uint256 indexed assetId, address indexed seller, bytes32 hD, bytes32 hC, uint64 price);
    event AssetDeactivated(uint256 indexed assetId, address indexed by, bytes8 reason);

    function list(
        bytes32 hD, bytes32 hC,
        bytes32 R_D, bytes32 R_C, bytes32 cK,
        bytes32 leafListD, bytes32 leafListC,
        bytes32 previewCid, bytes32 fingerprint,
        uint32 m, uint32 blockSize,
        uint64 price, uint16 royaltyBps,
        address parent
    ) external returns (uint256 assetId);

    function deactivate(uint256 assetId, bytes8 reason) external;
    function get(uint256 assetId) external view returns (Asset memory);
    function isActive(uint256 assetId) external view returns (bool);
}
```

### 2.2 `ISaleEscrow`

```solidity
interface ISaleEscrow {
    struct DisputeProof {
        bytes32 K;
        bytes32 N;
        bytes32 s;
        uint256 index;
        bytes   C_i;
        bytes32 leafD;
        bytes32[] proofD;
        bytes32[] proofC;
    }

    event SaleCreated(uint256 indexed saleId, uint256 indexed assetId, address indexed buyer, uint64 price, uint64 bondBuyer);
    event Delivered(uint256 indexed saleId, bytes encK);
    event Settled(uint256 indexed saleId, uint64 sellerAmount, uint64 parentAmount);
    event Refunded(uint256 indexed saleId, uint64 buyerAmount, bytes8 reason);
    event Disputed(uint256 indexed saleId, uint8 mode);
    event Responded(uint256 indexed saleId);
    event TimedOut(uint256 indexed saleId, uint8 phase);

    function buy(uint256 assetId) external payable returns (uint256 saleId);
    function deliver(uint256 saleId, bytes calldata encK) external;
    function confirm(uint256 saleId) external;
    function disputeMode1(uint256 saleId, DisputeProof calldata proof) external;
    function disputeMode2(uint256 saleId) external;
    function respond(uint256 saleId, bytes32 K, bytes32 N, bytes32 s) external;
    function timeoutDeliver(uint256 saleId) external;
    function timeoutConfirm(uint256 saleId) external;
    function timeoutRespond(uint256 saleId) external;
}
```

### 2.3 `DisputeVerifier`

```solidity
library DisputeVerifier {
    /// @notice Verify a Merkle proof with index binding and domain tag 0x09.
    function verifyMerkle(
        bytes32 root,
        bytes32 leaf,
        uint256 index,
        bytes32[] calldata proof
    ) internal pure returns (bool);

    /// @notice Compute HMAC(K_enc, 0x03 || i || j), truncated to 32 bytes.
    function keystreamWord(bytes32 kEnc, uint256 i, uint256 j)
        internal pure returns (bytes32);

    /// @notice XOR a full block with the keystream.
    function decryptBlock(bytes32 kEnc, uint256 i, bytes calldata C_i)
        internal pure returns (bytes memory D_i);

    /// @notice Full consistency check for one block.
    function checkConsistency(
        bytes32 R_D, bytes32 R_C, bytes32 cK,
        bytes32 K, bytes32 N, bytes32 s,
        uint256 i, bytes calldata C_i,
        bytes32 leafD, bytes32[] calldata proofD, bytes32[] calldata proofC
    ) internal view returns (bool consistent);
}
```

---

## 3. State and invariants

### 3.1 `AssetRegistry`

```solidity
mapping(uint256 => Asset) private _assets;
uint256 private _nextAssetId;
uint16  public constant MAX_ROYALTY_BPS = 5000;   // 50%
uint32  public constant MIN_BLOCK = 256;
uint32  public constant MAX_BLOCK = 65536;
```

**Invariants:**

| ID | Invariant |
|---|---|
| `IR-1` | `assetId` is monotonically increasing; never reused |
| `IR-2` | `blockSize ∈ [MIN_BLOCK, MAX_BLOCK]` |
| `IR-3` | `m ≥ 1` and `m · blockSize ≥ L` (checked off-chain; `m` is trusted as the seller's commitment) |
| `IR-4` | `royaltyBps ≤ MAX_ROYALTY_BPS` |
| `IR-5` | `parent == address(0) || (parent listed && parent.active)` |
| `IR-6` | Commitments are write-once; no setter exists after `list` |
| `IR-7` | `active` can only transition `true → false`, never back |

### 3.2 `SaleEscrow`

```solidity
enum State { NONE, ESCROWED, DELIVERED, CHALLENGED, SETTLED, REFUNDED, EXPIRED }

struct Sale {
    address buyer;
    address seller;
    uint256 assetId;
    uint64  price;
    uint64  bondBuyer;
    uint64  bondSeller;
    uint64  tDeliver;
    uint64  tConfirm;
    uint64  tRespond;
    State   state;
    bytes   encK;
    bytes32 revealedK;
    bool    keyRevealed;
}

mapping(uint256 => Sale) private _sales;
uint256 private _nextSaleId;
uint64  public constant DELIVER_WINDOW = 1 days;
uint64  public constant CONFIRM_WINDOW = 2 days;
uint64  public constant RESPOND_WINDOW = 1 days;
uint16  public constant PROTOCOL_FEE_BPS = 0;      // research prototype
```

**Invariants:**

| ID | Invariant |
|---|---|
| `IS-1` | Each sale is in exactly one state; terminal states are absorbing |
| `IS-2` | `state == SETTLED ⇒ seller received price + bondSeller` |
| `IS-3` | `state == REFUNDED ⇒ buyer received price + bondBuyer` |
| `IS-4` | `bondSeller` is escrowed at `buy` (pulled from the seller's pre-funded balance) |
| `IS-5` | No function transfers value twice for the same sale |
| `IS-6` | `price` is snapshotted at `buy`; later registry changes do not affect the sale |
| `IS-7` | `confirm` and `disputeMode1/2` are mutually exclusive |
| `IS-8` | `disputeMode1` is only valid after `DELIVERED` or after a valid `respond` |
| `IS-9` | All value transfers occur after state updates and are guarded by `nonReentrant` |

**Bond funding.** Because a seller bond must be collectible, the seller pre-funds a balance in `SaleEscrow` (`depositBond`) or posts it at `list` time. The specification uses a pre-funded `sellerCredit[address]` mapping; `buy` moves `bondSeller` from that credit into the sale. This avoids a seller front-running a slash by emptying its wallet.

### 3.3 `RoyaltySplitter`

```solidity
mapping(address => uint256) public credits;
```

**Invariants:** `credits` only increases via `credit`; decreases only via `withdraw`; `withdraw` uses `call{value:}` and a reentrancy guard.

---

## 4. Function specifications

### 4.1 `AssetRegistry.list`

| Item | Specification |
|---|---|
| Access | anyone |
| Pre | `blockSize` in range; `royaltyBps ≤ MAX`; `parent` active or zero; `price > 0`; `m ≥ 1` |
| Post | new `Asset` stored; `active = true`; `AssetListed` emitted |
| Effects | `_nextAssetId++` |
| Gas (est.) | 180–250k (10+ SSTOREs) |

### 4.2 `AssetRegistry.deactivate`

| Item | Specification |
|---|---|
| Access | `seller` or `owner` (protocol admin, for plagiarism rulings only) |
| Pre | asset exists; `active == true` |
| Post | `active = false`; `AssetDeactivated` emitted |
| Note | Does not affect sales already in `ESCROWED`/`DELIVERED`; those complete or time out |

### 4.3 `SaleEscrow.buy`

| Item | Specification |
|---|---|
| Access | anyone (buyer) |
| Pre | asset active; `msg.value == price + bondBuyer`; seller credit ≥ bondSeller |
| Post | sale stored; `price` snapshotted; `state = ESCROWED`; deadlines set; `SaleCreated` emitted |
| Reverts | wrong payment; inactive asset; self-purchase (`msg.sender == seller`) |
| Gas (est.) | 120–180k |

**Self-purchase is blocked** to prevent wash trading and rating manipulation.

### 4.4 `SaleEscrow.deliver`

| Item | Specification |
|---|---|
| Access | `seller` |
| Pre | `state == ESCROWED`; `block.timestamp ≤ tDeliver`; `encK.length ∈ [64, 256]` |
| Post | `encK` stored; `state = DELIVERED`; `Delivered` emitted |
| Reverts | wrong state; late; oversized `encK` |
| Gas (est.) | 60–90k (stores up to 256 bytes) |

### 4.5 `SaleEscrow.confirm`

| Item | Specification |
|---|---|
| Access | `buyer` |
| Pre | `state == DELIVERED`; `block.timestamp ≤ tConfirm` |
| Post | seller credited `price`; `bondSeller` returned to seller credit; `bondBuyer` returned to buyer; `RoyaltySplitter.credit` for child and parent; licence minted; `state = SETTLED`; `Settled` emitted |
| Reverts | wrong state; late; caller not buyer |
| Gas (est.) | 90–140k (royalty credits + ERC-1155 mint) |

### 4.6 `SaleEscrow.disputeMode1`

| Item | Specification |
|---|---|
| Access | `buyer` |
| Pre | `state == DELIVERED` (or `CHALLENGED` with `keyRevealed`); `block.timestamp ≤ tConfirm` |
| Checks | `DisputeVerifier.checkConsistency(...)` |
| Post if consistent | buyer's claim false → seller paid; buyer bond forfeited to seller; `state = SETTLED` |
| Post if inconsistent | seller cheated → buyer refunded `price + bondBuyer`; seller bond slashed to buyer; `state = REFUNDED` |
| Reverts | wrong state; invalid proof format (not "inconsistent") |
| Gas (est.) | 40–80k (two Merkle proofs + `β/32` HMACs) |

**Important distinction:** a malformed proof reverts (the buyer can retry); a well-formed proof that shows consistency resolves against the buyer. The two cases must not be conflated, or a buyer could grief by submitting garbage.

### 4.7 `SaleEscrow.disputeMode2`

| Item | Specification |
|---|---|
| Access | `buyer` |
| Pre | `state == DELIVERED`; `block.timestamp ≤ tConfirm` |
| Post | `state = CHALLENGED`; `tRespond = now + RESPOND_WINDOW`; `Disputed(2)` emitted |
| Note | Does not move funds; it opens a window for the seller to prove delivery |

### 4.8 `SaleEscrow.respond`

| Item | Specification |
|---|---|
| Access | `seller` |
| Pre | `state == CHALLENGED`; `block.timestamp ≤ tRespond`; `H(0x08 || K || N || s) == cK` |
| Post | `revealedK = K`; `keyRevealed = true`; `state = DELIVERED`; `Responded` emitted |
| Reverts | wrong state; late; invalid key |
| Note | After a valid reveal, the content is public and the buyer may run Mode 1 on any block |

**Bond rule after a Mode 2 reveal.** If the seller reveals a valid key and the buyer then runs Mode 1, the buyer's bond is **returned** whether the chunk is consistent or not. Rationale: the buyer's original claim was non-delivery, and the contract cannot prove whether the delivered `encK` was well-formed (ECIES decryption is not verifiable on-chain). Punishing the buyer would deter legitimate complaints about a bad key. The cost is a bounded griefing vector: a buyer can force a reveal by paying gas, but it already holds the content, so it gains nothing it could not get by leaking directly. This is recorded as a residual risk, not hidden.

### 4.9 Timeouts

| Function | Access | Pre | Post |
|---|---|---|---|
| `timeoutDeliver` | anyone | `state == ESCROWED`; `now > tDeliver` | refund buyer; slash seller; `REFUNDED` |
| `timeoutConfirm` | seller | `state == DELIVERED`; `now > tConfirm` | pay seller; `SETTLED` |
| `timeoutRespond` | anyone | `state == CHALLENGED`; `now > tRespond` | refund buyer; slash seller; `REFUNDED` |

**Why `timeoutConfirm` favours the seller:** the buyer had `CONFIRM_WINDOW` to verify and dispute. If it did nothing, it is deemed satisfied. The alternative (indefinite escrow) is worse.

### 4.10 `RoyaltySplitter.credit` / `withdraw`

| Function | Access | Effect |
|---|---|---|
| `credit(address, uint256)` | `SaleEscrow` only | `credits[account] += amount` |
| `withdraw()` | anyone | `amount = credits[msg.sender]; credits[msg.sender] = 0; call{value: amount}` |

---

## 5. State machine

```
                 buy                  deliver                confirm
  LISTED ─────────────▶ ESCROWED ─────────────▶ DELIVERED ─────────────▶ SETTLED
    │                     │                       │  │
    │ deactivate          │ timeoutDeliver        │  │ disputeMode1 (consistent)
    ▼                     ▼                       │  └──────────────────▶ SETTLED
  (inactive)          REFUNDED ◀──────────────────┘
                          ▲                       │ disputeMode1 (inconsistent)
                          │                       └──────────────────▶ REFUNDED
                          │
                          │ timeoutRespond
                     CHALLENGED ◀── disputeMode2 ── DELIVERED
                          │
                          │ respond (valid cK)
                          ▼
                      DELIVERED
```

Terminal states: `SETTLED`, `REFUNDED`, `EXPIRED`. No transition leaves a terminal state.

---

## 6. Security considerations

| Concern | Mitigation | Test |
|---|---|---|
| Reentrancy on payout | CEI; `nonReentrant`; pull payments for royalties | AT-30, invariant test |
| Access control | `onlySeller`, `onlyBuyer`, `onlyEscrow` modifiers | unit tests per function |
| Integer overflow | Solidity 0.8 checked arithmetic; `SafeCast` | fuzz |
| Timestamp manipulation | bounded windows; `δ_t` tolerance; no sub-minute windows | AT-17 |
| Front-running | fixed price; no auction; purchase is atomic | review |
| Griefing | Mode 1 requires no seller response; per-sale state is O(1) | AT-13 |
| DoS via large blocks | `blockSize ≤ 65536`; `m` bounded by asset size; dispute calldata bounded | gas test |
| Storage exhaustion | listing requires a bond or fee; `m` bounded | review |
| Signature replay | no off-chain signatures in Tier 1; if added, EIP-712 with `chainId` + `verifyingContract` + nonce + deadline | AT-29 |
| `initialize` takeover | **no `initialize` function exists** | AT-05 |
| De-listed asset trading | `buy`/`deliver` read `isActive` | AT-07 |
| Price change | snapshot at `buy` | AT-06 |
| Excess payment | exact-payment check | AT-08 |
| Shared balance wiping | per-sale escrow; no shared mutable balance | AT-09 |
| `.transfer` failure | `call{value:}` | AT-10 |
| Royalty drain | `royaltyBps ≤ 5000`; parent-set; invariant | AT-24 |
| Self-purchase / wash trading | `msg.sender != seller` | review |

**Known residual risks (documented, not fixed):**

- A seller can reveal `K` late in Mode 2 and still be paid, imposing gas cost on the buyer (AT-03).
- A buyer can force a public key reveal via Mode 2 at gas cost, but it already holds the content, so no marginal value is gained (AT-14).
- A dispute publishes `K`, so the content becomes public (AT-14).
- Fingerprints are self-reported; a bonded challenge is needed to keep them honest (AT-21).
- No on-chain enforcement of licence expiry; it is metadata only.

---

## 7. Events and indexing

All state-changing functions emit an event with `saleId` or `assetId` indexed. The indexer (`api`) subscribes to:

```
AssetListed, AssetDeactivated,
SaleCreated, Delivered, Settled, Refunded, Disputed, Responded, TimedOut,
RoyaltyCredited, Withdrawn,
ReportFiled, PlagiarismConfirmed, ReportRejected,
RatingCommitted, RatingRevealed
```

Events are the only source for the UI's historical view; no off-chain database is authoritative.

---

## 8. Upgrade policy

**None.** No proxy, no `initialize`, no admin setters on commitments. The only privileged role is a `protocolAdmin` that can:

- update `MAX_ROYALTY_BPS` within a hard-coded ceiling (governance parameter),
- deactivate an asset after a validated plagiarism ruling,
- pause `buy` in an emergency (not `confirm`, `dispute`, or timeouts, so funds can always exit).

The admin **cannot** move funds, change commitments, or adjudicate integrity disputes. This is the minimum privilege consistent with operational safety, and it is a deliberate reduction from MetaTrade's owner-only plagiarism adjudication.

---

## 9. Test plan

### 9.1 Unit tests (Foundry)

One test file per contract; every function has happy-path, revert-path and boundary tests.

### 9.2 Invariant tests (Foundry `invariant_`)

| Invariant | Assertion |
|---|---|
| Funds conservation | `address(escrow).balance == Σ active sale escrows + Σ seller credits` |
| Single terminal state | no sale is in two terminal states |
| No double payout | each sale pays at most once |
| Bond solvency | every slash is covered by escrowed funds |
| Monotonic asset ids | `assetId` never reused |
| Royalty sum | `child + parent == price` |

### 9.3 Fuzz tests

- Merkle proof verification with random trees, indices, and malformed proofs.
- Keystream consistency with random keys, blocks, and lengths.
- Bond arithmetic with random values near boundaries.

### 9.4 Adversarial tests

Each of AT-01…AT-30 from `THREAT_MODEL.md` is a scripted test with an explicit success criterion. The harness records whether the attack succeeded, the gas cost to the attacker, and the gas cost to the defender.

### 9.5 Static analysis

- Slither: no high/medium findings unresolved.
- `solhint`: style and best-practice.
- Manual review of every `call{value:}` and every state transition.

### 9.6 Gas snapshots

`forge snapshot` for every function; committed to the repository so regressions are visible.

---

## 10. Deployment sequence

```
1. deploy RoyaltySplitter
2. deploy AssetRegistry
3. deploy DisputeVerifier (linked library)
4. deploy SaleEscrow(registry, royaltySplitter, verifier)
5. deploy LicenseToken(escrow)
6. wire: royaltySplitter.setEscrow(escrow); licenseToken.setMinter(escrow)
7. transfer ownership of registry/escrow to a multisig (or renounce for the prototype)
```

No `initialize` calls. Constructor arguments only. This is checked by a deployment test that asserts `owner` is set and no re-initialisation function exists.
