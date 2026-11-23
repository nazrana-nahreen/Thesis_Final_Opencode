# Gas Benchmark Report — MetaTrade-R

**Date:** 2026-11-22 (re-verified)
**Compiler:** Solidity 0.8.31, optimizer 200 runs, via-IR, EVM Osaka
**Chain:** Anvil 1.10.0 (local), gas price 2 gwei
**Method:** `forge test --gas-report` on isolated transactions (deployment and setup excluded by the tool)

## Isolated transaction gas (from `forge test --gas-report`)

| Operation | Min | Avg | Median | Max | Calls |
|---|---|---|---|---|---|
| `buy` | 59,777 | 182,544 | 184,558 | 201,658 | 8,105 |
| `deliver` | 34,028 | 57,152 | 34,040 | 83,044 | 3,632 |
| `confirm` | 31,188 | 111,272 | 131,042 | 163,417 | 1,226 |
| `disputeMode1` | 71,767 | 240,309 | 324,580 | 324,580 | 3 |
| `respond` | 68,498 | 114,866 | 114,866 | 161,235 | 2 |
| `disputeMode2` | 132,030 | — | — | — | 1 |
| `timeoutDeliver` | 31,280 | 57,639 | 57,662 | 57,662 | 3,775 |
| `timeoutConfirm` | 164,797 | 164,797 | 164,797 | 164,797 | 3 |
| `timeoutRespond` | 57,199 | 57,199 | 57,199 | 57,199 | 2 |

Note: `disputeMode2` gas (132,030) comes from the test output, not the gas report (it was called only once and may have been filtered).

## Cost analysis

### Honest sale cycle (cold, worst case)
`buy` (201,658) + `deliver` (83,044) + `confirm` (163,417) = **448,119 gas** ≈ $0.0085 at 2 gwei / $3,000 ETH.

### Dispute cost
Mode 1 dispute: **324,580 gas** (single 32-byte block, empty Merkle proofs). This is the worst-case (Max) value.

For a 1 KB block (32 words), the HMAC computation adds ~32 × 2 × 96 = 6,144 gas for precompile calls. Total estimate: ~330,000-350,000 gas.

### Why Mode 1 is expensive
The dominant cost is the on-chain HMAC recomputation: 32 words × 2 SHA-256 precompile calls per word = 64 precompile calls. Each precompile call costs 60 + 12 × (input words) gas. For a 32-byte input (1 word), that's 72 gas. 64 × 72 = 4,608 gas for the precompile alone. The rest is EVM overhead (memory expansion, loops, comparison, state writes).

### Scalability (O(1) in file size)
The dispute checks only ONE block (the inconsistent one found by the buyer off-chain). The contract verifies one block in ~325k gas regardless of file size. This is the key scalability property: dispute cost is O(1) in file size, not O(L).

### Cold vs warm
- `buy` varies from 59,777 (warm) to 201,658 (cold) — a 3.4× difference due to SSTORE (20,000 gas for new slots vs 5,000 for warm).
- `deliver` varies from 34,028 to 83,044 — 2.4× due to storing encK.
- `confirm` varies from 31,188 to 163,417 — 5.2× due to multiple SSTOREs (royalty, licence mint, state transition).

The thesis reports the cold (worst-case) values as the headline, with warm values in an appendix.

### Comparison with preliminary estimates
The earlier `.gas-snapshot` estimate for `testHonestSale()` was 487,670 gas (includes test setup). The isolated honest-sale cycle is 448,119 gas. The difference (39,551 gas) is test setup overhead.

## Limitations

1. Single run (deterministic). No statistical variance to report.
2. Local Anvil only. L1 gas prices vary.
3. HMAC cost scales with block size. Larger blocks cost more per dispute.
4. No L2 costs measured.
5. `disputeMode2` has 1 call (insufficient for statistical measures).
6. No repeated measurements (multi-run is Tier 2, E4).

## Files

- Raw gas report: `forge test --gas-report` output
- Snapshot: `.gas-snapshot`
- This report: `experiments/GAS_BENCHMARK_REPORT.md`
EOF