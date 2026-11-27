// Deploy the MetaTrade-R contracts to a local dev chain (Ganache or Anvil).
//
// Uses the node's unlocked accounts, so no private key is needed and the script
// works with a default Ganache GUI instance. For Anvil:
//   node scripts/deploy_ganache.mjs --rpc http://127.0.0.1:8545
//
// Earlier versions of this file embedded a private key copied from another
// machine, which does not exist in a fresh Ganache wallet; that is fixed here.

import {
  resolveRpc,
  makeRpc,
  artifact,
  deploy,
  write,
} from "./ganache_lib.mjs";

const RPC = resolveRpc();
const rpc = makeRpc(RPC);

async function main() {
  console.log("==================================================");
  console.log("   MetaTrade-R deployment (real transactions)     ");
  console.log("==================================================");
  const chainId = await rpc("eth_chainId");
  const accounts = await rpc("eth_accounts");
  if (!accounts.length) throw new Error("node exposes no unlocked accounts");
  const deployer = accounts[0];
  const balance = await rpc("eth_getBalance", [deployer, "latest"]);
  console.log(`RPC      : ${RPC}`);
  console.log(`chainId  : ${parseInt(chainId, 16)}`);
  console.log(`deployer : ${deployer}`);
  console.log(`balance  : ${Number(balance) / 1e18} ETH\n`);

  const reg = await deploy(rpc, "AssetRegistry", [], deployer);
  const royalty = await deploy(rpc, "RoyaltySplitter", [], deployer);
  const lic = await deploy(rpc, "LicenceToken", [], deployer);
  const escrow = await deploy(rpc, "SaleEscrow", [reg.address, royalty.address, lic.address], deployer);
  for (const c of [reg, royalty, lic, escrow]) {
    console.log(`${c.name.padEnd(16)} ${c.address}  tx=${c.hash}  gas=${c.gasUsed}`);
  }

  const royaltyAbi = artifact("RoyaltySplitter").abi;
  const licenceAbi = artifact("LicenceToken").abi;
  const t1 = await write(rpc, { from: deployer, address: royalty.address, abi: royaltyAbi, functionName: "setEscrow", args: [escrow.address] });
  const t2 = await write(rpc, { from: deployer, address: lic.address, abi: licenceAbi, functionName: "setMinter", args: [escrow.address] });
  console.log(`\nsetEscrow tx=${t1.hash} gas=${t1.gasUsed}`);
  console.log(`setMinter tx=${t2.hash} gas=${t2.gasUsed}`);

  console.log("\nASSET_REGISTRY_ADDRESS   =", reg.address);
  console.log("ROYALTY_SPLITTER_ADDRESS =", royalty.address);
  console.log("LICENCE_TOKEN_ADDRESS    =", lic.address);
  console.log("SALE_ESCROW_ADDRESS      =", escrow.address);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exitCode = 1;
});
