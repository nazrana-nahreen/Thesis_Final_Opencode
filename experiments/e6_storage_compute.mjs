// E6: storage, bandwidth and off-chain compute.
// Measures the TypeScript reference implementation on this machine and computes
// the per-buyer storage/bandwidth model used in the thesis.
import { encryptFile } from "../dist/crypto/encrypt.js";
import { wrapKey } from "../dist/crypto/keywrap.js";
import { PrivateKey } from "eciesjs";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "experiments/results/e6";
mkdirSync(OUT, { recursive: true });

function stats(xs) {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  return { n, mean: +mean.toFixed(3), sd: +sd.toFixed(3), median: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), min: +sorted[0].toFixed(3), max: +sorted[n - 1].toFixed(3) };
}

const sizes = [
  ["64KB", 64 * 1024],
  ["256KB", 256 * 1024],
  ["1MB", 1024 * 1024],
  ["5MB", 5 * 1024 * 1024],
  ["10MB", 10 * 1024 * 1024],
];
const REPS = 10;

const encryption = [];
const rawRows = [];
for (const [label, bytes] of sizes) {
  const times = [];
  let out;
  for (let r = 0; r < REPS; r++) {
    const data = randomBytes(bytes);
    const t0 = performance.now();
    out = encryptFile(new Uint8Array(data), 1024);
    times.push(performance.now() - t0);
    rawRows.push({ size: label, bytes, rep: r, encrypt_ms: times[times.length - 1], m: out.m });
  }
  encryption.push({ size: label, bytes, m: out.m, ciphertextBytes: out.C.length, encrypt_ms: stats(times) });
  console.log(`${label}: ${stats(times).mean} ms, m=${out.m}`);
}

// Key wrapping: ECIES over secp256k1, 100 repetitions.
const recipient = new PrivateKey();
const pubHex = recipient.publicKey.toHex();
const K = randomBytes(32);
const wrapTimes = [];
let wrapped;
for (let i = 0; i < 100; i++) {
  const t0 = performance.now();
  wrapped = wrapKey(K, pubHex);
  wrapTimes.push(performance.now() - t0);
}
const wrapBytes = (wrapped.length - 2) / 2;
console.log(`ECIES wrap: ${wrapBytes} bytes, ${stats(wrapTimes).mean} ms`);

// Logical on-chain bytes per asset (struct fields, excluding mapping slot/padding).
const onchain = {
  address: 20,
  commitments: 9 * 32,
  m: 4,
  blockSize: 4,
  price: 8,
  royaltyBps: 2,
  parentAssetId: 32,
  active: 1,
  listedAt: 8,
};
const onchainBytes = Object.values(onchain).reduce((a, b) => a + b, 0);
const onchainWithSlot = onchainBytes + 32;

// Storage model: all systems store the ciphertext once (IPFS). They differ in
// the on-chain key material per buyer. This is a MODEL, not a measurement of
// B0: the published DigitalAssetContract stores one hex string per buyer
// (`customerAddrToData[buyer].encryptedSymmetricKey`), so we assume 128 bytes
// per buyer rather than a full re-upload of the asset.
const L = 5 * 1024 * 1024;
const B0_KEY_BYTES_PER_BUYER = 128; // assumption; not measured
const model = [];
for (const n of [1, 10, 100, 1000]) {
  const b0 = L + n * B0_KEY_BYTES_PER_BUYER;
  const b2 = L + 32;
  const b3 = L + n * wrapBytes;
  model.push({ buyers: n, b0_bytes: b0, b2_bytes: b2, b3_bytes: b3, b3_vs_b0: +(b0 / b3).toFixed(2), b3_vs_b2: +(b2 / b3).toFixed(2) });
}

// Decryption of one block and one Merkle path, for dispute-cost context.
const D = new Uint8Array(1024).fill(7);
const asset = encryptFile(D, 1024);
const decTimes = [];
for (let i = 0; i < 100; i++) {
  const kEnc = createHash("sha256").update(Buffer.from([1])).digest(); // not used: timing only
  const t0 = performance.now();
  // decryptBlock is exercised through verifyConsistency below; here we time the
  // public proof verifier, which is what a client uses before submitting.
  const { verifyConsistency } = await import("../dist/crypto/encrypt.js");
  verifyConsistency({
    K: asset.K, index: 0, C_i: asset.C.subarray(0, 1024),
    leafD: asset.leafD[0], proofD: [], proofC: [], R_D: asset.R_D, R_C: asset.R_C,
  });
  decTimes.push(performance.now() - t0);
}

const summary = {
  generatedAt: new Date().toISOString(),
  machine: process.env.PROCESSOR_IDENTIFIER ?? (await import("node:os")).cpus()[0]?.model ?? "unknown",
  node: process.version,
  blockSize: 1024,
  encryption,
  keyWrap: { bytes: wrapBytes, ms: stats(wrapTimes) },
  onchain: { logicalBytesPerAsset: onchainBytes, withMappingSlot: onchainWithSlot, fields: onchain },
  storageModel: { plaintextBytes: L, b0KeyBytesPerBuyer: B0_KEY_BYTES_PER_BUYER, model },
  verifyOneBlockMs: stats(decTimes),
  raw: "raw_encryption.csv",
};
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
writeFileSync(`${OUT}/raw_encryption.csv`, "size,bytes,rep,encrypt_ms,m\n" + rawRows.map((r) => [r.size, r.bytes, r.rep, r.encrypt_ms.toFixed(3), r.m].join(",")).join("\n"));
console.log(JSON.stringify(summary.storageModel, null, 1));
