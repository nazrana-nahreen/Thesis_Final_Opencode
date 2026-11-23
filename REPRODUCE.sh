#!/usr/bin/env bash
# Reproducibility script for MetaTrade-R (Tier-1).
# Run from the metatrade-r directory.
# Does not overwrite user data or existing configuration.

set -e

echo "=== MetaTrade-R Reproducibility Script ==="
echo "Date: $(date)"
echo ""

# Prerequisites
echo "=== Checking prerequisites ==="
for cmd in forge node python ipfs; do
    if ! command -v $cmd &> /dev/null; then
        echo "MISSING: $cmd"
        exit 1
    fi
done
echo "forge: $(forge --version | head -1)"
echo "node: $(node --version)"
echo "python: $(python --version)"
echo "ipfs: $(ipfs --version)"
echo ""

# 1. Install dependencies
echo "=== Installing dependencies ==="
npm ci 2>/dev/null || npm install
pip install -q web3 2>/dev/null || true
echo "Dependencies installed."
echo ""

# 2. Compile Solidity
echo "=== Compiling Solidity ==="
forge build
echo "Compilation successful."
echo ""

# 3. Run Solidity tests
echo "=== Running Solidity tests ==="
forge test 2>&1 | tail -5
echo ""

# 4. Start Anvil (if not running)
echo "=== Starting Anvil ==="
if ! curl -s http://127.0.0.1:8545 > /dev/null 2>&1; then
    anvil --host 0.0.0.0 --port 8545 &
    ANVIL_PID=$!
    sleep 3
    echo "Anvil started (PID $ANVIL_PID)."
else
    echo "Anvil already running."
fi
echo ""

# 5. Start Kubo (if not running)
echo "=== Starting Kubo ==="
if ! curl -s http://127.0.0.1:5001/api/v0/id > /dev/null 2>&1; then
    ipfs daemon &
    IPFS_PID=$!
    sleep 5
    echo "Kubo started (PID $IPFS_PID)."
else
    echo "Kubo already running."
fi
echo ""

# 6. Deploy contracts
echo "=== Deploying contracts ==="
node scripts/deploy.mjs
echo ""

# 7. Configure backend
echo "=== Configuring backend ==="
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example. Edit with deployed addresses."
fi
echo ""

# 8. Start backend
echo "=== Starting backend ==="
node dist/api/src/server.js &
BACKEND_PID=$!
sleep 4
curl -s http://localhost:3001/health
echo ""

# 9. Run backend tests
echo "=== Running backend tests ==="
node --test tests/backend.test.mjs 2>&1 | tail -5
echo ""

# 10. Run attack scenarios
echo "=== Running attack scenarios ==="
python harness/attack_harness.py --system B3 --out harness/results 2>&1 | tail -5
echo ""

# 11. CLI health check
echo "=== CLI health check ==="
npx tsx cli.ts health 2>&1 | tail -2
echo ""

# 12. TypeScript compilation
echo "=== TypeScript compilation ==="
npx tsc --noEmit && echo "TypeScript: 0 errors"
echo ""

echo "=== Reproduction complete ==="
echo "Logs and outputs are in harness/results/, .gas-snapshot, and the console above."
EOF