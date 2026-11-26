// Backend integration tests for MetaTrade-R.
// Run with: node --test tests/backend.test.mjs
// Requires: Anvil + Kubo running, contracts deployed, server on port 3001.

import { test, describe, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

// Use the IPv4 literal: on Windows, `localhost` may resolve to ::1 while the
// Fastify server binds 0.0.0.0 (IPv4 only), which makes fetch fail with
// ECONNREFUSED even though the server is running.
const API = process.env.API_BASE ?? "http://127.0.0.1:3001";

describe("Health", () => {
  test("GET /health returns ok", async () => {
    const r = await fetch(`${API}/health`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.status, "ok");
  });
});

describe("Asset endpoints", () => {
  test("GET /assets/:id with invalid id returns 400", async () => {
    const r = await fetch(`${API}/assets/abc`);
    assert.equal(r.status, 400);
  });

  test("GET /assets/:id/active with invalid id returns 400", async () => {
    const r = await fetch(`${API}/assets/xyz/active`);
    assert.equal(r.status, 400);
  });

  test("POST /assets without file returns 400 or 406", async () => {
    const r = await fetch(`${API}/assets`, { method: "POST" });
    assert.ok(r.status === 400 || r.status === 406, `expected 400 or 406, got ${r.status}`);
  });

  test("POST /assets with empty file returns 400", async () => {
    const form = new FormData();
    form.append("file", new Blob([]), "empty.bin");
    const r = await fetch(`${API}/assets`, { method: "POST", body: form });
    assert.equal(r.status, 400);
  });

  test("POST /assets with valid file returns encrypted asset", async () => {
    const data = new TextEncoder().encode("test asset for backend");
    const form = new FormData();
    form.append("file", new Blob([data]), "test.bin");
    const r = await fetch(`${API}/assets`, { method: "POST", body: form });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.status, "encrypted");
    assert.ok(j.cidC);
    assert.ok(j.hD);
    assert.ok(j.R_D);
    assert.ok(j.cK);
    assert.equal(j.size, data.length);
  });
});

describe("Sale endpoints", () => {
  test("GET /sales/:id with invalid id returns 400", async () => {
    const r = await fetch(`${API}/sales/abc`);
    assert.equal(r.status, 400);
  });

  test("POST /sales/buy with invalid assetId returns 400", async () => {
    const r = await fetch(`${API}/sales/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: "notanumber" }),
    });
    assert.equal(r.status, 400);
  });

  test("POST /sales/buy with missing assetId returns 400", async () => {
    const r = await fetch(`${API}/sales/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 400);
  });

  test("POST /sales/:id/deliver with invalid encK returns 400", async () => {
    const r = await fetch(`${API}/sales/1/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encK: "not-hex" }),
    });
    assert.equal(r.status, 400);
  });

  test("POST /sales/:id/dispute/mode2 with invalid id returns 400", async () => {
    const r = await fetch(`${API}/sales/xyz/dispute/mode2`, { method: "POST" });
    assert.equal(r.status, 400);
  });
});

describe("Royalty endpoints", () => {
  test("GET /royalty/:address with invalid address returns 400", async () => {
    const r = await fetch(`${API}/royalty/not-an-address`);
    assert.equal(r.status, 400);
  });

  test("GET /royalty/:address with valid address returns credit", async () => {
    const r = await fetch(`${API}/royalty/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok("credit" in j);
  });
});

describe("IPFS integration", () => {
  test("Upload and retrieve round-trip", async () => {
    const data = new Uint8Array([10, 20, 30, 40, 50]);
    const form = new FormData();
    form.append("file", new Blob([data]), "ipfs-test.bin");
    const r = await fetch(`${API}/assets`, { method: "POST", body: form });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(j.cidC);
    // Retrieve from IPFS directly
    const ipfsRes = await fetch(`http://127.0.0.1:5001/api/v0/cat?arg=${j.cidC}`, { method: "POST" });
    assert.equal(ipfsRes.status, 200);
    const retrieved = new Uint8Array(await ipfsRes.arrayBuffer());
    assert.equal(retrieved.length, data.length);
  });
});

console.log("Backend tests defined. Run with: node --test tests/backend.test.mjs");