#!/usr/bin/env node
// Scripted verification for MetaTrade-R.
//
// This is a *reproduction* script, not a clean-room proof. It runs the checks
// that exist in this repository and reports exactly what passed. It refuses to
// print a green summary if a step failed or was skipped.
//
// Usage:
//   node scripts/verify_all.mjs            # Foundry + watcher + backend (if up)
//   node scripts/verify_all.mjs --full     # also the attack matrix and E4-E8
//
// Requirements:
//   - Foundry on PATH, or FORGE pointing at forge(.exe)
//   - Node 22+
//   - For the backend step: Anvil + Kubo + `node dist/api/src/server.js`
//   - For --full: Python 3.10+ with numpy/Pillow for E8

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const full = process.argv.includes("--full");
const repo = process.cwd();
const results = [];

function forgeBinary() {
  if (process.env.FORGE) return process.env.FORGE;
  const home = os.homedir();
  const candidates = [
    path.join(home, ".foundry", "bin", process.platform === "win32" ? "forge.exe" : "forge"),
    "forge",
  ];
  return candidates.find((c) => c === "forge" || existsSync(c)) ?? "forge";
}

function run(name, command, args, options = {}) {
  process.stdout.write(`\n=== ${name} ===\n`);
  const started = Date.now();
  const out = spawnSync(command, args, {
    cwd: repo,
    encoding: "utf8",
    stdio: options.quiet ? "pipe" : "inherit",
    env: process.env,
  });
  const ok = out.status === 0;
  results.push({ name, ok, skipped: false, ms: Date.now() - started });
  if (!ok && options.quiet) {
    process.stdout.write(out.stdout ?? "");
    process.stderr.write(out.stderr ?? "");
  }
  return ok;
}

async function backendIsUp() {
  try {
    const r = await fetch("http://127.0.0.1:3001/health", { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

const forge = forgeBinary();
console.log(`MetaTrade-R verification on ${os.type()} ${os.release()}`);
console.log(`Node ${process.version}; forge=${forge}; repo=${repo}`);
console.log("This script does not claim a clean machine; it reports the checks it actually ran.");

run("Foundry test suite", forge, ["test"]);

run("Watcher integration tests (spawns Anvil on 8546)", "node", ["--test", "tests/watcher.test.mjs"]);

if (await backendIsUp()) {
  run("Backend integration tests (server on 3001)", "node", ["--test", "tests/backend.test.mjs"]);
} else {
  console.log("\n=== Backend integration tests ===\nSKIPPED: no server on http://127.0.0.1:3001");
  results.push({ name: "Backend integration tests", ok: false, skipped: true, ms: 0 });
}

if (full) {
  run("Attack matrix", "python", ["harness/attack_harness.py", "--system", "all"], { quiet: true });
  run("E4/E5 gas and latency", "node", ["experiments/run_chain_experiments.mjs", "--runs", "30", "--latency", "100"], {
    quiet: true,
  });
  run("E6 compute and storage", "node", ["experiments/e6_storage_compute.mjs"], { quiet: true });
  run("E7 bond economics", "python", ["experiments/e7_economics.py"], { quiet: true });
  run("E8 fingerprint pilot", "python", ["experiments/e8_fingerprint.py", "--n-images", "80", "--seed", "1234"], {
    quiet: true,
  });
}

console.log("\n=== Summary ===");
for (const r of results) {
  const status = r.skipped ? "SKIPPED" : r.ok ? "PASS" : "FAIL";
  console.log(`${status.padEnd(8)} ${r.name} (${(r.ms / 1000).toFixed(1)}s)`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.log(`\n${failed.length} step(s) did not pass. See the output above.`);
  process.exit(1);
}
console.log("\nAll executed steps passed. This is not a clean-room validation.");
