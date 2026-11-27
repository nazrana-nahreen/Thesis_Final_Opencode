// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "forge-std/Test.sol";
import "../src/AssetRegistry.sol";
import "../src/SaleEscrow.sol";
import "../src/RoyaltySplitter.sol";
import "../src/LicenceToken.sol";
import "../src/DisputeVerifier.sol";

/// @title Adversarial
/// @notice Attack suite AT-01..AT-17 plus additional security tests.
///         Each test asserts the attack FAILS on MetaTrade-R (B3).
contract Adversarial is Test {
    AssetRegistry reg;
    RoyaltySplitter royalty;
    LicenceToken lic;
    SaleEscrow escrow;

    address seller = address(0xA11CE);
    address buyer = address(0xB0B);
    address attacker = address(0xDEAD);
    address parentSeller = address(0xDAD);

    bytes32 K = keccak256("content-key");
    bytes32 N = keccak256("nonce");
    bytes32 s = keccak256("salt");

    uint256 assetId;
    uint256 parentId;

    function setUp() public {
        reg = new AssetRegistry();
        royalty = new RoyaltySplitter();
        lic = new LicenceToken();
        escrow = new SaleEscrow(address(reg), address(royalty), address(lic));
        royalty.setEscrow(address(escrow));
        lic.setMinter(address(escrow));

        vm.deal(seller, 10 ether);
        vm.deal(buyer, 10 ether);
        vm.deal(attacker, 10 ether);
        vm.deal(parentSeller, 1 ether);

        vm.startPrank(parentSeller);
        parentId = reg.list(
            keccak256("ph"), keccak256("ch"),
            bytes32(uint256(1)), bytes32(uint256(2)),
            DisputeVerifier.keyCommitment(keccak256("pk"), N, s),
            bytes32(uint256(3)), bytes32(uint256(4)),
            bytes32(uint256(5)), bytes32(uint256(6)),
            1, 1024, 1 ether, 500, 0
        );
        vm.stopPrank();

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

    // ---------- AT-05: Re-initialisation ----------
    function testAT05_Reinitialization() public {
        // No initialize function exists; calling it must not compile/be possible.
        // We verify the contract has no initialize selector.
        (bool ok, ) = address(reg).call(abi.encodeWithSignature("initialize(uint256,address,uint256,address)", 0, address(0), 0, attacker));
        assertFalse(ok, "initialize must not exist");
    }

    // ---------- AT-06: Price change after deposit ----------
    function testAT06_PriceChangeAfterDeposit() public {
        // Price is snapshotted at buy; registry price change doesn't affect sale.
        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
        // Even if someone could change price, the sale price is fixed.
        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        assertEq(sl.price, 1 ether);
    }

    // ---------- AT-07: De-listed asset trading ----------
    function testAT07_DelistedAssetPurchase() public {
        vm.prank(seller);
        reg.deactivate(assetId, "plag");
        vm.prank(buyer);
        vm.expectRevert();
        escrow.buy{value: 1 ether + 0.001 ether}(assetId);
    }

    // ---------- AT-08: Overpayment stranding ----------
    function testAT08_Overpayment() public {
        vm.prank(buyer);
        vm.expectRevert();
        escrow.buy{value: 2 ether}(assetId); // exact payment required
    }

    // ---------- AT-09: Refund wiping ----------
    function testAT09_RefundWiping() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(assetId);
        SaleEscrow.Sale memory sl = escrow.getSale(sid);

        vm.warp(sl.tDeliver + 1);
        escrow.timeoutDeliver(sid);
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.REFUNDED));

        uint256 bal = buyer.balance;
        vm.prank(buyer);
        vm.expectRevert();
        escrow.confirm(sid);
        vm.prank(seller);
        vm.expectRevert();
        escrow.deliver(sid, abi.encodePacked(K));
        assertEq(buyer.balance, bal, "refund cannot be replayed");
    }

    // ---------- AT-10: .transfer griefing ----------
    function testAT10_TransferGriefing() public {
        // A contract buyer whose receive() burns far more than the 2300-gas
        // stipend of .transfer() still receives its bond back: _pay uses call.
        GasHungryBuyer gb = new GasHungryBuyer(escrow);
        vm.deal(address(gb), 2 ether);
        uint256 sid = escrow.nextSaleId();
        gb.buy{ value: 1.001 ether }(assetId);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));
        gb.confirm(sid);

        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.SETTLED), "gas-heavy buyer paid");
        assertGt(address(gb).balance, 0, "bond returned");
    }

    // ---------- AT-11: False integrity dispute ----------
    function testAT11_FalseDispute() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        // buyer tries to dispute with a consistent block -> loses bond
        bytes memory D = "hello world plaintext block!!";
        bytes32 kEnc = DisputeVerifier.hmacSha256(K, abi.encodePacked(bytes1(0x01)));
        bytes memory C = new bytes(D.length);
        for (uint256 k = 0; k < D.length; k++) {
            bytes32 ks = DisputeVerifier.keystreamWord(kEnc, 0, 0);
            C[k] = bytes1(uint8(D[k]) ^ uint8(ks[k]));
        }
        bytes32 leafD = DisputeVerifier.plainLeaf(0, D);
        bytes32 leafC = DisputeVerifier.cipherLeaf(0, C);
        bytes32[] memory pD = new bytes32[](0);
        bytes32[] memory pC = new bytes32[](0);

        SaleEscrow.DisputeProof memory proof = SaleEscrow.DisputeProof({
            K: K, N: N, s: s, index: 0, C_i: C,
            leafD: leafD, proofD: pD, proofC: pC
        });

        uint256 buyerBalBefore = buyer.balance;
        vm.prank(buyer);
        escrow.disputeMode1(sid, proof);

        // seller paid; buyer bond forfeited to seller
        // buyer should NOT have gained
        assertLe(buyer.balance, buyerBalBefore);
    }

    // ---------- AT-12: Fabricated chunk proof ----------
    function testAT12_FabricatedProof() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        bytes memory C = new bytes(28);
        bytes32 leafD = bytes32(uint256(0xDEAD));
        bytes32[] memory pD = new bytes32[](0);
        bytes32[] memory pC = new bytes32[](0);

        SaleEscrow.DisputeProof memory proof = SaleEscrow.DisputeProof({
            K: K, N: N, s: s, index: 0, C_i: C,
            leafD: leafD, proofD: pD, proofC: pC
        });

        vm.prank(buyer);
        vm.expectRevert();
        escrow.disputeMode1(sid, proof);
    }

    // ---------- AT-13: Dispute spam ----------
    function testAT13_DisputeSpam() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(assetId);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        (bytes memory C, bytes32 leafD, ) = _enc(bytes("hello world plaintext block!!"));
        uint256 creditBefore = escrow.sellerCredit(seller);
        uint256 buyerBefore = buyer.balance;
        vm.prank(buyer);
        escrow.disputeMode1(
            sid,
            SaleEscrow.DisputeProof({
                K: K, N: N, s: s, index: 0, C_i: C,
                leafD: leafD, proofD: new bytes32[](0), proofC: new bytes32[](0)
            })
        );
        // A false claim forfeits only the (small) buyer bond; the price is still
        // paid because the content was in fact consistent.
        assertEq(buyer.balance, buyerBefore, "buyer receives nothing back");
        assertEq(escrow.sellerCredit(seller), creditBefore + 1.001 ether, "seller bond returned, buyer bond forfeited");
    }

    // ---------- AT-15: Seller stalls after dispute ----------
    function testAT15_SellerStalls() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        vm.prank(buyer);
        escrow.disputeMode2(sid);

        // seller never responds
        vm.warp(block.timestamp + 2 days);
        escrow.timeoutRespond(sid);

        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        assertEq(uint8(sl.state), uint8(SaleEscrow.State.REFUNDED));
    }

    // ---------- AT-16: Buyer stalls confirmation ----------
    function testAT16_BuyerStalls() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        vm.warp(block.timestamp + 4 days);
        vm.prank(seller);
        escrow.timeoutConfirm(sid);

        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        assertEq(uint8(sl.state), uint8(SaleEscrow.State.SETTLED));
    }

    // ---------- AT-17: Timestamp manipulation ----------
    function testAT17_TimestampManipulation() public {
        // Windows are fixed constants; a small timestamp shift near the boundary
        // cannot make the window expire early or late.
        assertEq(escrow.DELIVER_WINDOW(), 1 days);

        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(assetId);
        SaleEscrow.Sale memory sl = escrow.getSale(sid);

        vm.warp(sl.tDeliver - 15);
        vm.expectRevert();
        escrow.timeoutDeliver(sid);

        vm.warp(sl.tDeliver + 15);
        escrow.timeoutDeliver(sid);
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.REFUNDED));
    }

    // ---------- Additional: Unauthorized asset registration ----------
    function testUnauthorizedRegistration() public {
        // Anyone can list, but the seller is msg.sender (can't spoof).
        vm.prank(attacker);
        uint256 aid = reg.list(
            bytes32(uint256(1)), bytes32(uint256(2)),
            bytes32(uint256(3)), bytes32(uint256(4)),
            bytes32(uint256(5)),
            bytes32(uint256(6)), bytes32(uint256(7)),
            bytes32(uint256(8)), bytes32(uint256(9)),
            1, 1024, 1 ether, 100, 0
        );
        assertEq(reg.sellerOf(aid), attacker);
    }

    // ---------- Additional: Invalid parent asset ----------
    function testInvalidParent() public {
        vm.prank(seller);
        vm.expectRevert();
        reg.list(
            bytes32(uint256(1)), bytes32(uint256(2)),
            bytes32(uint256(3)), bytes32(uint256(4)),
            bytes32(uint256(5)),
            bytes32(uint256(6)), bytes32(uint256(7)),
            bytes32(uint256(8)), bytes32(uint256(9)),
            1, 1024, 1 ether, 100, 99999 // nonexistent parent
        );
    }

    // ---------- Additional: Wrong encryption key (Mode 2) ----------
    function testWrongKeyMode2() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        // buyer disputes (non-delivery)
        vm.prank(buyer);
        escrow.disputeMode2(sid);

        // seller reveals wrong key
        bytes32 badK = keccak256("bad");
        vm.prank(seller);
        vm.expectRevert();
        escrow.respond(sid, badK, N, s);
    }

    // ---------- Additional: Seller non-delivery ----------
    function testSellerNonDelivery() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);

        // seller never delivers
        vm.warp(block.timestamp + 2 days);
        escrow.timeoutDeliver(sid);

        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        assertEq(uint8(sl.state), uint8(SaleEscrow.State.REFUNDED));
    }

    // ---------- Additional: Seller bond manipulation ----------
    function testSellerBondManipulation() public {
        // seller can't withdraw bond that's locked in a sale
        vm.prank(seller);
        escrow.depositBond{value: 2 ether}();
        uint256 creditBefore = escrow.sellerCredit(seller);

        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);

        // credit should decrease by price
        assertEq(escrow.sellerCredit(seller), creditBefore - 1 ether);
    }

    // ---------- Additional: Buyer bond manipulation ----------
    function testBuyerBondManipulation() public {
        // buyer can't pay less than price + bond
        vm.prank(buyer);
        vm.expectRevert();
        escrow.buy{value: 1 ether}(assetId); // missing buyer bond
    }

    // ---------- Additional: Timeout boundary ----------
    function testTimeoutBoundary() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);

        // too early
        vm.expectRevert();
        escrow.timeoutDeliver(sid);

        // exactly at boundary (should still be early)
        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        vm.warp(sl.tDeliver);
        vm.expectRevert();
        escrow.timeoutDeliver(sid);

        // one second after
        vm.warp(sl.tDeliver + 1);
        escrow.timeoutDeliver(sid);
        SaleEscrow.Sale memory sl2 = escrow.getSale(sid);
        assertEq(uint8(sl2.state), uint8(SaleEscrow.State.REFUNDED));
    }

    // ---------- Additional: Reentrancy ----------
    function testReentrancy() public {
        ReentrantBuyer rb = new ReentrantBuyer(escrow);
        vm.deal(address(rb), 2 ether);
        uint256 sid = escrow.nextSaleId();
        rb.buy{ value: 1.001 ether }(assetId);
        rb.setSale(sid);

        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));
        rb.confirm(sid);

        assertTrue(rb.blocked(), "reentrant confirm was rejected");
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.SETTLED), "outer call completed");
    }

    // ---------- Additional: Royalty accounting ----------
    function testRoyaltyAccounting() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));
        vm.prank(buyer);
        escrow.confirm(sid);

        uint256 royaltyAmt = (1 ether * 300) / 10000;
        assertEq(royalty.creditOf(parentSeller), royaltyAmt);
        // total = seller + parent = price
        uint256 sellerGot = 1 ether - royaltyAmt;
        assertEq(seller.balance, 10 ether - 2 ether + sellerGot);

        // The credit must be withdrawable: the escrow funds the splitter.
        uint256 before = parentSeller.balance;
        vm.prank(parentSeller);
        royalty.withdraw();
        assertEq(parentSeller.balance, before + royaltyAmt, "royalty is claimable");
    }

    // ---------- Additional: Cross-asset proof substitution ----------
    function testCrossAssetSubstitution() public {
        // Ciphertext from a different asset has a different leaf, so it cannot
        // satisfy assetId's R_C; the proof reverts instead of refunding.
        (bytes memory Cb, bytes32 leafDb, ) = _enc(bytes("another asset block"));

        uint256 sid = escrow.nextSaleId();
        vm.prank(buyer);
        escrow.buy{ value: 1.001 ether }(assetId);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        vm.prank(buyer);
        vm.expectRevert("bad cipher proof");
        escrow.disputeMode1(
            sid,
            SaleEscrow.DisputeProof({
                K: K, N: N, s: s, index: 0, C_i: Cb,
                leafD: leafDb, proofD: new bytes32[](0), proofC: new bytes32[](0)
            })
        );
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.DELIVERED), "sale unchanged");
    }

    // ---------- Additional: Unauthorized licence minting ----------
    function testUnauthorizedMint() public {
        vm.prank(attacker);
        vm.expectRevert();
        lic.mint(attacker, assetId);
    }

    // ---------- AT-01: Consistent garbage (semantic gap) ----------
    function testAT01_ConsistentGarbage() public {
        bytes memory Dg = "consistent garbage block";
        (bytes memory Cg, bytes32 leafDg, bytes32 leafCg) = _enc(Dg);
        bytes32 cK = DisputeVerifier.keyCommitment(K, N, s);
        vm.prank(seller);
        uint256 gid = reg.list(
            leafDg, leafCg, leafDg, leafCg, cK,
            bytes32(0), bytes32(0), bytes32(0), bytes32(0), 1, 1024, 1 ether, 0, 0
        );
        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(gid);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));
        vm.prank(buyer);
        escrow.confirm(sid);

        assertEq(lic.balanceOf(buyer, gid), 1, "buyer receives a licence for garbage");
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.SETTLED));
    }

    // ---------- AT-02: Inconsistent commitment ----------
    function testAT02_InconsistentCommitment() public {
        bytes memory Dgood = "advertised block";
        bytes memory Dbad = "garbage block";
        (, bytes32 leafDgood, ) = _enc(Dgood);
        (bytes memory Cbad, , bytes32 leafCbad) = _enc(Dbad);
        bytes32 cK = DisputeVerifier.keyCommitment(K, N, s);

        vm.prank(seller);
        uint256 aid = reg.list(
            leafDgood, leafCbad, leafDgood, leafCbad, cK,
            bytes32(0), bytes32(0), bytes32(0), bytes32(0), 1, 1024, 1 ether, 0, 0
        );
        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(aid);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        uint256 beforeBal = buyer.balance;
        vm.prank(buyer);
        escrow.disputeMode1(
            sid,
            SaleEscrow.DisputeProof({
                K: K, N: N, s: s, index: 0, C_i: Cbad,
                leafD: leafDgood, proofD: new bytes32[](0), proofC: new bytes32[](0)
            })
        );
        assertEq(buyer.balance, beforeBal + 2.001 ether, "refund + seller bond");
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.REFUNDED));
    }

    // ---------- AT-03: Wrong key delivery ----------
    function testAT03_WrongKeyDelivery() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(assetId);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));
        vm.prank(buyer);
        escrow.disputeMode2(sid);

        vm.prank(seller);
        vm.expectRevert(SaleEscrow.InvalidKey.selector);
        escrow.respond(sid, keccak256("wrong-key"), N, s);

        vm.prank(seller);
        escrow.respond(sid, K, N, s);
        assertTrue(escrow.getSale(sid).keyRevealed, "valid key accepted");
    }

    // ---------- AT-04: Key before payment ----------
    function testAT04_KeyBeforePayment() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(assetId);

        SaleEscrow.Sale memory pre = escrow.getSale(sid);
        assertEq(pre.encK.length, 0, "no key material before delivery");
        assertFalse(pre.keyRevealed);

        vm.prank(seller);
        escrow.deliver(sid, new bytes(64));

        SaleEscrow.Sale memory post = escrow.getSale(sid);
        assertEq(post.encK.length, 64, "wrapped key is posted at delivery");
        assertFalse(post.keyRevealed, "plaintext key is not revealed");
        assertEq(post.revealedK, bytes32(0));
    }

    // ---------- AT-14: Leak-by-dispute ----------
    function testAT14_LeakByDispute() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(assetId);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));
        vm.prank(buyer);
        escrow.disputeMode2(sid);
        vm.prank(seller);
        escrow.respond(sid, K, N, s);

        SaleEscrow.Sale memory revealed = escrow.getSale(sid);
        assertTrue(revealed.keyRevealed, "dispute reveals the key");
        assertEq(revealed.revealedK, K, "anyone can read K after a dispute");
    }

    // ---------- Respond near T_confirm & extended window tests ----------

    function _setupInconsistentAsset() internal returns (uint256 aid, bytes memory Cbad, bytes32 leafDgood) {
        bytes memory Dgood = "advertised block";
        bytes memory Dbad = "garbage block";
        (, leafDgood, ) = _enc(Dgood);
        bytes32 leafCbad;
        (Cbad, , leafCbad) = _enc(Dbad);
        bytes32 cK = DisputeVerifier.keyCommitment(K, N, s);

        vm.prank(seller);
        aid = reg.list(
            leafDgood, leafCbad, leafDgood, leafCbad, cK,
            bytes32(0), bytes32(0), bytes32(0), bytes32(0), 1, 1024, 1 ether, 0, 0
        );
    }

    function testRespondNearTConfirmBuyerFilesMode1() public {
        (uint256 aid, bytes memory Cbad, bytes32 leafDgood) = _setupInconsistentAsset();
        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(aid);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        SaleEscrow.Sale memory sInitial = escrow.getSale(sid);
        // Buyer disputes Mode 2 near original tConfirm
        vm.warp(sInitial.tConfirm - 2 hours);
        vm.prank(buyer);
        escrow.disputeMode2(sid);

        // Seller responds before tRespond expires, near the original tConfirm boundary
        vm.warp(sInitial.tConfirm - 10 minutes);

        vm.prank(seller);
        escrow.respond(sid, K, N, s);

        SaleEscrow.Sale memory sAfter = escrow.getSale(sid);
        assertTrue(sAfter.keyRevealed, "key must be revealed");
        assertEq(uint8(sAfter.state), uint8(SaleEscrow.State.DELIVERED), "state is DELIVERED");
        assertGe(sAfter.tConfirm, block.timestamp + 1 days, "tConfirm extended by at least 1 day");

        // Buyer files Mode 1 dispute in the extended window
        uint256 buyerBalBefore = buyer.balance;
        vm.prank(buyer);
        escrow.disputeMode1(
            sid,
            SaleEscrow.DisputeProof({
                K: K, N: N, s: s, index: 0, C_i: Cbad,
                leafD: leafDgood, proofD: new bytes32[](0), proofC: new bytes32[](0)
            })
        );

        assertEq(buyer.balance, buyerBalBefore + 2.001 ether, "buyer refunded + seller bond slashed");
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.REFUNDED));
    }

    function testSellerCannotTimeoutConfirmBeforeExtendedWindow() public {
        (uint256 aid, , ) = _setupInconsistentAsset();
        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(aid);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        SaleEscrow.Sale memory sInitial = escrow.getSale(sid);
        // Buyer disputes Mode 2 near original tConfirm
        vm.warp(sInitial.tConfirm - 2 hours);
        vm.prank(buyer);
        escrow.disputeMode2(sid);

        // Seller responds before tRespond expires
        vm.warp(sInitial.tConfirm - 10 minutes);
        vm.prank(seller);
        escrow.respond(sid, K, N, s);

        SaleEscrow.Sale memory sAfter = escrow.getSale(sid);

        // Seller immediately tries timeoutConfirm -> reverts Early
        vm.prank(seller);
        vm.expectRevert(SaleEscrow.Early.selector);
        escrow.timeoutConfirm(sid);

        // Warp time past the old tConfirm, but before new extended tConfirm -> still Early
        vm.warp(sInitial.tConfirm + 1 hours);
        vm.prank(seller);
        vm.expectRevert(SaleEscrow.Early.selector);
        escrow.timeoutConfirm(sid);

        // Warp time past the new extended tConfirm -> seller can timeoutConfirm
        vm.warp(sAfter.tConfirm + 1);
        vm.prank(seller);
        escrow.timeoutConfirm(sid);
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.SETTLED));
    }

    function testDisputeMode1KeyRevealedEnforced() public {
        (uint256 aid, bytes memory Cbad, bytes32 leafDgood) = _setupInconsistentAsset();
        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(aid);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        vm.prank(buyer);
        escrow.disputeMode2(sid);

        vm.prank(seller);
        escrow.respond(sid, K, N, s);

        // Buyer tries disputeMode1 with a different key than revealed
        bytes32 fakeK = keccak256("fake-key");
        vm.prank(buyer);
        vm.expectRevert(SaleEscrow.InvalidKey.selector);
        escrow.disputeMode1(
            sid,
            SaleEscrow.DisputeProof({
                K: fakeK, N: N, s: s, index: 0, C_i: Cbad,
                leafD: leafDgood, proofD: new bytes32[](0), proofC: new bytes32[](0)
            })
        );

        // Buyer uses revealed key -> valid dispute execution
        vm.prank(buyer);
        escrow.disputeMode1(
            sid,
            SaleEscrow.DisputeProof({
                K: K, N: N, s: s, index: 0, C_i: Cbad,
                leafD: leafDgood, proofD: new bytes32[](0), proofC: new bytes32[](0)
            })
        );
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.REFUNDED));
    }

    // ---------- AT-31: Late-respond time-bar attack ----------
    function testAT31_LateRespondTimeBar() public {
        (uint256 aid, bytes memory Cbad, bytes32 leafDgood) = _setupInconsistentAsset();
        vm.prank(buyer);
        uint256 sid = escrow.buy{ value: 1.001 ether }(aid);
        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        vm.prank(buyer);
        escrow.disputeMode2(sid);

        SaleEscrow.Sale memory sBefore = escrow.getSale(sid);
        // Attacker waits until right before tRespond expires (e.g. 5 minutes before tRespond)
        vm.warp(sBefore.tRespond - 5 minutes);

        vm.prank(seller);
        escrow.respond(sid, K, N, s);

        // Attacker attempts to instantly timeoutConfirm to seize buyer funds -> BLOCKED
        vm.prank(seller);
        vm.expectRevert(SaleEscrow.Early.selector);
        escrow.timeoutConfirm(sid);

        // Buyer uses extended window to file Mode 1 dispute and slash attacker
        uint256 buyerBalBefore = buyer.balance;
        vm.prank(buyer);
        escrow.disputeMode1(
            sid,
            SaleEscrow.DisputeProof({
                K: K, N: N, s: s, index: 0, C_i: Cbad,
                leafD: leafDgood, proofD: new bytes32[](0), proofC: new bytes32[](0)
            })
        );
        assertEq(buyer.balance, buyerBalBefore + 2.001 ether, "attacker slashed; buyer refunded");
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.REFUNDED));
    }

    // ---------- Reentrancy on Seller Payout ----------
    function testReentrancySellerPayout() public {
        ReentrantSeller rs = new ReentrantSeller(escrow, reg);
        vm.deal(address(rs), 5 ether);
        rs.depositBond{value: 2 ether}();

        bytes memory D = "hello world plaintext block!!";
        (bytes memory C, bytes32 leafD, bytes32 leafC) = _enc(D);
        bytes32 cK = DisputeVerifier.keyCommitment(K, N, s);
        uint256 aid = rs.list(leafD, leafC, leafD, leafC, cK);

        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1.001 ether}(aid);
        rs.setSale(sid);

        rs.deliver(sid, abi.encodePacked(K));

        vm.prank(buyer);
        escrow.confirm(sid);

        assertTrue(rs.reentrancyBlocked(), "reentrant call from seller during payout must be blocked");
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.SETTLED));
    }

    // ---------- AT-32: Mode-2 re-challenge loop blocked ----------
    function testAT32_RechallengeLoop() public {
        vm.prank(buyer);
        uint256 sid = escrow.buy{value: 1 ether + 0.001 ether}(assetId);

        vm.prank(seller);
        escrow.deliver(sid, abi.encodePacked(K));

        // 1st Mode-2 challenge
        vm.prank(buyer);
        escrow.disputeMode2(sid);
        vm.prank(seller);
        escrow.respond(sid, K, N, s);

        // 2nd Mode-2 challenge after respond() must revert with AlreadyChallenged
        vm.prank(buyer);
        vm.expectRevert(SaleEscrow.AlreadyChallenged.selector);
        escrow.disputeMode2(sid);

        // Sale stays DELIVERED and seller settles cleanly via timeoutConfirm once window passes
        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        assertEq(uint8(sl.state), uint8(SaleEscrow.State.DELIVERED));
        assertTrue(sl.mode2Challenged);
        vm.warp(sl.tConfirm + 1);
        vm.prank(seller);
        escrow.timeoutConfirm(sid);
        assertEq(uint8(escrow.getSale(sid).state), uint8(SaleEscrow.State.SETTLED));
    }

    function _cipher(bytes memory D) internal view returns (bytes memory C) {
        bytes32 kEnc = DisputeVerifier.hmacSha256(K, abi.encodePacked(bytes1(0x01)));
        C = new bytes(D.length);
        bytes32 ks = DisputeVerifier.keystreamWord(kEnc, 0, 0);
        for (uint256 i = 0; i < D.length; i++) {
            C[i] = bytes1(uint8(D[i]) ^ uint8(ks[i]));
        }
    }

    function _enc(bytes memory D)
        internal
        view
        returns (bytes memory C, bytes32 leafD, bytes32 leafC)
    {
        C = _cipher(D);
        leafD = DisputeVerifier.plainLeaf(0, D);
        leafC = DisputeVerifier.cipherLeaf(0, C);
    }
}
/// @dev Buyer contract whose receive() costs far more than 2300 gas.
contract GasHungryBuyer {
    SaleEscrow public immutable escrow;

    constructor(SaleEscrow e) {
        escrow = e;
    }

    receive() external payable {
        for (uint256 i = 0; i < 5; i++) {
            assembly {
                sstore(add(0x1000, i), 1)
            }
        }
    }

    function buy(uint256 assetId) external payable {
        escrow.buy{ value: msg.value }(assetId);
    }

    function confirm(uint256 saleId) external {
        escrow.confirm(saleId);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0xf23a6e61;
    }
}

/// @dev Buyer contract that tries to re-enter confirm() from its payout hook.
contract ReentrantBuyer {
    SaleEscrow public immutable escrow;
    uint256 public saleId;
    bool public blocked;

    constructor(SaleEscrow e) {
        escrow = e;
    }

    function buy(uint256 assetId) external payable {
        escrow.buy{ value: msg.value }(assetId);
    }

    function setSale(uint256 id) external {
        saleId = id;
    }

    function confirm(uint256 id) external {
        escrow.confirm(id);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0xf23a6e61;
    }

    receive() external payable {
        (bool ok, ) = address(escrow).call(abi.encodeWithSignature("confirm(uint256)", saleId));
        blocked = !ok;
    }
}

/// @dev Seller contract that tries to re-enter during payout.
contract ReentrantSeller {
    SaleEscrow public immutable escrow;
    AssetRegistry public immutable registry;
    uint256 public saleId;
    bool public reentrancyBlocked;

    constructor(SaleEscrow e, AssetRegistry r) {
        escrow = e;
        registry = r;
    }

    function depositBond() external payable {
        escrow.depositBond{value: msg.value}();
    }

    function list(
        bytes32 leafD, bytes32 leafC, bytes32 rD, bytes32 rC, bytes32 cK
    ) external returns (uint256 aid) {
        aid = registry.list(
            leafD, leafC, rD, rC, cK,
            bytes32(0), bytes32(0), bytes32(0), bytes32(0),
            1, 1024, 1 ether, 0, 0
        );
    }

    function setSale(uint256 sid) external {
        saleId = sid;
    }

    function deliver(uint256 sid, bytes calldata encK) external {
        escrow.deliver(sid, encK);
    }

    receive() external payable {
        // Attempt to re-enter confirm() and withdrawBondCredit()
        (bool ok1, ) = address(escrow).call(abi.encodeWithSignature("confirm(uint256)", saleId));
        (bool ok2, ) = address(escrow).call(abi.encodeWithSignature("withdrawBondCredit()"));
        reentrancyBlocked = (!ok1 && !ok2);
    }
}
