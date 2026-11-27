// On-chain experiments for E4 (gas) and E5 (latency / sequential throughput).
// Deploys B1, B2 and B3 on a local Anvil chain and measures real receipts.
//
// Usage: node experiments/run_chain_experiments.mjs --runs 30 --latency-runs 100
import { createPublicClient, createWalletClient, http, parseEther, toHex, keccak256, encodePacked } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { encrypt, keyCommitment, merkleProof, sha256 } from "../dist/crypto/crypto.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"]);
    return acc;
  }, []),
);
const RPC = args.rpc ?? "http://127.0.0.1:8545";
const RUNS = Number(args.runs ?? 30);
const LATENCY_RUNS = Number(args.latency ?? 100);
const OUT = args.out ?? "experiments/results/chain";
mkdirSync(OUT, { recursive: true });

const PK = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
];
const chain = { ...anvil, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const accounts = PK.map((k) => privateKeyToAccount(k));
const wallets = accounts.map((account) => createWalletClient({ account, chain, transport: http(RPC) }));

const artifact = (name) => JSON.parse(readFileSync(`out/${name}.sol/${name}.json`, "utf8"));
const abiOf = (name) => artifact(name).abi;
const bytecodeOf = (name) => artifact(name).bytecode.object;

async function deploy(name, args = []) {
  const hash = await wallets[0].deployContract({ abi: abiOf(name), bytecode: bytecodeOf(name), args });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (!rc.contractAddress) throw new Error(`deploy ${name} failed`);
  return rc.contractAddress;
}

async function tx(label, wallet, address, abi, functionName, args = [], value = 0n) {
  const t0 = performance.now();
  const hash = await wallet.writeContract({ address, abi, functionName, args, value });
  const rc = await pub.waitForTransactionReceipt({ hash });
  const ms = performance.now() - t0;
  if (rc.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  return { label, gas: Number(rc.gasUsed), ms, hash, block: Number(rc.blockNumber) };
}

const rows = [];
const ops = (system, run, receipts, extra = {}) => {
  for (const r of receipts) rows.push({ system, run, op: r.label, gas: r.gas, latency_ms: r.ms, ...extra });
};

// ---------------------------------------------------------------- B1
async function b1Run(run) {
  const address = await deploy("NaiveEscrow");
  const abi = abiOf("NaiveEscrow");
  const price = parseEther("0.01");
  const rs = [];
  rs.push(await tx("list", wallets[0], address, abi, "list", [price]));
  rs.push(await tx("buy", wallets[1], address, abi, "buy", [1n], price));
  rs.push(await tx("deliver", wallets[0], address, abi, "deliver", [1n, keccak256(encodePacked(["uint256"], [BigInt(run)]))]));
  rs.push(await tx("confirm", wallets[1], address, abi, "confirm", [1n]));
  return rs;
}

// ---------------------------------------------------------------- B2
async function b2Run(run, withDispute = false) {
  const address = await deploy("FairSwapLite");
  const abi = abiOf("FairSwapLite");
  const price = parseEther("0.01");
  const K = sha256(new Uint8Array([run & 0xff, 7, 9, 11]));
  const D = new TextEncoder().encode(`b2-block-${run}`);
  const enc = encrypt(K, D);
  const encBad = encrypt(K, new TextEncoder().encode(`garbage-${run}`));
  const leafD = toHex(enc.leafD[0]);
  const leafBadD = toHex(encBad.leafD[0]);
  const leafC = toHex(enc.C);
  const rootD = toHex(enc.R_D);
  const rootC = toHex(encBad.R_C);

  const rs = [];
  rs.push(await tx("list", wallets[0], address, abi, "list", [leafD, rootD, rootC, 1, 1024, price]));
  rs.push(await tx("buy", wallets[1], address, abi, "buy", [1n], price));
  rs.push(await tx("revealKey", wallets[0], address, abi, "revealKey", [1n, toHex(K)]));
  if (withDispute) {
    const proofD = merkleProof(enc.leafD, 0).map((p) => toHex(p));
    const proofC = merkleProof(encBad.leafC, 0).map((p) => toHex(p));
    rs.push(await tx("dispute", wallets[1], address, abi, "dispute", [1n, 0n, toHex(encBad.C), leafD, proofD, proofC]));
  } else {
    rs.push(await tx("confirm", wallets[1], address, abi, "confirm", [1n]));
  }
  return rs;
}

// ---------------------------------------------------------------- B3
async function deployB3() {
  const registry = await deploy("AssetRegistry");
  const royalty = await deploy("RoyaltySplitter");
  const licence = await deploy("LicenceToken");
  const escrow = await deploy("SaleEscrow", [registry, royalty, licence]);
  const royaltyAbi = abiOf("RoyaltySplitter");
  const licenceAbi = abiOf("LicenceToken");
  await tx("setEscrow", wallets[0], royalty, royaltyAbi, "setEscrow", [escrow]);
  await tx("setMinter", wallets[0], licence, licenceAbi, "setMinter", [escrow]);
  await tx("depositBond", wallets[0], escrow, abiOf("SaleEscrow"), "depositBond", [], parseEther("50"));
  return { registry, royalty, licence, escrow };
}

function b3Commitments(run, inconsistent = false) {
  const K = sha256(new Uint8Array([run & 0xff, 13, 17, 19]));
  const N = sha256(new Uint8Array([run & 0xff, 23, 29, 31]));
  const s = sha256(new Uint8Array([run & 0xff, 37, 41, 43]));
  const D = new TextEncoder().encode(`b3-block-${run}`);
  const good = encrypt(K, D);
  const bad = encrypt(K, new TextEncoder().encode(`b3-garbage-${run}`));
  return {
    K,
    N,
    s,
    good,
    bad,
    cK: keyCommitment(K, N, s),
    leafD: toHex(good.leafD[0]),
    leafBadD: toHex(bad.leafD[0]),
    R_D: toHex(good.R_D),
    R_C: toHex(inconsistent ? bad.R_C : good.R_C),
    C: toHex(inconsistent ? bad.C : good.C),
    proofD: merkleProof(inconsistent ? bad.leafD : good.leafD, 0).map((p) => toHex(p)),
    proofC: merkleProof(inconsistent ? bad.leafC : good.leafC, 0).map((p) => toHex(p)),
  };
}

async function listB3(sys, run, cm) {
  const zero = `0x${"00".repeat(32)}`;
  return tx("list", wallets[0], sys.registry, abiOf("AssetRegistry"), "list", [
    toHex(cm.good.hD ?? new Uint8Array(32)),
    toHex(cm.good.hC ?? new Uint8Array(32)),
    cm.R_D,
    cm.R_C,
    toHex(cm.cK),
    zero,
    zero,
    zero,
    zero,
    1,
    1024,
    parseEther("0.01"),
    0,
    0n,
  ]);
}

async function b3Run(sys, run, mode = "confirm") {
  const cm = b3Commitments(run, mode === "mode1");
  const rs = [];
  const assetId = await pub.readContract({ address: sys.registry, abi: abiOf("AssetRegistry"), functionName: "nextAssetId" });
  rs.push(await listB3(sys, run, cm));
  const saleId = await pub.readContract({ address: sys.escrow, abi: abiOf("SaleEscrow"), functionName: "nextSaleId" });
  rs.push(await tx("buy", wallets[1], sys.escrow, abiOf("SaleEscrow"), "buy", [assetId], parseEther("0.011")));
  rs.push(await tx("deliver", wallets[0], sys.escrow, abiOf("SaleEscrow"), "deliver", [saleId, toHex(new Uint8Array(100).fill(run & 0xff))]));

  if (mode === "confirm") {
    rs.push(await tx("confirm", wallets[1], sys.escrow, abiOf("SaleEscrow"), "confirm", [saleId]));
  } else if (mode === "mode1") {
    rs.push(await tx("disputeMode1", wallets[1], sys.escrow, abiOf("SaleEscrow"), "disputeMode1", [
      saleId,
      {
        K: toHex(cm.K), N: toHex(cm.N), s: toHex(cm.s), index: 0n,
        C_i: cm.C, leafD: cm.leafD, proofD: cm.proofD, proofC: cm.proofC,
      },
    ]));
  } else if (mode === "mode2") {
    rs.push(await tx("disputeMode2", wallets[1], sys.escrow, abiOf("SaleEscrow"), "disputeMode2", [saleId]));
    rs.push(await tx("respond", wallets[0], sys.escrow, abiOf("SaleEscrow"), "respond", [saleId, toHex(cm.K), toHex(cm.N), toHex(cm.s)]));
  }
  return rs;
}

// ---------------------------------------------------------------- main
const systems = {};
console.log("deploying B3 suite ...");
systems.B3 = await deployB3();

console.log(`E4: ${RUNS} runs per system`);
for (let i = 0; i < RUNS; i++) {
  ops("B1", i, await b1Run(i));
  ops("B2", i, await b2Run(i));
  ops("B3", i, await b3Run(systems.B3, i, "confirm"));
  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${RUNS}`);
}

console.log("E4: dispute paths");
for (let i = 0; i < Math.min(RUNS, 10); i++) {
  ops("B2", 1000 + i, await b2Run(1000 + i, true), { path: "dispute" });
  ops("B3", 1000 + i, await b3Run(systems.B3, 1000 + i, "mode1"), { path: "mode1" });
  ops("B3", 2000 + i, await b3Run(systems.B3, 2000 + i, "mode2"), { path: "mode2" });
}

console.log(`E5: ${LATENCY_RUNS} additional happy-path cycles for latency`);
const latencyRows = [];
for (let i = 0; i < LATENCY_RUNS; i++) {
  const rs = await b3Run(systems.B3, 5000 + i, "confirm");
  latencyRows.push(...rs.map((r) => ({ run: i, op: r.label, latency_ms: r.ms, gas: r.gas })));
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${LATENCY_RUNS}`);
}

function stats(xs) {
  const n = xs.length;
  if (!n) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  return {
    n,
    mean: +mean.toFixed(2),
    median: +q(0.5).toFixed(2),
    sd: +sd.toFixed(2),
    p95: +q(0.95).toFixed(2),
    min: +sorted[0].toFixed(2),
    max: +sorted[n - 1].toFixed(2),
    ci95: +(1.96 * sd / Math.sqrt(n)).toFixed(2),
  };
}

const summary = { generatedAt: new Date().toISOString(), rpc: RPC, runs: RUNS, latencyRuns: LATENCY_RUNS, systems: {}, cycles: {} };
for (const system of ["B1", "B2", "B3"]) {
  summary.systems[system] = {};
  const systemRows = rows.filter((r) => r.system === system);
  for (const op of [...new Set(systemRows.map((r) => r.op))]) {
    const isDisputeOp = ["dispute", "disputeMode1", "disputeMode2", "respond"].includes(op);
    const opRows = isDisputeOp
      ? systemRows.filter((r) => r.op === op)
      : systemRows.filter((r) => r.op === op && (!r.path || r.path === "happy"));
    summary.systems[system][op] = {
      gas: stats(opRows.map((r) => r.gas)),
      latency_ms: stats(opRows.map((r) => r.latency_ms)),
    };
  }

  // Per-sale cycle statistics (buy + deliver/revealKey + confirm) over 30 happy-path runs
  const cycleGas = [];
  const cycleLatency = [];
  const cycleOps = system === "B2" ? ["buy", "revealKey", "confirm"] : ["buy", "deliver", "confirm"];
  for (let i = 0; i < RUNS; i++) {
    const runRows = rows.filter((r) => r.system === system && r.run === i && (!r.path || r.path === "happy"));
    let gSum = 0;
    let lSum = 0;
    for (const cOp of cycleOps) {
      const match = runRows.find((r) => r.op === cOp);
      if (match) {
        gSum += match.gas;
        lSum += match.latency_ms;
      }
    }
    cycleGas.push(gSum);
    cycleLatency.push(lSum);
  }
  summary.cycles[system] = {
    gas: stats(cycleGas),
    latency_ms: stats(cycleLatency),
  };
}

// Sequential throughput: completed happy-path cycles per second.
const cycleGroups = {};
for (const r of latencyRows) {
  (cycleGroups[r.run] ??= []).push(r);
}
const cycleTimes = Object.values(cycleGroups).map((g) => g.reduce((a, b) => a + b.latency_ms, 0));
summary.sequentialThroughput = {
  cycles: cycleTimes.length,
  meanCycleMs: stats(cycleTimes).mean,
  salesPerSecond: +(1000 / stats(cycleTimes).mean).toFixed(2),
};

writeFileSync(`${OUT}/gas_runs.csv`, ["system,run,op,gas,latency_ms,path", ...rows.map((r) => [r.system, r.run, r.op, r.gas, r.latency_ms.toFixed(3), r.path ?? "happy"].join(","))].join("\n"));
writeFileSync(`${OUT}/latency_runs.csv`, ["run,op,latency_ms,gas", ...latencyRows.map((r) => [r.run, r.op, r.latency_ms.toFixed(3), r.gas].join(","))].join("\n"));
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
console.log(`wrote ${OUT}/summary.json`);
console.log(JSON.stringify(summary.systems.B3, null, 1));
