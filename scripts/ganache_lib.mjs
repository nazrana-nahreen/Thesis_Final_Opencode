// Minimal JSON-RPC helpers for demos on a local dev chain.
//
// Uses `eth_sendTransaction` with the node's unlocked accounts, so it works with
// a default Ganache GUI/CLI instance and with Anvil without exporting any
// private key. This is a demo tool, not part of the measured experiment suite.

import { readFileSync } from "node:fs";
import { encodeDeployData, encodeFunctionData, decodeFunctionResult } from "viem";

export function resolveRpc(argv = process.argv.slice(2)) {
  const i = argv.indexOf("--rpc");
  const fromArg = i >= 0 ? argv[i + 1] : undefined;
  return fromArg || process.env.GANACHE_RPC || process.env.RPC_URL || "http://127.0.0.1:7545";
}

export function makeRpc(url) {
  let id = 0;
  async function rpc(method, params = []) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const body = await res.json();
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  }
  return rpc;
}

export function artifact(name) {
  return JSON.parse(readFileSync(`out/${name}.sol/${name}.json`, "utf8"));
}

export async function waitReceipt(rpc, hash, timeoutMs = 60_000) {
  const start = Date.now();
  for (;;) {
    const rc = await rpc("eth_getTransactionReceipt", [hash]);
    if (rc) {
      if (rc.status !== "0x1") throw new Error(`transaction reverted: ${hash}`);
      return rc;
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${hash}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function send(rpc, { from, to, data = "0x", value = 0n, label = "tx" }) {
  const gasHex = await rpc("eth_estimateGas", [
    { from, to, data, value: `0x${value.toString(16)}` },
  ]);
  const gas = (BigInt(gasHex) * 12n) / 10n;
  const hash = await rpc("eth_sendTransaction", [
    { from, to, data, value: `0x${value.toString(16)}`, gas: `0x${gas.toString(16)}` },
  ]);
  const rc = await waitReceipt(rpc, hash);
  return { label, hash, gasUsed: Number(rc.gasUsed), block: Number(rc.blockNumber) };
}

export async function deploy(rpc, name, args = [], from) {
  const art = artifact(name);
  const data = encodeDeployData({ abi: art.abi, bytecode: art.bytecode.object, args });
  const gasHex = await rpc("eth_estimateGas", [{ from, data }]);
  const gas = (BigInt(gasHex) * 12n) / 10n;
  const hash = await rpc("eth_sendTransaction", [{ from, data, gas: `0x${gas.toString(16)}` }]);
  const rc = await waitReceipt(rpc, hash);
  if (!rc.contractAddress) throw new Error(`deploy ${name} produced no address`);
  return { name, address: rc.contractAddress, hash, gasUsed: Number(rc.gasUsed) };
}

export function write(rpc, { from, address, abi, functionName, args = [], value = 0n }) {
  const data = encodeFunctionData({ abi, functionName, args });
  return send(rpc, { from, to: address, data, value, label: functionName });
}

export async function read(rpc, { address, abi, functionName, args = [] }) {
  const data = encodeFunctionData({ abi, functionName, args });
  const out = await rpc("eth_call", [{ to: address, data }, "latest"]);
  return decodeFunctionResult({ abi, functionName, data: out });
}

export const ether = (n) => BigInt(Math.round(n * 1e6)) * 10n ** 12n; // 6-decimal ETH -> wei

export function fmtEth(wei) {
  const v = BigInt(wei);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 10n ** 18n;
  const frac = (abs % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
