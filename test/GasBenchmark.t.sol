// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "forge-std/Test.sol";
import "../src/AssetRegistry.sol";
import "../src/SaleEscrow.sol";
import "../src/RoyaltySplitter.sol";
import "../src/LicenceToken.sol";
import "../src/DisputeVerifier.sol";

/// @title GasBenchmark
/// @notice Measures isolated transaction gas (excluding deployment/setup).
contract GasBenchmark is Test {
    AssetRegistry reg;
    RoyaltySplitter royalty;
    LicenceToken lic;
    SaleEscrow escrow;

    address seller = address(0xA11CE);
    address buyer = address(0xB0B);
    address parentSeller = address(0xDAD);

    bytes32 K = keccak256("content-key");
    bytes32 N = keccak256("nonce");
    bytes32 s = keccak256("salt");

    uint256 assetId;
    uint256 saleId;
    uint256 badAssetId;
    uint256 badSaleId;
    bytes badC;
    bytes32 badLeafD;

    function setUp() public {
        reg = new AssetRegistry();
        royalty = new RoyaltySplitter();
        lic = new LicenceToken();
        escrow = new SaleEscrow(address(reg), address(royalty), address(lic));
        royalty.setEscrow(address(escrow));
        lic.setMinter(address(escrow));

        vm.deal(seller, 100 ether);
        vm.deal(buyer, 100 ether);
        vm.deal(parentSeller, 10 ether);

        // Parent asset
        vm.startPrank(parentSeller);
        uint256 parentId = reg.list(
            keccak256("ph"), keccak256("ch"),
            bytes32(uint256(1)), bytes32(uint256(2)),
            DisputeVerifier.keyCommitment(keccak256("pk"), N, s),
            bytes32(uint256(3)), bytes32(uint256(4)),
            bytes32(uint256(5)), bytes32(uint256(6)),
            1, 1024, 1 ether, 500, 0
        );
        vm.stopPrank();

        // Child asset (honest/consistent) and extra bond credit for isolated tests
        vm.startPrank(seller);
        escrow.depositBond{value: 10 ether}();
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

        // Inconsistent asset for Mode-1 dispute benchmark
        badC = C;
        badLeafD = keccak256("tampered-or-inconsistent-plaintext-leaf");
        badAssetId = reg.list(
            badLeafD, leafC, badLeafD, leafC, cK,
            bytes32(uint256(20)), bytes32(uint256(21)),
            bytes32(uint256(22)), bytes32(uint256(23)),
            1, 1024, 1 ether, 300, parentId
        );
        vm.stopPrank();

        // Pre-settled sale to give parentSeller withdrawable royalty credit for testGasRoyaltyWithdraw
        vm.prank(buyer);
        uint256 settledSid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
        vm.prank(seller);
        escrow.deliver(settledSid, abi.encodePacked(K));
        vm.prank(buyer);
        escrow.confirm(settledSid);

        // Prepare badSaleId in DELIVERED state for testGasDisputeMode1_Inconsistent
        vm.prank(buyer);
        badSaleId = escrow.buy{value: 1 ether + 0.001 ether}(badAssetId);
        vm.prank(seller);
        escrow.deliver(badSaleId, abi.encodePacked(K));

        // Primary saleId in ESCROWED state for per-operation tests
        vm.prank(buyer);
        saleId = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
    }

    // Measure: isolated buy()
    function testGasBuy() public {
        vm.prank(buyer);
        uint256 sid2 = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
        assertEq(uint8(escrow.getSale(sid2).state), uint8(SaleEscrow.State.ESCROWED));
    }

    function testGasDeliver() public {
        vm.prank(seller);
        escrow.deliver(saleId, abi.encodePacked(K));
        assertEq(uint8(escrow.getSale(saleId).state), uint8(SaleEscrow.State.DELIVERED));
    }

    function testGasConfirm() public {
        vm.prank(seller);
        escrow.deliver(saleId, abi.encodePacked(K));
        vm.prank(buyer);
        escrow.confirm(saleId);
        assertEq(uint8(escrow.getSale(saleId).state), uint8(SaleEscrow.State.SETTLED));
        assertGe(lic.balanceOf(buyer, assetId), 1);
    }

    function testGasDisputeMode1_Consistent() public {
        vm.prank(seller);
        escrow.deliver(saleId, abi.encodePacked(K));

        bytes memory D = "hello world plaintext block!!";
        bytes32 kEnc = DisputeVerifier.hmacSha256(K, abi.encodePacked(bytes1(0x01)));
        bytes memory C = new bytes(D.length);
        for (uint256 k = 0; k < D.length; k++) {
            bytes32 ks = DisputeVerifier.keystreamWord(kEnc, 0, 0);
            C[k] = bytes1(uint8(D[k]) ^ uint8(ks[k]));
        }
        bytes32 leafD = DisputeVerifier.plainLeaf(0, D);
        bytes32[] memory pD = new bytes32[](0);
        bytes32[] memory pC = new bytes32[](0);

        SaleEscrow.DisputeProof memory proof = SaleEscrow.DisputeProof({
            K: K, N: N, s: s, index: 0, C_i: C,
            leafD: leafD, proofD: pD, proofC: pC
        });

        vm.prank(buyer);
        escrow.disputeMode1(saleId, proof);
        assertEq(uint8(escrow.getSale(saleId).state), uint8(SaleEscrow.State.SETTLED));
    }

    function testGasDisputeMode1_Inconsistent() public {
        bytes32[] memory pD = new bytes32[](0);
        bytes32[] memory pC = new bytes32[](0);

        SaleEscrow.DisputeProof memory proof = SaleEscrow.DisputeProof({
            K: K, N: N, s: s, index: 0, C_i: badC,
            leafD: badLeafD, proofD: pD, proofC: pC
        });

        uint256 buyerBefore = buyer.balance;
        vm.prank(buyer);
        escrow.disputeMode1(badSaleId, proof);

        assertEq(uint8(escrow.getSale(badSaleId).state), uint8(SaleEscrow.State.REFUNDED));
        assertEq(buyer.balance, buyerBefore + 2 ether + 0.001 ether);
    }

    function testGasDisputeMode2() public {
        vm.prank(seller);
        escrow.deliver(saleId, abi.encodePacked(K));
        vm.prank(buyer);
        escrow.disputeMode2(saleId);
        assertEq(uint8(escrow.getSale(saleId).state), uint8(SaleEscrow.State.CHALLENGED));
    }

    function testGasRespond() public {
        vm.prank(seller);
        escrow.deliver(saleId, abi.encodePacked(K));
        vm.prank(buyer);
        escrow.disputeMode2(saleId);
        vm.prank(seller);
        escrow.respond(saleId, K, N, s);
        assertEq(uint8(escrow.getSale(saleId).state), uint8(SaleEscrow.State.DELIVERED));
        assertTrue(escrow.getSale(saleId).keyRevealed);
    }

    function testGasTimeoutDeliver() public {
        vm.warp(block.timestamp + 2 days);
        escrow.timeoutDeliver(saleId);
        assertEq(uint8(escrow.getSale(saleId).state), uint8(SaleEscrow.State.REFUNDED));
    }

    function testGasTimeoutConfirm() public {
        vm.prank(seller);
        escrow.deliver(saleId, abi.encodePacked(K));
        vm.warp(block.timestamp + 4 days);
        vm.prank(seller);
        escrow.timeoutConfirm(saleId);
        assertEq(uint8(escrow.getSale(saleId).state), uint8(SaleEscrow.State.SETTLED));
    }

    function testGasTimeoutRespond() public {
        vm.prank(seller);
        escrow.deliver(saleId, abi.encodePacked(K));
        vm.prank(buyer);
        escrow.disputeMode2(saleId);
        vm.warp(block.timestamp + 2 days);
        escrow.timeoutRespond(saleId);
        assertEq(uint8(escrow.getSale(saleId).state), uint8(SaleEscrow.State.REFUNDED));
    }

    function testGasRoyaltyWithdraw() public {
        uint256 balBefore = parentSeller.balance;
        uint256 expectedCredit = (1 ether * 300) / 10000;
        assertEq(royalty.creditOf(parentSeller), expectedCredit);
        vm.prank(parentSeller);
        royalty.withdraw();
        assertEq(parentSeller.balance, balBefore + expectedCredit);
        assertEq(royalty.creditOf(parentSeller), 0);
    }

    function testGasLicenceMint() public {
        uint256 beforeBal = lic.balanceOf(buyer, assetId);
        vm.prank(address(escrow));
        lic.mint(buyer, assetId);
        assertEq(lic.balanceOf(buyer, assetId), beforeBal + 1);
    }
}