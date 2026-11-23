#!/usr/bin/env npx tsx
// Minimal CLI for MetaTrade-R (P7).
// Usage: npx tsx cli.ts <command> [args]

import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";

const API = process.env.API_URL || "http://localhost:3001";

const commands: Record<string, (args: string[]) => Promise<void>> = {
  health: async () => {
    const r = await fetch(`${API}/health`);
    console.log(await r.json());
  },
  register: async (args) => {
    const filePath = args[0];
    if (!filePath) { console.error("Usage: register <file>"); return; }
    const data = readFileSync(filePath);
    const form = new FormData();
    form.append("file", new Blob([data]), filePath);
    const r = await fetch(`${API}/assets`, { method: "POST", body: form });
    console.log(await r.json());
  },
  asset: async (args) => {
    const id = args[0];
    const r = await fetch(`${API}/assets/${id}`);
    console.log(await r.json());
  },
  buy: async (args) => {
    const assetId = args[0];
    const r = await fetch(`${API}/sales/buy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }) });
    console.log(await r.json());
  },
  sale: async (args) => {
    const id = args[0];
    const r = await fetch(`${API}/sales/${id}`);
    console.log(await r.json());
  },
  royalty: async (args) => {
    const addr = args[0];
    const r = await fetch(`${API}/royalty/${addr}`);
    console.log(await r.json());
  },
};

const cmd = process.argv[2];
const args = process.argv.slice(3);
if (!cmd || !commands[cmd]) {
  console.log("Commands: " + Object.keys(commands).join(", "));
  process.exit(1);
}
commands[cmd](args).catch(console.error);