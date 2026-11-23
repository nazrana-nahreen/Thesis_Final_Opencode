// SPDX-License-Identifier: MIT
// ECIES key wrapping for CRC (per-buyer confidentiality).
// Uses eciesjs (secp256k1-based), which matches Ethereum key material.

import { encrypt, decrypt } from "eciesjs";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

export interface WrappedKey {
  ephemeralPublicKey: string; // hex
  ciphertext: string;        // hex (K encrypted)
  mac: string;               // hex
}

/**
 * Wrap a 32-byte content key K to a buyer's secp256k1 public key.
 * Returns a hex string suitable for on-chain storage in SaleEscrow.encK.
 */
export function wrapKey(K: Buffer, buyerPublicKey: string): string {
  // eciesjs encrypt takes (publicKey, msg) and returns a Buffer.
  const encrypted = encrypt(buyerPublicKey, K);
  return Buffer.from(encrypted).toString("hex");
}

/**
 * Unwrap a content key using the buyer's private key.
 */
export function unwrapKey(wrappedHex: string, buyerPrivateKey: string): Buffer {
  const encrypted = Buffer.from(wrappedHex, "hex");
  const decrypted = decrypt(buyerPrivateKey, encrypted);
  return Buffer.from(decrypted);
}

// Demo
if (process.argv[1]?.endsWith("keywrap.ts") || process.argv[1]?.endsWith("keywrap.js")) {
  // Generate a buyer keypair (in production, the buyer provides their pubkey)
  const { privateKey, publicKey } = generateKeyPair();
  const K = randomBytes(32);
  console.log("Content key K:", K.toString("hex"));
  console.log("Buyer pubkey: ", publicKey);

  const wrapped = wrapKey(K, publicKey);
  console.log("Wrapped (hex):", wrapped);
  console.log("Wrapped length:", wrapped.length / 2, "bytes");

  const unwrapped = unwrapKey(wrapped, privateKey);
  console.log("Unwrapped K:  ", unwrapped.toString("hex"));
  console.log("Match:", K.equals(unwrapped));
}

function generateKeyPair(): { privateKey: string; publicKey: string } {
  // Use eciesjs's key generation if available, otherwise use a placeholder.
  // eciesjs exports generateKeyPair in newer versions.
  try {
    const ecies = require("eciesjs");
    if (typeof ecies.generateKeyPair === "function") {
      const kp = ecies.generateKeyPair();
      return { privateKey: kp.privateKey.toString("hex"), publicKey: kp.publicKey.toString("hex") };
    }
  } catch {}
  // Fallback: generate with Node's crypto (secp256k1)
  const { generateKeyPairSync } = require("node:crypto");
  const kp = generateKeyPairSync("ec", { namedCurve: "secp256k1" });
  const priv = kp.privateKey.export({ type: "sec1", format: "der" });
  const pub = kp.publicKey.export({ type: "spki", format: "der" });
  return { privateKey: priv.toString("hex"), publicKey: pub.toString("hex") };
}