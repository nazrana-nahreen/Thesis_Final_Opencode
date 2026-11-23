// Royalty and seller-credit routes.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { addresses, royaltyAbi, publicClient, getWalletClient } from "../blockchain.js";

export async function royaltyRoutes(app: FastifyInstance) {
  // GET /royalty/:address - query credit balance
  app.get("/:address", async (req, reply) => {
    const { address: addr } = req.params as { address: string };
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return reply.status(400).send({ error: "Invalid address" });

    const credit = await publicClient.readContract({
      address: addresses.royaltySplitter,
      abi: royaltyAbi,
      functionName: "creditOf",
      args: [addr as `0x${string}`],
    });
    return reply.send({ address: addr, credit: credit.toString() });
  });

  // POST /royalty/withdraw
  app.post("/withdraw", async (req, reply) => {
    try {
      const wallet = getWalletClient();
      const hash = await wallet.writeContract({
        address: addresses.royaltySplitter,
        abi: royaltyAbi,
        functionName: "withdraw",
        args: [],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return reply.send({ txHash: hash, receipt: { status: receipt.status } });
    } catch (err: any) {
      return reply.status(500).send({ error: "Withdraw failed", detail: err.message });
    }
  });
}