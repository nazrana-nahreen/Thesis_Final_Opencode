// Asset registration and management routes.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { addresses, assetRegistryAbi, publicClient } from "../blockchain.js";
import { ipfsUpload, ipfsRetrieve } from "../ipfs.js";
import { encryptAsset } from "../cryptoService.js";
import { getWalletClient } from "../blockchain.js";

const registerSchema = z.object({
  parentAssetId: z.string().regex(/^\d+$/).default("0"),
  royaltyBps: z.number().int().min(0).max(5000).default(0),
  price: z.string().regex(/^\d+$/),
  previewCid: z.string().optional(),
});

export async function assetRoutes(app: FastifyInstance) {
  // POST /assets - register a new asset (encrypt + upload to IPFS + list on-chain)
  app.post("/", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "No file uploaded" });

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const plaintext = Buffer.concat(chunks);

    if (plaintext.length === 0) return reply.status(400).send({ error: "Empty file" });
    if (plaintext.length > 10 * 1024 * 1024) return reply.status(413).send({ error: "File too large" });

    // Encrypt
    const asset = encryptAsset(new Uint8Array(plaintext), 1024);

    // Upload ciphertext to IPFS
    const cidResult = await ipfsUpload(asset.C);

    // Upload leaf lists
    const leafListD = Buffer.concat(asset.leafD.map((l: Uint8Array) => Buffer.from(l)));
    const leafListC = Buffer.concat(asset.leafC.map((l: Uint8Array) => Buffer.from(l)));
    const leafListDCid = await ipfsUpload(new Uint8Array(leafListD));
    const leafListCCid = await ipfsUpload(new Uint8Array(leafListC));

    // Upload preview (first 1KB as preview placeholder)
    const previewData = plaintext.subarray(0, Math.min(1024, plaintext.length));
    const previewCid = await ipfsUpload(new Uint8Array(previewData));

    return reply.send({
      status: "encrypted",
      m: asset.m,
      beta: asset.beta,
      hD: Buffer.from(asset.hD).toString("hex"),
      hC: Buffer.from(asset.hC).toString("hex"),
      R_D: Buffer.from(asset.R_D).toString("hex"),
      R_C: Buffer.from(asset.R_C).toString("hex"),
      cK: Buffer.from(asset.cK).toString("hex"),
      cidC: cidResult.cid,
      leafListDCid: leafListDCid.cid,
      leafListCCid: leafListCCid.cid,
      previewCid: previewCid.cid,
      size: plaintext.length,
    });
  });

  // POST /assets/list - list an asset on-chain with provided commitments
  app.post("/list", async (req, reply) => {
    const body = z.object({
      hD: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      hC: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      R_D: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      R_C: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      cK: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      leafListD: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      leafListC: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      previewCid: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      fingerprint: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      m: z.number().int().min(1),
      blockSize: z.number().int().min(256).max(65536),
      price: z.string().regex(/^\d+$/),
      royaltyBps: z.number().int().min(0).max(5000).default(0),
      parentAssetId: z.string().regex(/^\d+$/).default("0"),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const d = body.data;
    try {
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({
        address: addresses.assetRegistry,
        abi: assetRegistryAbi,
        functionName: "list",
        args: [
          d.hD as `0x${string}`, d.hC as `0x${string}`,
          d.R_D as `0x${string}`, d.R_C as `0x${string}`,
          d.cK as `0x${string}`, d.leafListD as `0x${string}`,
          d.leafListC as `0x${string}`, d.previewCid as `0x${string}`,
          d.fingerprint as `0x${string}`,
          d.m, d.blockSize, BigInt(d.price),
          d.royaltyBps, BigInt(d.parentAssetId),
        ],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return reply.send({ txHash: hash, receipt: { status: receipt.status, blockNumber: receipt.blockNumber } });
    } catch (err: any) {
      return reply.status(500).send({ error: "Listing failed", detail: err.message });
    }
  });
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) return reply.status(400).send({ error: "Invalid asset ID" });

    try {
      const asset = await publicClient.readContract({
        address: addresses.assetRegistry,
        abi: assetRegistryAbi,
        functionName: "get",
        args: [BigInt(id)],
      });
      // Convert BigInt to string for JSON serialization
      const serialized = JSON.parse(JSON.stringify(asset, (_, v) =>
        typeof v === "bigint" ? v.toString() : v
      ));
      return reply.send({ assetId: id, ...serialized });
    } catch (err: any) {
      return reply.status(404).send({ error: "Asset not found", detail: err.message });
    }
  });

  // GET /assets/:id/active
  app.get("/:id/active", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) return reply.status(400).send({ error: "Invalid asset ID" });

    const active = await publicClient.readContract({
      address: addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: "isActive",
      args: [BigInt(id)],
    });
    return reply.send({ assetId: id, active });
  });
}