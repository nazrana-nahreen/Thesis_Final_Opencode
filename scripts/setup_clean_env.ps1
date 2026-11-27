# ==============================================================================
# MetaTrade-R: Optional Clean-Machine Environment Setup Script (PowerShell)
#
# PURPOSE:
#   Sets up the dependencies, local blockchain (Anvil), IPFS storage (Kubo),
#   and prepares contracts and the API server on Windows.
#
# USAGE:
#   powershell -ExecutionPolicy Bypass -File scripts/setup_clean_env.ps1
# ==============================================================================

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "MetaTrade-R: Initializing Clean Machine Environment" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Check prerequisites
$commands = @("node", "npm", "forge", "anvil", "ipfs", "python")
foreach ($cmd in $commands) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) {
        Write-Host "[OK] Found $cmd : $($found.Source)" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] '$cmd' not found on system PATH." -ForegroundColor Yellow
    }
}

# 2. Build smart contracts
Write-Host "`n=== 1. Building Smart Contracts with Foundry ===" -ForegroundColor Cyan
$forgeBin = if ($env:USERPROFILE) { Join-Path $env:USERPROFILE ".foundry\bin\forge.exe" } else { "forge" }
if (Test-Path $forgeBin) {
    & $forgeBin build
} else {
    forge build
}

# 3. Compile TypeScript
Write-Host "`n=== 2. Compiling TypeScript Source ===" -ForegroundColor Cyan
npx tsc

# 4. Check Anvil
Write-Host "`n=== 3. Checking Local Blockchain Node (Anvil :8545) ===" -ForegroundColor Cyan
try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:8545" -Method Post -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -ContentType "application/json" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "[OK] Anvil is already running on port 8545." -ForegroundColor Green
} catch {
    Write-Host "[INFO] Anvil is not running on port 8545. You can start it in a separate shell with: anvil --port 8545" -ForegroundColor Yellow
}

# 5. Check IPFS
Write-Host "`n=== 4. Checking IPFS Node (Kubo :5001) ===" -ForegroundColor Cyan
try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:5001/api/v0/id" -Method Post -TimeoutSec 2 -ErrorAction Stop
    Write-Host "[OK] IPFS Kubo is already running on port 5001." -ForegroundColor Green
} catch {
    Write-Host "[INFO] IPFS is not running on port 5001. You can start it in a separate shell with: ipfs daemon" -ForegroundColor Yellow
}

# 6. Contract deployment
Write-Host "`n=== 5. Deploying Modular Contracts to Anvil ===" -ForegroundColor Cyan
if (Test-Path "scripts/deploy.mjs") {
    node scripts/deploy.mjs
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "Environment setup check finished." -ForegroundColor Cyan
Write-Host "To execute the complete verification suite:" -ForegroundColor Cyan
Write-Host "  node scripts/verify_all.mjs" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan
