// SPDX-License-Identifier: MIT
// ECIES key wrapping for CRC (per-buyer confidentiality).
// Uses eciesjs (secp256k1-based), which matches Ethereum key material.

import { encrypt, decrypt, PrivateKey } from "eciesjs";
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
  // eciesjs 0.5 exposes PrivateKey; both values are raw secp256k1 material,
  // unlike DER-encoded keys from node:crypto.
  const kp = new PrivateKey();
  return { privateKey: kp.toHex(), publicKey: kp.publicKey.toHex() };
}