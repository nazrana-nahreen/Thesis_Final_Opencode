// IPFS service using Kubo HTTP API.
// No simulation: all calls go to a real IPFS node.

import { loadConfig } from "./config.js";

const config = loadConfig();

export interface IpfsUploadResult {
  cid: string;
  size: number;
}

export async function ipfsUpload(data: Uint8Array): Promise<IpfsUploadResult> {
  const form = new FormData();
  form.append("file", new Blob([data as any]), "asset.bin");

  const res = await fetch(`${config.IPFS_API_URL}/api/v0/add?pin=true`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`IPFS upload failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { Hash: string; Size: string };
  return { cid: json.Hash, size: parseInt(json.Size, 10) };
}

export async function ipfsRetrieve(cid: string): Promise<Uint8Array> {
  const res = await fetch(`${config.IPFS_API_URL}/api/v0/cat?arg=${encodeURIComponent(cid)}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`IPFS retrieve failed: ${res.status} ${res.statusText}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function ipfsPin(cid: string): Promise<void> {
  const res = await fetch(`${config.IPFS_API_URL}/api/v0/pin/add?arg=${encodeURIComponent(cid)}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`IPFS pin failed: ${res.status} ${res.statusText}`);
}

export async function ipfsVerify(cid: string, expectedHash: Uint8Array): Promise<boolean> {
  const data = await ipfsRetrieve(cid);
  const { createHash } = await import("node:crypto");
  const actual = createHash("sha256").update(data).digest();
  return Buffer.from(actual).equals(Buffer.from(expectedHash));
}

export function ipfsGatewayUrl(cid: string): string {
  return `${config.IPFS_GATEWAY_URL}/ipfs/${cid}`;
}