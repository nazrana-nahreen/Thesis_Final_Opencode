// Environment configuration for the MetaTrade-R backend.
import { z } from "zod";

const envSchema = z.object({
  RPC_URL: z.string().default("http://127.0.0.1:8545"),
  CHAIN_ID: z.string().default("31337"),
  ASSET_REGISTRY_ADDRESS: z.string().optional(),
  SALE_ESCROW_ADDRESS: z.string().optional(),
  ROYALTY_SPLITTER_ADDRESS: z.string().optional(),
  LICENCE_TOKEN_ADDRESS: z.string().optional(),
  IPFS_API_URL: z.string().default("http://127.0.0.1:5001"),
  IPFS_GATEWAY_URL: z.string().default("http://127.0.0.1:8080"),
  PRIVATE_KEY: z.string().optional(), // operator key for authorized writes (optional)
  PORT: z.string().default("3001"),
  HOST: z.string().default("0.0.0.0"),
  MAX_FILE_SIZE: z.string().default("10485760"), // 10 MB
  RATE_LIMIT_MAX: z.string().default("100"),
  RATE_LIMIT_WINDOW: z.string().default("60000"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten());
    process.exit(1);
  }
  return parsed.data;
}