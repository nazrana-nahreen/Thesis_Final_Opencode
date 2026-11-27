// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import "forge-std/Test.sol";
import "../src/baselines/NaiveEscrow.sol";
import "../src/baselines/FairSwapLite.sol";
import "../src/DisputeVerifier.sol";

/// @title Baselines
/// @notice Executes the applicable attack scenarios against the two comparison
///         baselines. Each test asserts the *observed* outcome; a passing test
///         means the baseline behaves as the thesis claims, not that it is safe.
contract Baselines is Test {
    NaiveEscrow b1;
    FairSwapLite b2;

    address seller = address(0xA11CE);
    address buyer = address(0xB0B);
    address attacker = address(0xBAD);

    bytes32 constant K_HONEST = keccak256("honest-key");
    bytes32 constant K_WRONG = keccak256("wrong-key");

    function setUp() public {
        b1 = new NaiveEscrow();
        b2 = new FairSwapLite();
        vm.deal(seller, 100 ether);
        vm.deal(buyer, 100 ether);
        vm.deal(attacker, 100 ether);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _encrypt(bytes memory D, bytes32 K)
        internal
        pure
        returns (bytes memory C, bytes32 leafD, bytes32 leafC)
    {
        bytes32 kEnc = DisputeVerifier.hmacSha256(K, abi.encodePacked(bytes1(0x01)));
        C = new bytes(D.length);
        bytes32 ks = DisputeVerifier.keystreamWord(kEnc, 0, 0);
        for (uint256 i = 0; i < D.length; i++) {
            C[i] = bytes1(uint8(D[i]) ^ uint8(ks[i]));
        }
        leafD = DisputeVerifier.plainLeaf(0, D);
        leafC = DisputeVerifier.cipherLeaf(0, C);
    }

    function _listB2(bytes32 hD, bytes32 R_D, bytes32 R_C, uint64 price)
        internal
        returns (uint256 id)
    {
        vm.prank(seller);
        id = b2.list(hD, R_D, R_C, 1, 1024, price);
    }

    // ------------------------------------------------------------------
    // B1: NaiveEscrow
    // ------------------------------------------------------------------

    /// AT-01: no verification, so a seller can deliver a hash unrelated to the
    /// advertised content and still be paid.
    function testB1_AT01_ConsistentGarbageAccepted() public {
        vm.prank(seller);
        uint256 assetId = b1.list(1 ether);

        vm.prank(buyer);
        uint256 saleId = b1.buy{ value: 1 ether }(assetId);

        vm.prank(seller);
        b1.deliver(saleId, keccak256("garbage-not-the-preview"));

        uint256 before = seller.balance;
        vm.prank(buyer);
        b1.confirm(saleId);

        assertEq(seller.balance, before + 1 ether, "seller paid for unverified bytes");
    }

    /// AT-03: there is no timeout and no buyer-initiated refund, so a
    /// non-delivering seller can strand the buyer's funds indefinitely.
    function testB1_AT03_NonDeliveryStrandsFunds() public {
        vm.prank(seller);
        uint256 assetId = b1.list(1 ether);

        vm.prank(buyer);
        b1.buy{ value: 1 ether }(assetId);

        vm.prank(buyer);
        vm.expectRevert(NaiveEscrow.NotSeller.selector);
        b1.refund(1);

        assertEq(address(b1).balance, 1 ether, "buyer funds remain locked");
    }

    /// AT-08: overpayment is accepted and cannot be recovered.
    function testB1_AT08_OverpaymentStranded() public {
        vm.prank(seller);
        uint256 assetId = b1.list(1 ether);

        vm.prank(buyer);
        uint256 saleId = b1.buy{ value: 1.5 ether }(assetId);

        vm.prank(seller);
        b1.deliver(saleId, keccak256("x"));

        vm.prank(buyer);
        b1.confirm(saleId);

        assertEq(address(b1).balance, 0.5 ether, "excess is stranded in the contract");
    }

    /// AT-06 is blocked: the price is snapshotted at buy().
    function testB1_AT06_PriceSnapshotBlocksRaise() public {
        vm.prank(seller);
        uint256 assetId = b1.list(1 ether);

        vm.prank(buyer);
        uint256 saleId = b1.buy{ value: 1 ether }(assetId);

        vm.prank(seller);
        b1.updatePrice(assetId, 2 ether);

        vm.prank(seller);
        b1.deliver(saleId, keccak256("x"));

        uint256 before = seller.balance;
        vm.prank(buyer);
        b1.confirm(saleId);
        assertEq(seller.balance, before + 1 ether, "sale keeps the snapshotted price");
    }

    // ------------------------------------------------------------------
    // B2: FairSwapLite
    // ------------------------------------------------------------------

    /// AT-01: integrity is enforced, but consistency with the advertisement is
    /// not. A seller can commit to garbage and be paid.
    function testB2_AT01_ConsistentGarbageAccepted() public {
        bytes memory garbage = "not the advertised asset";
        (, bytes32 leafD, bytes32 leafC) = _encrypt(garbage, K_HONEST);
        uint256 assetId = _listB2(leafD, leafD, leafC, 1 ether);

        vm.prank(buyer);
        uint256 saleId = b2.buy{ value: 1 ether }(assetId);
        vm.prank(seller);
        b2.revealKey(saleId, K_HONEST);

        uint256 before = seller.balance;
        vm.prank(buyer);
        b2.confirm(saleId);
        assertEq(seller.balance, before + 1 ether, "semantic gap remains in B2");
    }

    /// AT-02: an inconsistent commitment is caught by the one-block proof.
    function testB2_AT02_InconsistentCommitmentRefunded() public {
        bytes memory realD = "the real advertised block";
        bytes memory garbage = "garbage block";
        (bytes memory C, , bytes32 leafC) = _encrypt(garbage, K_HONEST);
        (, bytes32 leafRealD, ) = _encrypt(realD, K_HONEST);
        uint256 assetId = _listB2(leafRealD, leafRealD, leafC, 1 ether);

        vm.prank(buyer);
        uint256 saleId = b2.buy{ value: 1 ether }(assetId);
        vm.prank(seller);
        b2.revealKey(saleId, K_HONEST);

        uint256 before = buyer.balance;
        vm.prank(buyer);
        b2.dispute(saleId, 0, C, leafRealD, new bytes32[](0), new bytes32[](0));

        assertEq(buyer.balance, before + 1 ether, "buyer refunded");
        assertEq(uint8(b2.stateOf(saleId)), uint8(FairSwapLite.State.REFUNDED));
    }

    /// AT-03: a wrong key is exposed by submitting the committed block; the
    /// buyer is refunded (no honest-path confidentiality is claimed in B2).
    function testB2_AT03_WrongKeyRefunded() public {
        bytes memory D = "correct block";
        (bytes memory C, bytes32 leafD, bytes32 leafC) = _encrypt(D, K_HONEST);
        uint256 assetId = _listB2(leafD, leafD, leafC, 1 ether);

        vm.prank(buyer);
        uint256 saleId = b2.buy{ value: 1 ether }(assetId);
        vm.prank(seller);
        b2.revealKey(saleId, K_WRONG);

        uint256 before = buyer.balance;
        vm.prank(buyer);
        b2.dispute(saleId, 0, C, leafD, new bytes32[](0), new bytes32[](0));
        assertEq(buyer.balance, before + 1 ether, "wrong key refunds");
    }

    /// AT-04/AT-14: the reveal is public. Any observer reads K immediately,
    /// so confidentiality is lost on every sale, not only on a dispute.
    function testB2_AT14_KeyPublicAfterEverySale() public {
        bytes memory D = "secret asset";
        (, bytes32 leafD, bytes32 leafC) = _encrypt(D, K_HONEST);
        uint256 assetId = _listB2(leafD, leafD, leafC, 1 ether);

        vm.prank(buyer);
        uint256 saleId = b2.buy{ value: 1 ether }(assetId);
        vm.prank(seller);
        b2.revealKey(saleId, K_HONEST);

        vm.prank(attacker);
        bytes32 observed = b2.keyOf(saleId);
        assertEq(observed, K_HONEST, "anyone can read the content key");
    }

    /// AT-11: a buyer cannot obtain a refund for consistent content.
    function testB2_AT11_FalseDisputeRejected() public {
        bytes memory D = "correct block";
        (bytes memory C, bytes32 leafD, bytes32 leafC) = _encrypt(D, K_HONEST);
        uint256 assetId = _listB2(leafD, leafD, leafC, 1 ether);

        vm.prank(buyer);
        uint256 saleId = b2.buy{ value: 1 ether }(assetId);
        vm.prank(seller);
        b2.revealKey(saleId, K_HONEST);

        vm.prank(buyer);
        vm.expectRevert(FairSwapLite.Consistent.selector);
        b2.dispute(saleId, 0, C, leafD, new bytes32[](0), new bytes32[](0));
    }

    /// AT-12: a fabricated ciphertext block fails the Merkle check.
    function testB2_AT12_FabricatedProofRejected() public {
        bytes memory D = "correct block";
        (bytes memory C, bytes32 leafD, bytes32 leafC) = _encrypt(D, K_HONEST);
        uint256 assetId = _listB2(leafD, leafD, leafC, 1 ether);

        vm.prank(buyer);
        uint256 saleId = b2.buy{ value: 1 ether }(assetId);
        vm.prank(seller);
        b2.revealKey(saleId, K_HONEST);

        vm.prank(buyer);
        vm.expectRevert("bad cipher proof");
        b2.dispute(saleId, 0, "fabricated", leafD, new bytes32[](0), new bytes32[](0));
    }

    /// AT-15: no reveal within the window -> buyer refunded.
    function testB2_AT15_TimeoutRevealRefunds() public {
        (, bytes32 leafD, bytes32 leafC) = _encrypt("x", K_HONEST);
        uint256 assetId = _listB2(leafD, leafD, leafC, 1 ether);

        vm.prank(buyer);
        uint256 saleId = b2.buy{ value: 1 ether }(assetId);

        vm.warp(block.timestamp + 1 days + 1);
        uint256 before = buyer.balance;
        b2.timeoutReveal(saleId);
        assertEq(buyer.balance, before + 1 ether);
    }

    /// AT-16: a buyer who never confirms cannot block the seller forever.
    function testB2_AT16_TimeoutConfirmPaysSeller() public {
        (, bytes32 leafD, bytes32 leafC) = _encrypt("x", K_HONEST);
        uint256 assetId = _listB2(leafD, leafD, leafC, 1 ether);

        vm.prank(buyer);
        uint256 saleId = b2.buy{ value: 1 ether }(assetId);
        vm.prank(seller);
        b2.revealKey(saleId, K_HONEST);

        vm.warp(block.timestamp + 1 days + 1);
        uint256 before = seller.balance;
        vm.prank(seller);
        b2.timeoutConfirm(saleId);
        assertEq(seller.balance, before + 1 ether);
    }
}
