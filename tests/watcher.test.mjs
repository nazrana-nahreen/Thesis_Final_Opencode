// Integration tests for the MetaTrade-R event watcher.
// Run with: npx tsc && node --test tests/watcher.test.mjs
// Requires Foundry's anvil on port 8546 (spawned automatically if absent) and
// previously built artifacts in out/<Contract>.sol/<Contract>.json.

import { test, describe, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPublicClient, createWalletClient, http, parseEther, toHex, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";

const RPC = "http://127.0.0.1:8546";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WATCHER_DIST = join(ROOT, "dist", "watcher", "watcher.js");

if (!existsSync(WATCHER_DIST)) {
  console.error("dist/watcher/watcher.js is missing. Run `npx tsc` before the watcher tests.");
  process.exit(1);
}

// Point the imported api config at the test chain before importing the watcher.
process.env.RPC_URL = process.env.RPC_URL ?? RPC;
const watcher = await import(pathToFileURL(WATCHER_DIST).href);

const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const BUYER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ACCOUNT_0 = privateKeyToAccount(DEPLOYER_KEY);
const ACCOUNT_1 = privateKeyToAccount(BUYER_KEY);

const PRICE = parseEther("0.001");
const BUYER_BOND = parseEther("0.001");
const DAY = 86400;

const TMP_ROOT = mkdtempSync(join(tmpdir(), "metatrade-watcher-"));
let anvilProc = null;
let anvilStderr = "";
let ownsAnvil = false;
let publicClient;
let sellerWallet;
let buyerWallet;
let registry;
let royalty;
let licence;
let escrow;
let registryAbi;
let escrowAbi;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function ensureAnvil() {
  if (await portOpen(8546)) {
    return;
  }

  const candidates = [
    process.env.ANVIL_BIN,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, ".foundry", "bin", "anvil.exe") : null,
    "anvil",
  ].filter(Boolean);
  const bin = candidates.find((candidate) => candidate === "anvil" || existsSync(candidate));

  anvilProc = spawn(bin, ["--port", "8546", "--silent"], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  ownsAnvil = true;
  anvilProc.stderr.on("data", (chunk) => {
    anvilStderr += chunk.toString();
  });

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (anvilProc.exitCode !== null) {
      throw new Error(`anvil exited early (code ${anvilProc.exitCode}): ${anvilStderr}`);
    }
    if (await portOpen(8546)) {
      return;
    }
    await delay(200);
  }
  throw new Error(`anvil did not start on ${RPC}: ${anvilStderr}`);
}

function artifact(name) {
  const path = join(ROOT, "out", `${name}.sol`, `${name}.json`);
  const json = JSON.parse(readFileSync(path, "utf8"));
  assert.ok(json.bytecode && json.bytecode.object, `${name} bytecode missing; run forge build`);
  const code = json.bytecode.object;
  return { abi: json.abi, bytecode: code.startsWith("0x") ? code : `0x${code}` };
}

async function waitTx(hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

async function deploy(art, args = []) {
  const hash = await sellerWallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args });
  const receipt = await waitTx(hash);
  assert.ok(receipt.contractAddress, "deployment produced no address");
  return receipt.contractAddress;
}

let saleSeed = 0;

async function createSale() {
  saleSeed += 1;
  const seed = keccak256(toHex(`watcher-test-${Date.now()}-${saleSeed}`));
  const nextAssetId = await publicClient.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "nextAssetId",
  });

  await waitTx(
    await sellerWallet.writeContract({
      address: registry,
      abi: registryAbi,
      functionName: "list",
      args: [seed, seed, seed, seed, seed, seed, seed, seed, seed, 1, 256, PRICE, 0, 0n],
    }),
  );

  await waitTx(
    await sellerWallet.writeContract({
      address: escrow,
      abi: escrowAbi,
      functionName: "depositBond",
      args: [],
      value: PRICE,
    }),
  );

  const nextSaleId = await publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "nextSaleId",
  });

  const receipt = await waitTx(
    await buyerWallet.writeContract({
      address: escrow,
      abi: escrowAbi,
      functionName: "buy",
      args: [nextAssetId],
      value: PRICE + BUYER_BOND,
    }),
  );

  return { saleId: Number(nextSaleId), assetId: Number(nextAssetId), buyBlock: receipt.blockNumber };
}

async function deliver(saleId) {
  await waitTx(
    await sellerWallet.writeContract({
      address: escrow,
      abi: escrowAbi,
      functionName: "deliver",
      args: [BigInt(saleId), `0x${"11".repeat(32)}`],
    }),
  );
}

async function disputeMode2(saleId) {
  await waitTx(
    await buyerWallet.writeContract({
      address: escrow,
      abi: escrowAbi,
      functionName: "disputeMode2",
      args: [BigInt(saleId)],
    }),
  );
}

async function getSale(saleId) {
  return publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "getSale",
    args: [BigInt(saleId)],
  });
}

async function latestTimestamp() {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return block.timestamp;
}

async function increaseTime(seconds) {
  await publicClient.request({ method: "evm_increaseTime", params: [seconds] });
  await publicClient.request({ method: "evm_mine", params: [] });
}

async function scan(saleId, now) {
  return watcher.scanTimeouts({
    publicClient,
    escrowAddress: escrow,
    fromSaleId: saleId,
    toSaleId: saleId,
    now,
  });
}

before(async () => {
  await ensureAnvil();

  publicClient = createPublicClient({ chain: anvil, transport: http(RPC) });
  sellerWallet = createWalletClient({ account: ACCOUNT_0, chain: anvil, transport: http(RPC) });
  buyerWallet = createWalletClient({ account: ACCOUNT_1, chain: anvil, transport: http(RPC) });

  const registryArt = artifact("AssetRegistry");
  const royaltyArt = artifact("RoyaltySplitter");
  const licenceArt = artifact("LicenceToken");
  const escrowArt = artifact("SaleEscrow");
  registryAbi = registryArt.abi;
  escrowAbi = escrowArt.abi;

  registry = await deploy(registryArt);
  royalty = await deploy(royaltyArt);
  licence = await deploy(licenceArt);
  escrow = await deploy(escrowArt, [registry, royalty, licence]);

  await waitTx(await sellerWallet.writeContract({ address: royalty, abi: royaltyArt.abi, functionName: "setEscrow", args: [escrow] }));
  await waitTx(await sellerWallet.writeContract({ address: licence, abi: licenceArt.abi, functionName: "setMinter", args: [escrow] }));
});

after(async () => {
  if (ownsAnvil && anvilProc && anvilProc.exitCode === null) {
    anvilProc.kill();
    await Promise.race([
      new Promise((resolve) => anvilProc.once("exit", resolve)),
      delay(3000),
    ]);
  }
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("checkpoint", () => {
  test("roundtrip persists state and caps processedEvents at 10000", () => {
    const dir = join(TMP_ROOT, "roundtrip");
    const path = join(dir, "checkpoint.json");
    const events = Array.from({ length: 10025 }, (_, i) => `0x${i.toString(16)}:${i}`);

    watcher.saveCheckpoint(path, { lastBlock: 123, processedEvents: events, lastUpdated: 0 });
    const cp = watcher.loadCheckpoint(path);

    assert.equal(cp.lastBlock, 123);
    assert.equal(cp.processedEvents.length, 10000);
    assert.equal(cp.processedEvents[0], events[events.length - 10000]);
    assert.equal(cp.processedEvents.at(-1), events.at(-1));
    assert.ok(cp.lastUpdated > 0);
    assert.deepEqual(readdirSync(dir), ["checkpoint.json"], "atomic save should leave no temp file");
  });

  test("missing checkpoint returns empty defaults", () => {
    const cp = watcher.loadCheckpoint(join(TMP_ROOT, "does-not-exist", "checkpoint.json"));
    assert.equal(cp.lastBlock, 0);
    assert.deepEqual(cp.processedEvents, []);
  });
});

describe("processEvents", () => {
  test("records a SaleCreated event exactly once across repeated ranges", async () => {
    const { buyBlock } = await createSale();
    const path = join(TMP_ROOT, "events", "checkpoint.json");
    const cp = watcher.loadCheckpoint(path);
    const seen = [];

    const first = await watcher.processEvents({
      publicClient,
      address: escrow,
      checkpoint: cp,
      fromBlock: buyBlock,
      toBlock: buyBlock,
      onEvent: (log) => seen.push(log),
    });

    assert.equal(first.processed, 1);
    assert.equal(seen.length, 1);
    assert.equal(cp.lastBlock, Number(buyBlock));
    assert.equal(cp.processedEvents.length, 1);
    watcher.saveCheckpoint(path, cp);

    const reloaded = watcher.loadCheckpoint(path);
    const second = await watcher.processEvents({
      publicClient,
      address: escrow,
      checkpoint: reloaded,
      fromBlock: buyBlock,
      toBlock: buyBlock,
      onEvent: (log) => seen.push(log),
    });

    assert.equal(second.processed, 0);
    assert.equal(seen.length, 1);
    assert.equal(reloaded.processedEvents.length, 1);
  });
});

describe("scanTimeouts", () => {
  test("timeoutDeliver appears only after the deliver deadline", async () => {
    const { saleId } = await createSale();
    const sale = await getSale(saleId);

    const atDeadline = await scan(saleId, sale.tDeliver);
    assert.deepEqual(atDeadline, [], "timeout is early at exactly tDeliver");

    await increaseTime(DAY + 1);
    const now = await latestTimestamp();
    const actions = await scan(saleId, now);

    assert.equal(actions.length, 1);
    assert.equal(actions[0].saleId, saleId);
    assert.equal(actions[0].action, "timeoutDeliver");
    assert.match(actions[0].reason, /tDeliver/);
  });

  test("detects timeoutConfirm for DELIVERED and timeoutRespond for CHALLENGED", async () => {
    const confirmed = await createSale();
    await deliver(confirmed.saleId);
    const deliveredSale = await getSale(confirmed.saleId);
    assert.equal(Number(deliveredSale.state), 2);
    assert.deepEqual(await scan(confirmed.saleId, deliveredSale.tConfirm), []);

    await increaseTime(3 * DAY + 60);
    let actions = await scan(confirmed.saleId, await latestTimestamp());
    assert.equal(actions.length, 1);
    assert.equal(actions[0].action, "timeoutConfirm");
    assert.match(actions[0].reason, /tConfirm/);

    const challenged = await createSale();
    await deliver(challenged.saleId);
    await disputeMode2(challenged.saleId);
    const challengedSale = await getSale(challenged.saleId);
    assert.equal(Number(challengedSale.state), 3);
    assert.ok(challengedSale.tRespond > 0n);

    assert.deepEqual(await scan(challenged.saleId, challengedSale.tRespond), []);

    await increaseTime(DAY + 1);
    actions = await scan(challenged.saleId, await latestTimestamp());
    assert.equal(actions.length, 1);
    assert.equal(actions[0].action, "timeoutRespond");
    assert.match(actions[0].reason, /tRespond/);
  });
});

describe("submitTimeouts", () => {
  test("submits an eligible timeoutDeliver and reports an ineligible action without throwing", async () => {
    const eligible = await createSale();
    await increaseTime(DAY + 1);
    const eligibleSale = await getSale(eligible.saleId);

    const ineligible = await createSale();
    const ineligibleSale = await getSale(ineligible.saleId);
    const now = await latestTimestamp();

    assert.ok(now > eligibleSale.tDeliver, "eligible sale must be past its deliver deadline");
    assert.ok(now <= ineligibleSale.tDeliver, "ineligible sale must still be before its deadline");

    const actions = await scan(eligible.saleId, now);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].action, "timeoutDeliver");

    const batch = [
      ...actions,
      { saleId: ineligible.saleId, action: "timeoutDeliver", reason: "test: not yet eligible" },
    ];
    const results = await watcher.submitTimeouts({
      walletClient: sellerWallet,
      escrowAddress: escrow,
      actions: batch,
    });

    assert.equal(results.length, 2);
    assert.equal(results[0].status, "submitted", results[0].error);
    assert.ok(results[0].txHash);
    assert.equal(results[1].status, "failed");
    assert.ok(results[1].error, "ineligible submission should include an error");

    await waitTx(results[0].txHash);

    const refunded = await getSale(eligible.saleId);
    assert.equal(Number(refunded.state), 5, "timeoutDeliver should refund the sale");

    const untouched = await getSale(ineligible.saleId);
    assert.equal(Number(untouched.state), 1, "ineligible sale must remain ESCROWED");
  });
});

describe("runOnce", () => {
  test("provider getLogs failure rejects without advancing the on-disk checkpoint", async () => {
    const path = join(TMP_ROOT, "provider-error", "checkpoint.json");
    watcher.saveCheckpoint(path, {
      lastBlock: 42,
      processedEvents: ["0xdeadbeef:0"],
      lastUpdated: 0,
    });
    const cp = watcher.loadCheckpoint(path);

    const failingClient = {
      getLogs: async () => {
        throw new Error("getLogs boom");
      },
    };

    await assert.rejects(
      () =>
        watcher.runOnce({
          publicClient: failingClient,
          address: escrow,
          checkpoint: cp,
          checkpointPath: path,
          fromBlock: 43n,
          toBlock: 50n,
          scan: false,
        }),
      /getLogs boom/,
    );

    assert.equal(cp.lastBlock, 42, "in-memory checkpoint must not advance on failure");

    const onDisk = watcher.loadCheckpoint(path);
    assert.equal(onDisk.lastBlock, 42);
    assert.deepEqual(onDisk.processedEvents, ["0xdeadbeef:0"]);
  });
});
