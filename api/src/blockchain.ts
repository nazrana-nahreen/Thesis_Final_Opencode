// Blockchain interaction layer using viem.
// Connects to Anvil/testnet and the deployed contracts.

import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { loadConfig } from "./config.js";

const config = loadConfig();

export const publicClient = createPublicClient({
  chain: anvil,
  transport: http(config.RPC_URL),
});

export function getWalletClient(privateKey?: string) {
  const pk = privateKey || config.PRIVATE_KEY;
  if (!pk) throw new Error("No private key configured");
  const account = privateKeyToAccount(pk as `0x${string}`);
  return createWalletClient({
    account,
    chain: anvil,
    transport: http(config.RPC_URL),
  });
}

// Contract addresses from environment
export const addresses = {
  assetRegistry: (config.ASSET_REGISTRY_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  saleEscrow: (config.SALE_ESCROW_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  royaltySplitter: (config.ROYALTY_SPLITTER_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  licenceToken: (config.LICENCE_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
};

// Minimal ABIs (function signatures only)
export const assetRegistryAbi = [
  { name: "list", type: "function", stateMutability: "nonpayable", inputs: [
    { name: "hD", type: "bytes32" }, { name: "hC", type: "bytes32" },
    { name: "R_D", type: "bytes32" }, { name: "R_C", type: "bytes32" },
    { name: "cK", type: "bytes32" }, { name: "leafListD", type: "bytes32" },
    { name: "leafListC", type: "bytes32" }, { name: "previewCid", type: "bytes32" },
    { name: "fingerprint", type: "bytes32" }, { name: "m", type: "uint32" },
    { name: "blockSize", type: "uint32" }, { name: "price", type: "uint64" },
    { name: "royaltyBps", type: "uint16" }, { name: "parentAssetId", type: "uint256" },
  ], outputs: [{ name: "assetId", type: "uint256" }] },
  { name: "get", type: "function", stateMutability: "view", inputs: [{ name: "assetId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [
    { name: "seller", type: "address" }, { name: "hD", type: "bytes32" },
    { name: "hC", type: "bytes32" }, { name: "R_D", type: "bytes32" },
    { name: "R_C", type: "bytes32" }, { name: "cK", type: "bytes32" },
    { name: "leafListD", type: "bytes32" }, { name: "leafListC", type: "bytes32" },
    { name: "previewCid", type: "bytes32" }, { name: "fingerprint", type: "bytes32" },
    { name: "m", type: "uint32" }, { name: "blockSize", type: "uint32" },
    { name: "price", type: "uint64" }, { name: "royaltyBps", type: "uint16" },
    { name: "parentAssetId", type: "uint256" }, { name: "active", type: "bool" },
    { name: "listedAt", type: "uint64" },
  ]}] },
  { name: "isActive", type: "function", stateMutability: "view", inputs: [{ name: "assetId", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "sellerOf", type: "function", stateMutability: "view", inputs: [{ name: "assetId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { name: "deactivate", type: "function", stateMutability: "nonpayable", inputs: [{ name: "assetId", type: "uint256" }, { name: "reason", type: "bytes8" }], outputs: [] },
  { name: "AssetListed", type: "event", inputs: [
    { name: "assetId", type: "uint256", indexed: true },
    { name: "seller", type: "address", indexed: true },
    { name: "hD", type: "bytes32" }, { name: "hC", type: "bytes32" },
    { name: "price", type: "uint64" },
  ]},
] as const;

export const saleEscrowAbi = [
  { name: "buy", type: "function", stateMutability: "payable", inputs: [{ name: "assetId", type: "uint256" }], outputs: [{ name: "saleId", type: "uint256" }] },
  { name: "deliver", type: "function", stateMutability: "nonpayable", inputs: [{ name: "saleId", type: "uint256" }, { name: "encK", type: "bytes" }], outputs: [] },
  { name: "confirm", type: "function", stateMutability: "nonpayable", inputs: [{ name: "saleId", type: "uint256" }], outputs: [] },
  { name: "disputeMode1", type: "function", stateMutability: "nonpayable", inputs: [{ name: "saleId", type: "uint256" }, { name: "proof", type: "tuple", components: [
    { name: "K", type: "bytes32" }, { name: "N", type: "bytes32" }, { name: "s", type: "bytes32" },
    { name: "index", type: "uint256" }, { name: "C_i", type: "bytes" },
    { name: "leafD", type: "bytes32" }, { name: "proofD", type: "bytes32[]" },
    { name: "proofC", type: "bytes32[]" },
  ]}], outputs: [] },
  { name: "disputeMode2", type: "function", stateMutability: "nonpayable", inputs: [{ name: "saleId", type: "uint256" }], outputs: [] },
  { name: "respond", type: "function", stateMutability: "nonpayable", inputs: [{ name: "saleId", type: "uint256" }, { name: "K", type: "bytes32" }, { name: "N", type: "bytes32" }, { name: "s", type: "bytes32" }], outputs: [] },
  { name: "timeoutDeliver", type: "function", stateMutability: "nonpayable", inputs: [{ name: "saleId", type: "uint256" }], outputs: [] },
  { name: "timeoutConfirm", type: "function", stateMutability: "nonpayable", inputs: [{ name: "saleId", type: "uint256" }], outputs: [] },
  { name: "timeoutRespond", type: "function", stateMutability: "nonpayable", inputs: [{ name: "saleId", type: "uint256" }], outputs: [] },
  { name: "getSale", type: "function", stateMutability: "view", inputs: [{ name: "saleId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [
    { name: "buyer", type: "address" }, { name: "seller", type: "address" },
    { name: "assetId", type: "uint256" }, { name: "price", type: "uint64" },
    { name: "bondBuyer", type: "uint64" }, { name: "bondSeller", type: "uint64" },
    { name: "tDeliver", type: "uint64" }, { name: "tConfirm", type: "uint64" },
    { name: "tRespond", type: "uint64" }, { name: "state", type: "uint8" },
    { name: "encK", type: "bytes" }, { name: "revealedK", type: "bytes32" },
    { name: "revealedN", type: "bytes32" }, { name: "revealedS", type: "bytes32" },
    { name: "keyRevealed", type: "bool" },
  ]}] },
  { name: "SaleCreated", type: "event", inputs: [
    { name: "saleId", type: "uint256", indexed: true },
    { name: "assetId", type: "uint256", indexed: true },
    { name: "buyer", type: "address", indexed: true },
    { name: "price", type: "uint64" }, { name: "bondSeller", type: "uint64" },
  ]},
  { name: "Settled", type: "event", inputs: [
    { name: "saleId", type: "uint256", indexed: true },
    { name: "sellerAmount", type: "uint64" }, { name: "parentAmount", type: "uint64" },
  ]},
  { name: "Refunded", type: "event", inputs: [
    { name: "saleId", type: "uint256", indexed: true },
    { name: "buyerAmount", type: "uint64" }, { name: "reason", type: "string" },
  ]},
] as const;

export const royaltyAbi = [
  { name: "creditOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "Credited", type: "event", inputs: [{ name: "account", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
] as const;