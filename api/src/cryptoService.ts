// Crypto service: wraps the TS reference implementation for use by the API.

import * as crypto from "../../crypto/crypto.js";
import * as encrypt from "../../crypto/encrypt.js";
import * as keywrap from "../../crypto/keywrap.js";

export function sha256(data: Uint8Array): Uint8Array {
  return crypto.sha256(data);
}

export function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  return crypto.hmacSha256(key, msg);
}

export function encryptAsset(plaintext: Uint8Array, beta: number = 1024) {
  return encrypt.encryptFile(plaintext, beta);
}

export function generateProof(asset: ReturnType<typeof encrypt.encryptFile>, index: number) {
  return encrypt.generateProof(asset, index);
}

export function verifyConsistency(proof: ReturnType<typeof encrypt.generateProof>): boolean {
  return encrypt.verifyConsistency(proof);
}

export function wrapKey(K: Uint8Array, buyerPublicKey: string): string {
  return keywrap.wrapKey(Buffer.from(K), buyerPublicKey);
}

export function unwrapKey(wrappedHex: string, buyerPrivateKey: string): Uint8Array {
  return new Uint8Array(keywrap.unwrapKey(wrappedHex, buyerPrivateKey));
}

export { crypto, encrypt, keywrap };