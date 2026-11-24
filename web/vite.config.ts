import { defineConfig } from "vite";

// The dApp talks directly to Anvil (CORS is open by default on Anvil).
// IPFS calls are proxied through the dev server so that Kubo's API does not
// need any CORS configuration.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/ipfs-api": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ipfs-api/, ""),
      },
      "/ipfs-gw": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ipfs-gw/, ""),
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
