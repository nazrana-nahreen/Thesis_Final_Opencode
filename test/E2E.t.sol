// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "forge-std/Test.sol";
import "../src/AssetRegistry.sol";
import "../src/SaleEscrow.sol";
import "../src/RoyaltySplitter.sol";
import "../src/LicenceToken.sol";
import "../src/DisputeVerifier.sol";

contract E2E is Test {
    AssetRegistry reg;
    RoyaltySplitter royalty;
    LicenceToken lic;
    SaleEscrow escrow;

    address seller = address(0xA11CE);
    address buyer = address(0xB0B);
    address parentSeller = address(0xDAD);

    uint256 assetId;
    uint256 saleId;

    bytes32 K = keccak256("content-key");
    bytes32 N = keccak256("nonce");
    bytes32 s = keccak256("salt");

    function setUp() public {
        reg = new AssetRegistry();
        royalty = new RoyaltySplitter();
        lic = new LicenceToken();
        escrow = new SaleEscrow(address(reg), address(royalty), address(lic));
        royalty.setEscrow(address(escrow));
        lic.setMinter(address(escrow));

        vm.deal(seller, 10 ether);
        vm.deal(buyer, 10 ether);
        vm.deal(parentSeller, 1 ether);

        // Parent asset
        vm.startPrank(parentSeller);
        uint256 parentId = reg.list(
            keccak256("parent-hD"), keccak256("parent-hC"),
            bytes32(uint256(1)), bytes32(uint256(2)),
            DisputeVerifier.keyCommitment(keccak256("parentK"), N, s),
            bytes32(uint256(3)), bytes32(uint256(4)),
            bytes32(uint256(5)), bytes32(uint256(6)),
            1, 1024, 1 ether, 500, 0
        );
        vm.stopPrank();

        // Child asset with parent
        vm.startPrank(seller);
        escrow.depositBond{value: 2 ether}();
        bytes memory D = "hello world plaintext block!!";
        bytes32 kEnc = DisputeVerifier.hmacSha256(K, abi.encodePacked(bytes1(0x01)));
        bytes memory C = new bytes(D.length);
        for (uint256 k = 0; k < D.length; k++) {
            bytes32 ks = DisputeVerifier.keystreamWord(kEnc, 0, 0);
            C[k] = bytes1(uint8(D[k]) ^ uint8(ks[k]));
        }
        bytes32 leafD = DisputeVerifier.plainLeaf(0, D);
        bytes32 leafC = DisputeVerifier.cipherLeaf(0, C);
        bytes32 cK = DisputeVerifier.keyCommitment(K, N, s);

        assetId = reg.list(
            leafD, leafC, leafD, leafC, cK,
            bytes32(uint256(10)), bytes32(uint256(11)),
            bytes32(uint256(12)), bytes32(uint256(13)),
            1, 1024, 1 ether, 300, parentId
        );
        vm.stopPrank();
    }

    function testHonestSale() public {
        vm.startPrank(buyer);
        saleId = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
        vm.stopPrank();

        vm.prank(seller);
        escrow.deliver(saleId, abi.encodePacked(K));

        vm.prank(buyer);
        escrow.confirm(saleId);

        uint256 royaltyAmt = (1 ether * 300) / 10000;
        uint256 sellerAmt = 1 ether - royaltyAmt;
        assertEq(seller.balance, 10 ether - 2 ether + sellerAmt);
        assertEq(royalty.creditOf(parentSeller), royaltyAmt);
        assertEq(lic.balanceOf(buyer, assetId), 1);
    }

    function testTimeoutConfirm() public {
        vm.startPrank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
        vm.stopPrank();

        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        // buyer does nothing; seller claims timeout
        vm.warp(block.timestamp + 4 days);
        vm.prank(seller);
        escrow.timeoutConfirm(sid);

        assertEq(lic.balanceOf(buyer, assetId), 1);
    }
}