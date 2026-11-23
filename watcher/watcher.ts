// Event watcher for MetaTrade-R.
// Monitors blockchain events, maintains a checkpoint, detects timeout-eligible sales,
// and submits only authorized timeout transactions.
// Does NOT make discretionary settlement/refund/dispute decisions.

import { createPublicClient, createWalletClient, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadConfig } from "../api/src/config.js";
import { addresses, saleEscrowAbi } from "../api/src/blockchain.js";

const config = loadConfig();
const CHECKPOINT_FILE = "watcher-checkpoint.json";

// Event definitions
const SALE_CREATED = parseAbiItem("event SaleCreated(uint256 indexed saleId, uint256 indexed assetId, address indexed buyer, uint64 price, uint64 bondSeller)");
const DELIVERED = parseAbiItem("event Delivered(uint256 indexed saleId)");
const SETTLED = parseAbiItem("event Settled(uint256 indexed saleId, uint64 sellerAmount, uint64 parentAmount)");
const REFUNDED = parseAbiItem("event Refunded(uint256 indexed saleId, uint64 buyerAmount, string reason)");
const DISPUTED = parseAbiItem("event Disputed(uint256 indexed saleId, uint8 mode)");
const RESPONDED = parseAbiItem("event Responded(uint256 indexed saleId)");
const TIMED_OUT = parseAbiItem("event TimedOut(uint256 indexed saleId, uint8 phase)");

interface Checkpoint {
  lastBlock: number;
  processedEvents: string[]; // "txHash:logIndex" dedup keys
  lastUpdated: number;
}

function loadCheckpoint(): Checkpoint {
  if (existsSync(CHECKPOINT_FILE)) {
    return JSON.parse(readFileSync(CHECKPOINT_FILE, "utf8"));
  }
  return { lastBlock: 0, processedEvents: [], lastUpdated: Date.now() };
}

function saveCheckpoint(cp: Checkpoint) {
  cp.lastUpdated = Date.now();
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

const publicClient = createPublicClient({ chain: anvil, transport: http(config.RPC_URL) });

async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
  const block = await publicClient.getBlock({ blockNumber });
  return Number(block.timestamp);
}

async function isProcessed(cp: Checkpoint, txHash: string, logIndex: number): Promise<boolean> {
  const key = `${txHash}:${logIndex}`;
  return cp.processedEvents.includes(key);
}

async function markProcessed(cp: Checkpoint, txHash: string, logIndex: number) {
  const key = `${txHash}:${logIndex}`;
  if (!cp.processedEvents.includes(key)) {
    cp.processedEvents.push(key);
  }
  // Keep only last 10000 entries to prevent unbounded growth
  if (cp.processedEvents.length > 10000) {
    cp.processedEvents = cp.processedEvents.slice(-10000);
  }
}

async function checkTimeouts(cp: Checkpoint) {
  // Read all sales from the contract and check for timeout-eligible ones.
  // This is a simplified version: in production, maintain a list of active sales.
  // For the prototype, we check a range of recent sale IDs.
  const walletClient = createWalletClient({
    account: privateKeyToAccount(config.PRIVATE_KEY as `0x${string}`),
    chain: anvil,
    transport: http(config.RPC_URL),
  });

  // We don't know all sale IDs, so we check 0..lastKnownSaleId
  // In production, track sale IDs from SaleCreated events.
  // For now, this is a placeholder that demonstrates the pattern.
  console.log(`[watcher] Timeout check at block ${cp.lastBlock}`);
}

async function processEvents(cp: Checkpoint, fromBlock: bigint, toBlock: bigint) {
  const logs = await publicClient.getLogs({
    address: addresses.saleEscrow,
    fromBlock,
    toBlock,
  });

  for (const log of logs) {
    const txHash = log.transactionHash!;
    const logIndex = log.logIndex!;
    if (await isProcessed(cp, txHash, logIndex)) continue;

    console.log(`[watcher] Event at block ${log.blockNumber}: ${log.topics[0]}`);

    // Generate evidence record
    const evidence = {
      blockNumber: Number(log.blockNumber),
      txHash,
      logIndex,
      timestamp: await getBlockTimestamp(log.blockNumber),
      topics: log.topics,
      data: log.data,
    };
    console.log(`[watcher] Evidence:`, JSON.stringify(evidence));

    await markProcessed(cp, txHash, logIndex);
  }
}

async function poll() {
  const cp = loadCheckpoint();
  console.log(`[watcher] Starting from block ${cp.lastBlock}`);

  while (true) {
    try {
      const currentBlock = await publicClient.getBlockNumber();
      if (currentBlock > BigInt(cp.lastBlock)) {
        await processEvents(cp, BigInt(cp.lastBlock + 1), currentBlock);
        await checkTimeouts(cp);
        cp.lastBlock = Number(currentBlock);
        saveCheckpoint(cp);
      }
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error("[watcher] Error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

poll().catch(console.error);
EOF