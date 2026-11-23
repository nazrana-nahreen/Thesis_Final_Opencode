// Fastify server for MetaTrade-R backend.
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { loadConfig } from "./config.js";
import { assetRoutes } from "./routes/assets.js";
import { saleRoutes } from "./routes/sales.js";
import { royaltyRoutes } from "./routes/royalty.js";

const config = loadConfig();
const app = Fastify({ logger: true, bodyLimit: parseInt(config.MAX_FILE_SIZE, 10) });

await app.register(cors, { origin: true });
await app.register(rateLimit, {
  max: parseInt(config.RATE_LIMIT_MAX, 10),
  timeWindow: parseInt(config.RATE_LIMIT_WINDOW, 10),
});
await app.register(multipart, { limits: { fileSize: parseInt(config.MAX_FILE_SIZE, 10) } });

// Health check
app.get("/health", async () => ({ status: "ok", timestamp: Date.now() }));

// Routes
await app.register(assetRoutes, { prefix: "/assets" });
await app.register(saleRoutes, { prefix: "/sales" });
await app.register(royaltyRoutes, { prefix: "/royalty" });

const port = parseInt(config.PORT, 10);
const host = config.HOST;

app.listen({ port, host }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`MetaTrade-R API listening at ${address}`);
});

export default app;