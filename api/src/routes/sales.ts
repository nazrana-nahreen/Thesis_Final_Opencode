// Sale lifecycle routes.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { addresses, saleEscrowAbi, publicClient, getWalletClient } from "../blockchain.js";
import { parseEther } from "viem";
import { ipfsRetrieve } from "../ipfs.js";
import { generateProof, verifyConsistency } from "../cryptoService.js";

const buySchema = z.object({
  assetId: z.string().regex(/^\d+$/),
  buyerPrivateKey: z.string().optional(),
});

const deliverSchema = z.object({
  saleId: z.string().regex(/^\d+$/),
  encK: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

const disputeMode1Schema = z.object({
  saleId: z.string().regex(/^\d+$/),
  K: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  N: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  s: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  index: z.number().int().min(0),
  C_i: z.string().regex(/^0x[0-9a-fA-F]+$/),
  leafD: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  proofD: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}$/)),
  proofC: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}$/)),
});

export async function saleRoutes(app: FastifyInstance) {
  // POST /sales/buy
  app.post("/buy", async (req, reply) => {
    const body = buySchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const { assetId } = body.data;
    const asset = await publicClient.readContract({
      address: addresses.assetRegistry,
      abi: [{ name: "get", type: "function", stateMutability: "view", inputs: [{ name: "assetId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "price", type: "uint64" }] }] }],
      functionName: "get",
      args: [BigInt(assetId)],
    }) as any;

    const price = BigInt(asset.price);
    const buyerBond = parseEther("0.001");
    const total = price + buyerBond;

    try {
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({
        address: addresses.saleEscrow,
        abi: saleEscrowAbi,
        functionName: "buy",
        args: [BigInt(assetId)],
        value: total,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return reply.send({ txHash: hash, receipt: { status: receipt.status, blockNumber: receipt.blockNumber } });
    } catch (err: any) {
      return reply.status(500).send({ error: "Transaction failed", detail: err.message });
    }
  });

  // POST /sales/:id/deliver
  app.post("/:id/deliver", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) return reply.status(400).send({ error: "Invalid sale ID" });

    const body = deliverSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    try {
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({
        address: addresses.saleEscrow,
        abi: saleEscrowAbi,
        functionName: "deliver",
        args: [BigInt(id), body.data.encK as `0x${string}`],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return reply.send({ txHash: hash, receipt: { status: receipt.status } });
    } catch (err: any) {
      return reply.status(500).send({ error: "Delivery failed", detail: err.message });
    }
  });

  // POST /sales/:id/confirm
  app.post("/:id/confirm", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) return reply.status(400).send({ error: "Invalid sale ID" });

    try {
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({
        address: addresses.saleEscrow,
        abi: saleEscrowAbi,
        functionName: "confirm",
        args: [BigInt(id)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return reply.send({ txHash: hash, receipt: { status: receipt.status } });
    } catch (err: any) {
      return reply.status(500).send({ error: "Confirm failed", detail: err.message });
    }
  });

  // POST /sales/:id/dispute/mode1
  app.post("/:id/dispute/mode1", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) return reply.status(400).send({ error: "Invalid sale ID" });

    const body = disputeMode1Schema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const d = body.data;
    try {
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({
        address: addresses.saleEscrow,
        abi: saleEscrowAbi,
        functionName: "disputeMode1",
        args: [BigInt(id), {
          K: d.K as `0x${string}`,
          N: d.N as `0x${string}`,
          s: d.s as `0x${string}`,
          index: BigInt(d.index),
          C_i: d.C_i as `0x${string}`,
          leafD: d.leafD as `0x${string}`,
          proofD: d.proofD as `0x${string}`[],
          proofC: d.proofC as `0x${string}`[],
        }],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return reply.send({ txHash: hash, receipt: { status: receipt.status } });
    } catch (err: any) {
      return reply.status(500).send({ error: "Dispute failed", detail: err.message });
    }
  });

  // POST /sales/:id/dispute/mode2
  app.post("/:id/dispute/mode2", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) return reply.status(400).send({ error: "Invalid sale ID" });

    try {
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({
        address: addresses.saleEscrow,
        abi: saleEscrowAbi,
        functionName: "disputeMode2",
        args: [BigInt(id)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return reply.send({ txHash: hash, receipt: { status: receipt.status } });
    } catch (err: any) {
      return reply.status(500).send({ error: "Dispute failed", detail: err.message });
    }
  });

  // POST /sales/:id/respond
  app.post("/:id/respond", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) return reply.status(400).send({ error: "Invalid sale ID" });

    const body = z.object({
      K: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      N: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      s: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    try {
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({
        address: addresses.saleEscrow,
        abi: saleEscrowAbi,
        functionName: "respond",
        args: [BigInt(id), body.data.K as `0x${string}`, body.data.N as `0x${string}`, body.data.s as `0x${string}`],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return reply.send({ txHash: hash, receipt: { status: receipt.status } });
    } catch (err: any) {
      return reply.status(500).send({ error: "Respond failed", detail: err.message });
    }
  });

  // GET /sales/:id
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) return reply.status(400).send({ error: "Invalid sale ID" });

    try {
      const sale = await publicClient.readContract({
        address: addresses.saleEscrow,
        abi: saleEscrowAbi,
        functionName: "getSale",
        args: [BigInt(id)],
      });
      const serialized = JSON.parse(JSON.stringify(sale, (_, v) =>
        typeof v === "bigint" ? v.toString() : v
      ));
      return reply.send({ saleId: id, ...serialized });
    } catch (err: any) {
      return reply.status(404).send({ error: "Sale not found", detail: err.message });
    }
  });

  // POST /sales/:id/timeout/deliver
  app.post("/:id/timeout/deliver", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) return reply.status(400).send({ error: "Invalid sale ID" });

    try {
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({
        address: addresses.saleEscrow,
        abi: saleEscrowAbi,
        functionName: "timeoutDeliver",
        args: [BigInt(id)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return reply.send({ txHash: hash, receipt: { status: receipt.status } });
    } catch (err: any) {
      return reply.status(500).send({ error: "Timeout failed", detail: err.message });
    }
  });

  // POST /sales/:id/timeout/confirm
  app.post("/:id/timeout/confirm", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) return reply.status(400).send({ error: "Invalid sale ID" });

    try {
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({
        address: addresses.saleEscrow,
        abi: saleEscrowAbi,
        functionName: "timeoutConfirm",
        args: [BigInt(id)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return reply.send({ txHash: hash, receipt: { status: receipt.status } });
    } catch (err: any) {
      return reply.status(500).send({ error: "Timeout failed", detail: err.message });
    }
  });

  // POST /sales/:id/timeout/respond
  app.post("/:id/timeout/respond", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) return reply.status(400).send({ error: "Invalid sale ID" });

    try {
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({
        address: addresses.saleEscrow,
        abi: saleEscrowAbi,
        functionName: "timeoutRespond",
        args: [BigInt(id)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return reply.send({ txHash: hash, receipt: { status: receipt.status } });
    } catch (err: any) {
      return reply.status(500).send({ error: "Timeout failed", detail: err.message });
    }
  });
}