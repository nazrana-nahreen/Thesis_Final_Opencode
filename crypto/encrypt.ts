// Real (non-simulated) encryption + Merkle + proof generation for CRC.
// Uses Node's crypto module. No mocking.

import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import * as crypto from "./crypto.js";

export interface EncryptedAsset {
  D: Uint8Array;
  K: Uint8Array;
  N: Uint8Array;
  s: Uint8Array;
  C: Uint8Array;
  beta: number;
  m: number;
  leafD: Uint8Array[];
  leafC: Uint8Array[];
  R_D: Uint8Array;
  R_C: Uint8Array;
  hD: Uint8Array;
  hC: Uint8Array;
  cK: Uint8Array;
  saltD: Uint8Array;
  saltC: Uint8Array;
}

function toBuffer(b: Uint8Array): Buffer { return Buffer.from(b); }

export function encryptFile(plaintext: Uint8Array, beta: number = 1024): EncryptedAsset {
  const K = new Uint8Array(randomBytes(32));
  const N = new Uint8Array(randomBytes(16));
  const s = new Uint8Array(randomBytes(32));
  const saltD = new Uint8Array(randomBytes(32));
  const saltC = new Uint8Array(randomBytes(32));

  const L = plaintext.length;
  const m = Math.ceil(L / beta);

  const kEnc = crypto.hmacSha256(K, new Uint8Array([0x01]));

  const C = new Uint8Array(L);
  const leafD: Uint8Array[] = [];
  const leafC: Uint8Array[] = [];

  for (let i = 0; i < m; i++) {
    const start = i * beta;
    const end = Math.min(start + beta, L);
    const blockLen = end - start;
    const Di = plaintext.subarray(start, end);
    const Ci = new Uint8Array(blockLen);

    const nWords = Math.ceil(blockLen / 32);
    for (let j = 0; j < nWords; j++) {
      const ks = crypto.keystreamWord(kEnc, i, j);
      const off = j * 32;
      for (let k = 0; k < 32 && off + k < blockLen; k++) {
        Ci[off + k] = Di[off + k] ^ ks[k];
      }
    }
    C.set(Ci, start);

    leafD.push(crypto.plainLeaf(i, Di));
    leafC.push(crypto.cipherLeaf(i, Ci));
  }

  const R_D = crypto.merkleRoot(leafD);
  const R_C = crypto.merkleRoot(leafC);

  const hD = new Uint8Array(createHash("sha256").update(Buffer.concat([Buffer.from([0x04]), Buffer.from(saltD), encodeUint32(L), Buffer.from(plaintext)])).digest());
  const hC = new Uint8Array(createHash("sha256").update(Buffer.concat([Buffer.from([0x05]), Buffer.from(saltC), encodeUint32(L), Buffer.from(C)])).digest());
  const cK = crypto.keyCommitment(K, N, s);

  return { D: plaintext, K, N, s, C, beta, m, leafD, leafC, R_D, R_C, hD, hC, cK, saltD, saltC };
}

function encodeUint32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

export function generateProof(asset: EncryptedAsset, index: number) {
  const proofD = crypto.merkleProof(asset.leafD, index);
  const proofC = crypto.merkleProof(asset.leafC, index);
  const blockStart = index * asset.beta;
  const blockEnd = Math.min(blockStart + asset.beta, asset.D.length);
  const C_i = asset.C.subarray(blockStart, blockEnd);
  return { index, C_i: new Uint8Array(C_i), leafD: new Uint8Array(asset.leafD[index]), proofD, proofC, K: asset.K, N: asset.N, s: asset.s };
}

export function verifyConsistency(proof: ReturnType<typeof generateProof>): boolean {
  const kEnc = crypto.hmacSha256(proof.K, new Uint8Array([0x01]));
  const D_i = crypto.decryptBlock(kEnc, proof.index, proof.C_i);
  const recomputed = crypto.plainLeaf(proof.index, D_i);
  return Buffer.from(recomputed).equals(Buffer.from(proof.leafD));
}

// CLI demo
if (process.argv[1]?.endsWith("encrypt.js") && process.argv[2]) {
  const data = readFileSync(process.argv[2] || "test-asset.bin");
  const asset = encryptFile(new Uint8Array(data), 1024);
  console.log("Encrypted", data.length, "bytes into", asset.m, "blocks");
  console.log("R_D:", Buffer.from(asset.R_D).toString("hex"));
  console.log("R_C:", Buffer.from(asset.R_C).toString("hex"));
  console.log("cK: ", Buffer.from(asset.cK).toString("hex"));

  const proof = generateProof(asset, 0);
  console.log("Proof for block 0, C_i length:", proof.C_i.length);
  console.log("Consistency check (block 0):", verifyConsistency(proof));

  const tampered = new Uint8Array(proof.C_i);
  tampered[0] ^= 0xff;
  const tamperedProof = { ...proof, C_i: tampered };
  console.log("Consistency check (tampered block 0):", verifyConsistency(tamperedProof));
}