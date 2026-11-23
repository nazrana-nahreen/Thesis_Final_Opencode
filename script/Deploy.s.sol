// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "forge-std/Script.sol";
import "../src/AssetRegistry.sol";
import "../src/RoyaltySplitter.sol";
import "../src/LicenceToken.sol";
import "../src/SaleEscrow.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        vm.startBroadcast(deployerKey);

        AssetRegistry reg = new AssetRegistry();
        RoyaltySplitter royalty = new RoyaltySplitter();
        LicenceToken lic = new LicenceToken();
        SaleEscrow escrow = new SaleEscrow(address(reg), address(royalty), address(lic));

        royalty.setEscrow(address(escrow));
        lic.setMinter(address(escrow));

        vm.stopBroadcast();

        console.log("ASSET_REGISTRY_ADDRESS=", address(reg));
        console.log("ROYALTY_SPLITTER_ADDRESS=", address(royalty));
        console.log("LICENCE_TOKEN_ADDRESS=", address(lic));
        console.log("SALE_ESCROW_ADDRESS=", address(escrow));
    }
}