// Event watcher for MetaTrade-R.
// Monitors blockchain events, maintains a checkpoint, detects timeout-eligible sales,
// and submits only authorized timeout transactions.
// Does NOT make discretionary settlement/refund/dispute decisions.

import { createPublicClient, createWalletClient, custom, http, parseAbiItem } from "viem";
import type { Log, PublicClient, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../api/src/config.js";
import { addresses, saleEscrowAbi } from "../api/src/blockchain.js";

export const CHECKPOINT_FILE = "watcher-checkpoint.json";
export const MAX_PROCESSED_EVENTS = 10000;

// Event definitions
const SALE_CREATED = parseAbiItem("event SaleCreated(uint256 indexed saleId, uint256 indexed assetId, address indexed buyer, uint64 price, uint64 bondSeller)");
const DELIVERED = parseAbiItem("event Delivered(uint256 indexed saleId)");
const SETTLED = parseAbiItem("event Settled(uint256 indexed saleId, uint64 sellerAmount, uint64 parentAmount)");
const REFUNDED = parseAbiItem("event Refunded(uint256 indexed saleId, uint64 buyerAmount, string reason)");
const DISPUTED = parseAbiItem("event Disputed(uint256 indexed saleId, uint8 mode)");
const RESPONDED = parseAbiItem("event Responded(uint256 indexed saleId)");
const TIMED_OUT = parseAbiItem("event TimedOut(uint256 indexed saleId, uint8 phase)");

const nextSaleIdAbi = [
  { name: "nextSaleId", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

export interface Checkpoint {
  lastBlock: number;
  processedEvents: string[]; // "txHash:logIndex" dedup keys
  lastUpdated: number;
}

export interface ProcessEventsOptions {
  publicClient: PublicClient;
  address: `0x${string}`;
  checkpoint: Checkpoint;
  fromBlock: bigint;
  toBlock: bigint;
  onEvent?: (log: Log) => void | Promise<void>;
}

export interface ProcessEventsResult {
  processed: number;
  checkpoint: Checkpoint;
}

export interface SaleView {
  buyer: `0x${string}`;
  seller: `0x${string}`;
  assetId: bigint;
  price: bigint;
  bondBuyer: bigint;
  bondSeller: bigint;
  tDeliver: bigint;
  tConfirm: bigint;
  tRespond: bigint;
  state: number;
  encK: `0x${string}`;
  revealedK: `0x${string}`;
  revealedN: `0x${string}`;
  revealedS: `0x${string}`;
  keyRevealed: boolean;
}

export type TimeoutActionName = "timeoutDeliver" | "timeoutConfirm" | "timeoutRespond";

export interface TimeoutAction {
  saleId: number;
  action: TimeoutActionName;
  reason: string;
}

export interface ScanTimeoutsOptions {
  publicClient: PublicClient;
  escrowAddress: `0x${string}`;
  fromSaleId: number | bigint;
  toSaleId: number | bigint;
  now: number | bigint;
}

export type SubmissionStatus = "submitted" | "failed";

export interface TimeoutSubmission {
  saleId: number;
  action: TimeoutActionName;
  status: SubmissionStatus;
  txHash?: `0x${string}`;
  error?: string;
}

export interface SubmitTimeoutsOptions {
  walletClient: WalletClient;
  escrowAddress: `0x${string}`;
  actions: readonly TimeoutAction[];
  publicClient?: PublicClient;
}

export interface RunOnceOptions {
  publicClient: PublicClient;
  address: `0x${string}`;
  checkpoint: Checkpoint;
  checkpointPath?: string;
  fromBlock?: bigint;
  toBlock?: bigint;
  scan?: boolean;
  fromSaleId?: number | bigint;
  toSaleId?: number | bigint;
  now?: number | bigint;
  walletClient?: WalletClient;
  submit?: boolean;
  onEvent?: (log: Log) => void | Promise<void>;
}

export interface RunOnceResult {
  processed: number;
  checkpoint: Checkpoint;
  fromBlock: bigint;
  toBlock: bigint;
  actions: TimeoutAction[];
  submissions: TimeoutSubmission[];
}

function trimProcessed(events: string[]): string[] {
  return events.length > MAX_PROCESSED_EVENTS ? events.slice(-MAX_PROCESSED_EVENTS) : events;
}

export function loadCheckpoint(path: string): Checkpoint {
  if (!existsSync(path)) {
    return { lastBlock: 0, processedEvents: [], lastUpdated: Date.now() };
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Checkpoint>;
  const lastBlock = Number.isFinite(Number(raw.lastBlock)) ? Math.max(0, Math.trunc(Number(raw.lastBlock))) : 0;
  const processedEvents = Array.isArray(raw.processedEvents)
    ? trimProcessed(raw.processedEvents.filter((key): key is string => typeof key === "string"))
    : [];
  const lastUpdated = Number.isFinite(Number(raw.lastUpdated)) ? Number(raw.lastUpdated) : Date.now();
  return { lastBlock, processedEvents, lastUpdated };
}

export function saveCheckpoint(path: string, cp: Checkpoint): void {
  cp.lastBlock = Math.max(0, Math.trunc(Number(cp.lastBlock)));
  cp.processedEvents = trimProcessed(cp.processedEvents.slice());
  cp.lastUpdated = Date.now();

  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(cp, null, 2));
    renameSync(tempPath, path);
  } catch (err) {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      // best-effort temp cleanup
    }
    throw err;
  }
}

export async function processEvents({
  publicClient,
  address,
  checkpoint,
  fromBlock,
  toBlock,
  onEvent,
}: ProcessEventsOptions): Promise<ProcessEventsResult> {
  if (fromBlock > toBlock) {
    return { processed: 0, checkpoint };
  }

  const logs = await publicClient.getLogs({ address, fromBlock, toBlock });
  const seen = new Set(checkpoint.processedEvents);
  let processed = 0;

  for (const log of logs) {
    if (!log.transactionHash || log.logIndex === null || log.logIndex === undefined) {
      throw new Error("Log is missing transactionHash or logIndex");
    }

    const key = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(key)) continue;

    await onEvent?.(log);

    seen.add(key);
    checkpoint.processedEvents.push(key);
    checkpoint.processedEvents = trimProcessed(checkpoint.processedEvents);
    processed++;
    console.log(`[watcher] Event ${log.topics[0]} at block ${log.blockNumber} (${key})`);
  }

  // Only advance once every log in the range has been handled successfully.
  checkpoint.lastBlock = Math.max(checkpoint.lastBlock, Number(toBlock));
  return { processed, checkpoint };
}

export async function scanTimeouts({
  publicClient,
  escrowAddress,
  fromSaleId,
  toSaleId,
  now,
}: ScanTimeoutsOptions): Promise<TimeoutAction[]> {
  const from = Number(fromSaleId);
  const to = Number(toSaleId);
  const nowSeconds = BigInt(now);
  const actions: TimeoutAction[] = [];

  for (let saleId = from; saleId <= to; saleId++) {
    const sale = (await publicClient.readContract({
      address: escrowAddress,
      abi: saleEscrowAbi,
      functionName: "getSale",
      args: [BigInt(saleId)],
    })) as unknown as SaleView;

    const state = Number(sale.state);
    const tDeliver = BigInt(sale.tDeliver);
    const tConfirm = BigInt(sale.tConfirm);
    const tRespond = BigInt(sale.tRespond);

    if (state === 1 && nowSeconds > tDeliver) {
      actions.push({
        saleId,
        action: "timeoutDeliver",
        reason: `ESCROWED past tDeliver (now=${nowSeconds}, tDeliver=${tDeliver})`,
      });
    } else if (state === 2 && nowSeconds > tConfirm) {
      actions.push({
        saleId,
        action: "timeoutConfirm",
        reason: `DELIVERED past tConfirm (now=${nowSeconds}, tConfirm=${tConfirm})`,
      });
    } else if (state === 3 && nowSeconds > tRespond) {
      actions.push({
        saleId,
        action: "timeoutRespond",
        reason: `CHALLENGED past tRespond (now=${nowSeconds}, tRespond=${tRespond})`,
      });
    }
  }

  return actions;
}

export async function submitTimeouts({
  walletClient,
  escrowAddress,
  actions,
  publicClient,
}: SubmitTimeoutsOptions): Promise<TimeoutSubmission[]> {
  const reader =
    publicClient ??
    createPublicClient({
      chain: walletClient.chain ?? anvil,
      transport: custom({ request: walletClient.request as any }),
    });

  const results: TimeoutSubmission[] = [];

  for (const action of actions) {
    try {
      if (!walletClient.account) {
        throw new Error("walletClient has no account");
      }

      // Simulate first: this catches guard reverts (Early/BadState/wrong caller)
      // before spending gas, and never aborts the rest of the batch.
      const { request } = await reader.simulateContract({
        address: escrowAddress,
        abi: saleEscrowAbi,
        functionName: action.action,
        args: [BigInt(action.saleId)],
        account: walletClient.account,
      } as any);

      const txHash = await walletClient.writeContract(request as any);
      results.push({ saleId: action.saleId, action: action.action, status: "submitted", txHash });
    } catch (err) {
      results.push({
        saleId: action.saleId,
        action: action.action,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export async function runOnce(options: RunOnceOptions): Promise<RunOnceResult> {
  const { publicClient, address, checkpoint } = options;
  const fromBlock = options.fromBlock ?? BigInt(checkpoint.lastBlock + 1);
  const toBlock = options.toBlock ?? (await publicClient.getBlockNumber());

  let processed = 0;
  if (fromBlock <= toBlock) {
    const result = await processEvents({
      publicClient,
      address,
      checkpoint,
      fromBlock,
      toBlock,
      onEvent: options.onEvent,
    });
    processed = result.processed;
    // Persist only after the range was processed successfully.
    if (options.checkpointPath) saveCheckpoint(options.checkpointPath, checkpoint);
  }

  let actions: TimeoutAction[] = [];
  if (options.scan !== false) {
    let fromSaleId = options.fromSaleId;
    let toSaleId = options.toSaleId;
    if (fromSaleId === undefined || toSaleId === undefined) {
      const nextSaleId = (await publicClient.readContract({
        address,
        abi: nextSaleIdAbi,
        functionName: "nextSaleId",
      })) as bigint;
      fromSaleId ??= 0;
      toSaleId ??= Number(nextSaleId) - 1;
    }

    const now =
      options.now ??
      Number((await publicClient.getBlock({ blockTag: "latest" })).timestamp);

    if (Number(fromSaleId) <= Number(toSaleId)) {
      actions = await scanTimeouts({
        publicClient,
        escrowAddress: address,
        fromSaleId,
        toSaleId,
        now,
      });
    }
  }

  const submissions =
    options.walletClient && options.submit !== false
      ? await submitTimeouts({
          walletClient: options.walletClient,
          escrowAddress: address,
          actions,
        })
      : [];

  return { processed, checkpoint, fromBlock, toBlock, actions, submissions };
}

export async function main(): Promise<void> {
  const config = loadConfig();
  const checkpointPath = process.env.WATCHER_CHECKPOINT_FILE ?? CHECKPOINT_FILE;

  const publicClient = createPublicClient({ chain: anvil, transport: http(config.RPC_URL) });
  const walletClient = config.PRIVATE_KEY
    ? createWalletClient({
        account: privateKeyToAccount(config.PRIVATE_KEY as `0x${string}`),
        chain: anvil,
        transport: http(config.RPC_URL),
      })
    : undefined;

  let checkpoint = loadCheckpoint(checkpointPath);
  console.log(`[watcher] Starting from block ${checkpoint.lastBlock} (${config.RPC_URL})`);

  while (true) {
    try {
      const result = await runOnce({
        publicClient,
        address: addresses.saleEscrow,
        checkpoint,
        checkpointPath,
        walletClient,
        submit: Boolean(walletClient),
      });
      checkpoint = result.checkpoint;

      if (result.processed > 0) {
        console.log(`[watcher] Processed ${result.processed} event(s) up to block ${result.toBlock}`);
      }
      if (result.actions.length > 0) {
        console.log(`[watcher] Timeout actions: ${result.actions.map((a) => `${a.action}(${a.saleId})`).join(", ")}`);
      }
      for (const submission of result.submissions) {
        const detail = submission.txHash ?? submission.error ?? "";
        console.log(`[watcher] ${submission.action}(${submission.saleId}): ${submission.status} ${detail}`);
      }

      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error("[watcher] Error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryPoint) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
