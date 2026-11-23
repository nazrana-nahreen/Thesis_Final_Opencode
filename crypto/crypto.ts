// SPDX-License-Identifier: MIT
// TypeScript reference implementation of the CRC crypto primitives.
// This MUST produce byte-identical output to src/DisputeVerifier.sol.
// Cross-language test vectors are generated here and verified in Solidity.

import { createHmac, createHash } from "node:crypto";

// ---------- Domain tags (must match DisputeVerifier.sol) ----------
export const TAG_PLAIN_LEAF = 0x06;
export const TAG_CIPHER_LEAF = 0x07;
export const TAG_KEY_COMMIT = 0x08;
export const TAG_MERKLE_NODE = 0x09;
export const TAG_KEYSTREAM = 0x03;

export type Bytes = Uint8Array;

function toBuf(b: Bytes): Buffer { return Buffer.from(b); }

// ---------- SHA-256 ----------
export function sha256(data: Bytes): Bytes {
  return new Uint8Array(createHash("sha256").update(toBuf(data)).digest());
}

// ---------- HMAC-SHA256 (RFC 2104) ----------
export function hmacSha256(key: Bytes, message: Bytes): Bytes {
  // key must be 32 bytes; if shorter, pad with zeros (matches Solidity).
  const k = Buffer.alloc(64, 0);
  for (let i = 0; i < Math.min(key.length, 32); i++) k[i] = key[i];
  const ipad = Buffer.alloc(64);
  const opad = Buffer.alloc(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = k[i] ^ 0x36;
    opad[i] = k[i] ^ 0x5c;
  }
  const inner = createHash("sha256")
    .update(Buffer.concat([ipad, toBuf(message)]))
    .digest();
  const outer = createHash("sha256")
    .update(Buffer.concat([opad, inner]))
    .digest();
  return new Uint8Array(outer);
}

// ---------- Keystream ----------
export function keystreamWord(kEnc: Bytes, i: number, j: number): Bytes {
  // Message: 0x03 || i (uint64 big-endian) || j (uint32 big-endian)
  const msg = Buffer.alloc(1 + 8 + 4);
  msg[0] = TAG_KEYSTREAM;
  // uint64 big-endian
  let x = BigInt(i);
  for (let k = 7; k >= 0; k--) { msg[1 + k] = Number(x & 0xffn); x >>= 8n; }
  let y = j;
  for (let k = 3; k >= 0; k--) { msg[9 + k] = y & 0xff; y >>= 8; }
  return hmacSha256(kEnc, new Uint8Array(msg));
}

export function decryptBlock(kEnc: Bytes, i: number, C: Bytes): Bytes {
  const D = new Uint8Array(C.length);
  const nWords = Math.ceil(C.length / 32);
  for (let j = 0; j < nWords; j++) {
    const ks = keystreamWord(kEnc, i, j);
    const off = j * 32;
    for (let k = 0; k < 32 && off + k < C.length; k++) {
      D[off + k] = C[off + k] ^ ks[k];
    }
  }
  return D;
}

// ---------- Key commitment ----------
export function keyCommitment(K: Bytes, N: Bytes, s: Bytes): Bytes {
  const buf = Buffer.concat([
    Buffer.from([TAG_KEY_COMMIT]),
    toBuf(K), toBuf(N), toBuf(s),
  ]);
  return new Uint8Array(createHash("sha256").update(buf).digest());
}

// ---------- Leaf hashing ----------
export function plainLeaf(i: number, D_i: Bytes): Bytes {
  const buf = Buffer.concat([
    Buffer.from([TAG_PLAIN_LEAF]),
    encodeUint64(i),
    toBuf(D_i),
  ]);
  return new Uint8Array(createHash("sha256").update(buf).digest());
}

export function cipherLeaf(i: number, C_i: Bytes): Bytes {
  const buf = Buffer.concat([
    Buffer.from([TAG_CIPHER_LEAF]),
    encodeUint64(i),
    toBuf(C_i),
  ]);
  return new Uint8Array(createHash("sha256").update(buf).digest());
}

// ---------- Merkle (binary, SHA-256 with domain tag 0x09) ----------
export function merkleRoot(leaves: Bytes[]): Bytes {
  if (leaves.length === 0) throw new Error("empty tree");
  let level = leaves.map((l) => Buffer.from(l));
  while (level.length > 1) {
    const next: any[] = [] as any;
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left; // duplicate last
      next.push(createHash("sha256")
        .update(Buffer.concat([Buffer.from([TAG_MERKLE_NODE]), left, right]))
        .digest());
    }
    level = next;
  }
  return new Uint8Array(level[0]);
}

export function merkleProof(leaves: Bytes[], index: number): Bytes[] {
  const proof: Bytes[] = [];
  let level = leaves.map((l) => Buffer.from(l));
  let idx = index;
  while (level.length > 1) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (siblingIdx < level.length) proof.push(new Uint8Array(level[siblingIdx]));
    else proof.push(new Uint8Array(level[idx])); // duplicate
    const next: any[] = [] as any;
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(createHash("sha256")
        .update(Buffer.concat([Buffer.from([TAG_MERKLE_NODE]), left, right]))
        .digest());
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

export function verifyMerkle(root: Bytes, leaf: Bytes, index: number, proof: Bytes[]): boolean {
  let computed = Buffer.from(leaf) as Uint8Array;
  let idx = index;
  for (let level = 0; level < proof.length; level++) {
    const sibling = Buffer.from(proof[level]);
    if (idx % 2 === 0) {
      computed = createHash("sha256")
        .update(Buffer.concat([Buffer.from([TAG_MERKLE_NODE]), computed, sibling]))
        .digest();
    } else {
      computed = createHash("sha256")
        .update(Buffer.concat([Buffer.from([TAG_MERKLE_NODE]), sibling, computed]))
        .digest();
    }
    idx = Math.floor(idx / 2);
  }
  return Buffer.from(computed).equals(Buffer.from(root));
}

// ---------- Helpers ----------
function encodeUint64(n: number): Buffer {
  const b = Buffer.alloc(8);
  let x = BigInt(n);
  for (let k = 7; k >= 0; k--) { b[k] = Number(x & 0xffn); x >>= 8n; }
  return b;
}

// ---------- High-level: encrypt ----------
export function encrypt(K: Bytes, D: Bytes): { C: Bytes; leafD: Bytes[]; leafC: Bytes[]; R_D: Bytes; R_C: Bytes } {
  const kEnc = hmacSha256(K, new Uint8Array([0x01]));
  const m = Math.ceil(D.length / 32); // 32-byte words for simplicity in TS ref; real uses beta
  // For the reference, treat each 32-byte chunk as a "block" (beta=32) to keep it simple.
  // Real deployments use beta=1024; the primitive is identical.
  const leafD: Bytes[] = [];
  const leafC: Bytes[] = [];
  const C = new Uint8Array(D.length);
  for (let i = 0; i < m; i++) {
    const start = i * 32;
    const end = Math.min(start + 32, D.length);
    const Di = D.slice(start, end);
    const Ci = new Uint8Array(end - start);
    const ks = keystreamWord(kEnc, i, 0).slice(0, end - start);
    for (let k = 0; k < end - start; k++) Ci[k] = Di[k] ^ ks[k];
    C.set(Ci, start);
    leafD.push(plainLeaf(i, Di));
    leafC.push(cipherLeaf(i, Ci));
  }
  return { C, leafD, leafC, R_D: merkleRoot(leafD), R_C: merkleRoot(leafC) };
}

// ---------- Cross-language vector generator ----------
export function generateVector(): { K: string; N: string; s: string; D: string; C: string; R_D: string; R_C: string; cK: string } {
  const K = crypto_random(32);
  const N = crypto_random(16);
  const s = crypto_random(32);
  const D = Buffer.from("hello world plaintext block for cross-lang vector test");
  const { C, R_D, R_C } = encrypt(K, D);
  const cK = keyCommitment(K, N, s);
  return {
    K: Buffer.from(K).toString("hex"),
    N: Buffer.from(N).toString("hex"),
    s: Buffer.from(s).toString("hex"),
    D: D.toString("hex"),
    C: Buffer.from(C).toString("hex"),
    R_D: Buffer.from(R_D).toString("hex"),
    R_C: Buffer.from(R_C).toString("hex"),
    cK: Buffer.from(cK).toString("hex"),
  };
}

function crypto_random(n: number): Bytes {
  const { randomBytes } = require("node:crypto");
  return new Uint8Array(randomBytes(n));
}
