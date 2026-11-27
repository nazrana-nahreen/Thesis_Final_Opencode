// Real end-to-end demo on a local dev chain (Ganache or Anvil).
//
// Everything printed here comes from actual transactions: the four contracts
// are deployed, the seller posts a bond, the buyer pays, the seller delivers a
// wrapped key, and settlement/royalty/licence are read back on-chain. A second
// sale then goes through Dispute Mode 1 with a real Merkle/key proof.
//
// IMPORTANT: this replaces the earlier `ganache_demo.mjs`, which only sent ETH
// between externally-owned accounts with hand-written function selectors in the
// calldata and printed simulated balances. No contract was involved there.
//
// Usage:
//   node scripts/ganache_demo.mjs --rpc http://127.0.0.1:7545
//   node scripts/ganache_demo.mjs --rpc http://127.0.0.1:8545   # Anvil
//
// Requires `npx tsc` and `forge build` first. Uses unlocked node accounts, so
// no private key is needed.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { toHex } from "viem";
import {
  hmacSha256,
  keystreamWord,
  plainLeaf,
  cipherLeaf,
  keyCommitment,
  sha256,
} from "../dist/crypto/crypto.js";
import {
  resolveRpc,
  makeRpc,
  artifact,
  deploy,
  write,
  read,
  ether,
  fmtEth,
} from "./ganache_lib.mjs";

const RPC = resolveRpc();
const rpc = makeRpc(RPC);

const abi = {
  registry: artifact("AssetRegistry").abi,
  escrow: artifact("SaleEscrow").abi,
  royalty: artifact("RoyaltySplitter").abi,
  licence: artifact("LicenceToken").abi,
};

// 256-byte block, contract-compatible keystream: block i, word j.
function encryptBlock(K, D) {
  const kEnc = hmacSha256(K, new Uint8Array([0x01]));
  const C = new Uint8Array(D.length);
  for (let j = 0; j * 32 < D.length; j++) {
    const ks = keystreamWord(kEnc, 0, j);
    for (let k = 0; k < 32 && j * 32 + k < D.length; k++) {
      C[j * 32 + k] = D[j * 32 + k] ^ ks[k];
    }
  }
  return { C, leafD: plainLeaf(0, D), leafC: cipherLeaf(0, C) };
}

function assetFromText(text) {
  const D = new Uint8Array(256);
  const src = new TextEncoder().encode(text);
  for (let i = 0; i < D.length; i++) D[i] = src[i % src.length] ^ (i & 0xff);
  return D;
}

async function main() {
  console.log("==============================================================");
  console.log("  MetaTrade-R - REAL end-to-end demo (on-chain, no simulation)");
  console.log("==============================================================");
  const chainId = await rpc("eth_chainId");
  const accounts = await rpc("eth_accounts");
  if (accounts.length < 4) throw new Error("need at least 4 unlocked accounts");
  const [seller, buyer, parentSeller] = accounts;
  console.log(`RPC        : ${RPC}`);
  console.log(`chainId    : ${parseInt(chainId, 16)}`);
  console.log(`seller     : ${seller}`);
  console.log(`buyer      : ${buyer}`);
  console.log(`parent     : ${parentSeller}`);

  console.log("\n[1] deploy contracts");
  const reg = await deploy(rpc, "AssetRegistry", [], seller);
  const royalty = await deploy(rpc, "RoyaltySplitter", [], seller);
  const lic = await deploy(rpc, "LicenceToken", [], seller);
  const escrow = await deploy(rpc, "SaleEscrow", [reg.address, royalty.address, lic.address], seller);
  for (const c of [reg, royalty, lic, escrow]) {
    console.log(`  ${c.name.padEnd(16)} ${c.address}  gas=${c.gasUsed}`);
  }

  await write(rpc, { from: seller, address: royalty.address, abi: abi.royalty, functionName: "setEscrow", args: [escrow.address] });
  await write(rpc, { from: seller, address: lic.address, abi: abi.licence, functionName: "setMinter", args: [escrow.address] });

  console.log("\n[2] parent listing (10% royalty recipient)");
  const Kp = randomBytes(32), Np = randomBytes(32), sp = randomBytes(32);
  const parentD = assetFromText("MetaTrade-R parent artwork ");
  const parentEnc = encryptBlock(Kp, parentD);
  const parentTx = await write(rpc, {
    from: parentSeller,
    address: reg.address,
    abi: abi.registry,
    functionName: "list",
    args: [
      toHex(sha256(parentD)), toHex(sha256(parentEnc.C)),
      toHex(parentEnc.leafD), toHex(parentEnc.leafC),
      toHex(keyCommitment(Kp, Np, sp)),
      toHex(new Uint8Array(32)), toHex(new Uint8Array(32)), toHex(new Uint8Array(32)), toHex(new Uint8Array(32)),
      1, 256, ether(0.5), 0, 0n,
    ],
  });
  const parentId = await read(rpc, { address: reg.address, abi: abi.registry, functionName: "nextAssetId" }) - 1n;
  console.log(`  parent assetId=${parentId}  tx=${parentTx.hash}`);

  console.log("\n[3] seller bonds and lists the child asset");
  const bondTx = await write(rpc, { from: seller, address: escrow.address, abi: abi.escrow, functionName: "depositBond", value: ether(2) });
  console.log(`  depositBond 2 ETH  tx=${bondTx.hash}  gas=${bondTx.gasUsed}`);

  const K = randomBytes(32), N = randomBytes(32), s = randomBytes(32);
  const D = assetFromText("MetaTrade-R demo asset - encrypted content block ");
  const { C, leafD, leafC } = encryptBlock(K, D);
  const cK = keyCommitment(K, N, s);
  const listTx = await write(rpc, {
    from: seller,
    address: reg.address,
    abi: abi.registry,
    functionName: "list",
    args: [
      toHex(sha256(D)), toHex(sha256(C)),
      toHex(leafD), toHex(leafC), toHex(cK),
      toHex(new Uint8Array(32)), toHex(new Uint8Array(32)), toHex(new Uint8Array(32)), toHex(new Uint8Array(32)),
      1, 256, ether(1), 1000, parentId,
    ],
  });
  const assetId = (await read(rpc, { address: reg.address, abi: abi.registry, functionName: "nextAssetId" })) - 1n;
  console.log(`  child assetId=${assetId}  tx=${listTx.hash}  gas=${listTx.gasUsed}`);

  const sellerBal0 = await rpc("eth_getBalance", [seller, "latest"]);
  const buyerBal0 = await rpc("eth_getBalance", [buyer, "latest"]);

  console.log("\n[4] buy -> deliver -> confirm");
  const buyTx = await write(rpc, { from: buyer, address: escrow.address, abi: abi.escrow, functionName: "buy", args: [assetId], value: ether(1.001) });
  const saleId = (await read(rpc, { address: escrow.address, abi: abi.escrow, functionName: "nextSaleId" })) - 1n;
  const deliverTx = await write(rpc, { from: seller, address: escrow.address, abi: abi.escrow, functionName: "deliver", args: [saleId, toHex(K)] });
  const confirmTx = await write(rpc, { from: buyer, address: escrow.address, abi: abi.escrow, functionName: "confirm", args: [saleId] });
  console.log(`  saleId=${saleId}`);
  console.log(`  buy     tx=${buyTx.hash}  gas=${buyTx.gasUsed}`);
  console.log(`  deliver tx=${deliverTx.hash}  gas=${deliverTx.gasUsed}`);
  console.log(`  confirm tx=${confirmTx.hash}  gas=${confirmTx.gasUsed}`);

  const sale = await read(rpc, { address: escrow.address, abi: abi.escrow, functionName: "getSale", args: [saleId] });
  const state = Number(sale.state ?? sale[9]);
  const licenceBal = await read(rpc, { address: lic.address, abi: abi.licence, functionName: "balanceOf", args: [buyer, assetId] });
  const royaltyCredit = await read(rpc, { address: royalty.address, abi: abi.royalty, functionName: "credits", args: [parentSeller] });
  const sellerCredit = await read(rpc, { address: escrow.address, abi: abi.escrow, functionName: "sellerCredit", args: [seller] });

  console.log(`\n  on-chain state        : ${state === 4 ? "SETTLED" : state}`);
  console.log(`  licence balanceOf     : ${licenceBal}`);
  console.log(`  royalty credit(parent): ${fmtEth(royaltyCredit)} ETH`);
  console.log(`  seller bond credit    : ${fmtEth(sellerCredit)} ETH`);
  const sellerBal1 = await rpc("eth_getBalance", [seller, "latest"]);
  const buyerBal1 = await rpc("eth_getBalance", [buyer, "latest"]);
  console.log(`  seller balance delta  : ${fmtEth(BigInt(sellerBal1) - BigInt(sellerBal0))} ETH (0.9 price minus gas paid)`);
  console.log(`  buyer  balance delta  : ${fmtEth(BigInt(buyerBal1) - BigInt(buyerBal0))} ETH (-1.0 price + 0.001 bond returned - gas)`);

  assert.equal(state, 4, "honest sale must settle");
  assert.equal(BigInt(licenceBal), 1n, "buyer must hold exactly one licence");
  assert.equal(royaltyCredit, ether(0.1), "10% royalty credited");
  assert.equal(sellerCredit, ether(2), "seller bond returned to credit");

  console.log("\n[5] dishonest commitment -> Dispute Mode 1 (real proof)");
  const K2 = randomBytes(32), N2 = randomBytes(32), s2 = randomBytes(32);
  const Dgood = assetFromText("advertised content that the seller promises ");
  const Dbad = assetFromText("garbage content the buyer actually gets ");
  const good = encryptBlock(K2, Dgood);
  const bad = encryptBlock(K2, Dbad);
  const list2 = await write(rpc, {
    from: seller,
    address: reg.address,
    abi: abi.registry,
    functionName: "list",
    args: [
      toHex(sha256(Dgood)), toHex(sha256(bad.C)),
      toHex(good.leafD), toHex(bad.leafC), toHex(keyCommitment(K2, N2, s2)),
      toHex(new Uint8Array(32)), toHex(new Uint8Array(32)), toHex(new Uint8Array(32)), toHex(new Uint8Array(32)),
      1, 256, ether(0.5), 0, 0n,
    ],
  });
  const badAssetId = (await read(rpc, { address: reg.address, abi: abi.registry, functionName: "nextAssetId" })) - 1n;
  const badBuy = await write(rpc, { from: buyer, address: escrow.address, abi: abi.escrow, functionName: "buy", args: [badAssetId], value: ether(0.501) });
  const badSaleId = (await read(rpc, { address: escrow.address, abi: abi.escrow, functionName: "nextSaleId" })) - 1n;
  const badDeliver = await write(rpc, { from: seller, address: escrow.address, abi: abi.escrow, functionName: "deliver", args: [badSaleId, toHex(K2)] });

  const disputeTx = await write(rpc, {
    from: buyer,
    address: escrow.address,
    abi: abi.escrow,
    functionName: "disputeMode1",
    args: [badSaleId, {
      K: toHex(K2), N: toHex(N2), s: toHex(s2), index: 0n,
      C_i: toHex(bad.C), leafD: toHex(good.leafD),
      proofD: [], proofC: [],
    }],
  });
  const badSale = await read(rpc, { address: escrow.address, abi: abi.escrow, functionName: "getSale", args: [badSaleId] });
  const badState = Number(badSale.state ?? badSale[9]);
  console.log(`  assetId=${badAssetId} saleId=${badSaleId}`);
  console.log(`  list    tx=${list2.hash}  gas=${list2.gasUsed}`);
  console.log(`  buy     tx=${badBuy.hash}  gas=${badBuy.gasUsed}`);
  console.log(`  deliver tx=${badDeliver.hash}  gas=${badDeliver.gasUsed}`);
  console.log(`  dispute tx=${disputeTx.hash}  gas=${disputeTx.gasUsed}`);
  console.log(`  on-chain state: ${badState === 5 ? "REFUNDED" : badState} (buyer refunded + seller bond slashed)`);
  assert.equal(badState, 5, "inconsistent delivery must refund the buyer");

  console.log("\nAll assertions passed. Every hash above is a real transaction.");
  console.log("Open the Ganache 'Transactions' tab (or Anvil logs) to inspect them.");
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exitCode = 1;
});
