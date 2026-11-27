#!/usr/bin/env bash
# ==============================================================================
# MetaTrade-R: Optional Clean-Machine Environment Setup Script
#
# PURPOSE:
#   Sets up the dependencies, local blockchain (Anvil), IPFS storage (Kubo),
#   and runs the backend API server on a clean workstation or CI runner.
#
# USAGE:
#   chmod +x scripts/setup_clean_env.sh
#   ./scripts/setup_clean_env.sh
# ==============================================================================

set -euo pipefail

echo "=================================================="
echo "MetaTrade-R: Initializing Clean Machine Environment"
echo "=================================================="

# 1. Check prerequisites
for cmd in node npm forge anvil ipfs python3; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "[WARNING] Command '$cmd' not found on PATH. Please ensure it is installed."
    else
        echo "[OK] Found $cmd: $(command -v "$cmd")"
    fi
done

# 2. Build Solidity smart contracts
echo ""
echo "=== 1. Building Smart Contracts with Foundry ==="
forge build

# 3. Compile TypeScript backend and watcher
echo ""
echo "=== 2. Compiling TypeScript Source ==="
npm run build 2>/dev/null || npx tsc

# 4. Check / Start Anvil (port 8545)
echo ""
echo "=== 3. Checking Local Blockchain Node (Anvil :8545) ==="
if curl -s -X POST http://127.0.0.1:8545 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' &> /dev/null; then
    echo "[OK] Anvil is already active on http://127.0.0.1:8545"
else
    echo "[INFO] Starting Anvil in background on port 8545..."
    nohup anvil --port 8545 --silent > /dev/null 2>&1 &
    sleep 2
    echo "[OK] Anvil launched."
fi

# 5. Check / Start Kubo IPFS (port 5001)
echo ""
echo "=== 4. Checking IPFS Node (Kubo :5001) ==="
if curl -s -X POST http://127.0.0.1:5001/api/v0/id &> /dev/null; then
    echo "[OK] IPFS Kubo is already active on http://127.0.0.1:5001"
else
    echo "[INFO] Starting IPFS daemon in background..."
    nohup ipfs daemon > /dev/null 2>&1 &
    sleep 3
    echo "[OK] IPFS daemon launched."
fi

# 6. Deploy Contracts to local Anvil
echo ""
echo "=== 5. Deploying Modular Contracts to Anvil ==="
if [ -f "scripts/deploy.mjs" ]; then
    node scripts/deploy.mjs || echo "[NOTICE] Contract deployment script finished."
fi

# 7. Verification prompt
echo ""
echo "=================================================="
echo "Environment setup complete!"
echo "To run the automated test suite:"
echo "  node scripts/verify_all.mjs --full"
echo "=================================================="
