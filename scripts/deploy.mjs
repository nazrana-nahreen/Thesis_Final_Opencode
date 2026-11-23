import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { readFileSync } from "node:fs";

const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PK);
const publicClient = createPublicClient({ chain: anvil, transport: http("http://127.0.0.1:8545") });
const walletClient = createWalletClient({ account, chain: anvil, transport: http("http://127.0.0.1:8545") });

function loadArtifact(name) {
  const path = `out/${name}.sol/${name}.json`;
  return JSON.parse(readFileSync(path, "utf8"));
}

async function deploy(name, args = []) {
  const art = loadArtifact(name);
  const hash = await walletClient.deployContract({
    abi: art.abi,
    bytecode: art.bytecode.object,
    args,
    gas: 8_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`${name} deployed at: ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

async function main() {
  const regAddr = await deploy("AssetRegistry");
  const royaltyAddr = await deploy("RoyaltySplitter");
  const licAddr = await deploy("LicenceToken");
  const escrowAddr = await deploy("SaleEscrow", [regAddr, royaltyAddr, licAddr]);

  // Wire up
  const royaltyArt = loadArtifact("RoyaltySplitter");
  const setEscrowHash = await walletClient.writeContract({
    address: royaltyAddr,
    abi: royaltyArt.abi,
    functionName: "setEscrow",
    args: [escrowAddr],
    gas: 100_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: setEscrowHash });

  const licArt = loadArtifact("LicenceToken");
  const setMinterHash = await walletClient.writeContract({
    address: licAddr,
    abi: licArt.abi,
    functionName: "setMinter",
    args: [escrowAddr],
    gas: 100_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: setMinterHash });

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log(`ASSET_REGISTRY_ADDRESS=${regAddr}`);
  console.log(`SALE_ESCROW_ADDRESS=${escrowAddr}`);
  console.log(`ROYALTY_SPLITTER_ADDRESS=${royaltyAddr}`);
  console.log(`LICENCE_TOKEN_ADDRESS=${licAddr}`);
}

main().catch(console.error);