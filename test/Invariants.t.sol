// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../src/AssetRegistry.sol";
import "../src/SaleEscrow.sol";
import "../src/RoyaltySplitter.sol";
import "../src/LicenceToken.sol";
import "../src/DisputeVerifier.sol";

/// @title Handler
/// @notice Performs random actions on the system for invariant testing.
contract Handler is Test {
    AssetRegistry public reg;
    SaleEscrow public escrow;
    RoyaltySplitter public royalty;
    LicenceToken public lic;

    address[] public actors;
    uint256[] public assetIds;
    uint256[] public saleIds;
    mapping(uint256 => uint8) public terminalState;

    struct AssetMeta {
        bytes32 K;
        bytes32 N;
        bytes32 s;
        bytes C_i;
        bytes32 leafD;
        bool honest;
    }
    mapping(uint256 => AssetMeta) public assetMeta;

    // Ghost counters to verify non-noop execution of every selector
    mapping(bytes4 => uint256) public successCount;

    modifier snapshot() {
        _;
        _recordTerminal();
    }

    constructor(AssetRegistry r, SaleEscrow e, RoyaltySplitter roy, LicenceToken l) {
        reg = r; escrow = e; royalty = roy; lic = l;
        actors.push(address(0xA1));
        actors.push(address(0xB2));
        actors.push(address(0xC3));
        for (uint i = 0; i < actors.length; i++) vm.deal(actors[i], 10_000 ether);
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function saleIdsLength() external view returns (uint256) {
        return saleIds.length;
    }
    function actorsLength() external view returns (uint256) {
        return actors.length;
    }
    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }
    function _recordTerminal() internal {
        for (uint256 i = 0; i < saleIds.length; i++) {
            uint256 sid = saleIds[i];
            uint8 st = uint8(escrow.getSale(sid).state);
            if ((st == 4 || st == 5) && terminalState[sid] == 0) {
                terminalState[sid] = st;
            }
        }
    }
    function terminalViolations() external view returns (uint256 bad) {
        for (uint256 i = 0; i < saleIds.length; i++) {
            uint256 sid = saleIds[i];
            uint8 recorded = terminalState[sid];
            if (recorded != 0 && uint8(escrow.getSale(sid).state) != recorded) bad++;
        }
    }
    function saleIdAt(uint256 i) external view returns (uint256) {
        return saleIds[i];
    }

    function _findSale(uint256 seed, SaleEscrow.State targetState, bool checkDeadline)
        internal
        view
        returns (bool found, uint256 sid)
    {
        uint256 len = saleIds.length;
        if (len == 0) return (false, 0);
        uint256 start = seed % len;
        for (uint256 k = 0; k < len; k++) {
            uint256 idx = (start + k) % len;
            uint256 candidate = saleIds[idx];
            SaleEscrow.Sale memory sl = escrow.getSale(candidate);
            if (sl.state == targetState) {
                if (!checkDeadline) return (true, candidate);
                if (targetState == SaleEscrow.State.ESCROWED && block.timestamp <= sl.tDeliver) return (true, candidate);
                if (targetState == SaleEscrow.State.DELIVERED && block.timestamp <= sl.tConfirm) return (true, candidate);
                if (targetState == SaleEscrow.State.CHALLENGED && block.timestamp <= sl.tRespond) return (true, candidate);
            }
        }
        return (false, 0);
    }

    function listAsset(uint256 seed, uint256 price, uint256 royaltyBps, bool honest) public snapshot {
        price = bound(price, 0.01 ether, 2 ether);
        royaltyBps = bound(royaltyBps, 0, 5000);
        address seller = _actor(seed);

        bytes32 K = keccak256(abi.encode("K", seed, assetIds.length));
        bytes32 N = keccak256(abi.encode("N", seed));
        bytes32 s = keccak256(abi.encode("s", seed));
        bytes32 cK = DisputeVerifier.keyCommitment(K, N, s);

        bytes memory C_i = abi.encodePacked(keccak256(abi.encode("C", seed, assetIds.length)));
        bytes32 R_C = DisputeVerifier.cipherLeaf(0, C_i);
        bytes32 kEnc = DisputeVerifier.hmacSha256(K, abi.encodePacked(bytes1(0x01)));
        bytes memory D_i = DisputeVerifier.decryptBlock(kEnc, 0, C_i);
        bytes32 leafD = honest ? DisputeVerifier.plainLeaf(0, D_i) : keccak256(abi.encode("corrupt", seed));

        uint256 parentId = 0;
        if (assetIds.length > 0 && (seed % 4 == 0)) {
            uint256 candidateParent = assetIds[(seed >> 3) % assetIds.length];
            if (reg.get(candidateParent).active) {
                parentId = candidateParent;
            }
        }

        vm.startPrank(seller);
        escrow.depositBond{value: price * 2}();
        uint256 aid = reg.list(
            keccak256(abi.encode("hD", seed)),
            keccak256(abi.encode("hC", seed)),
            leafD,
            R_C,
            cK,
            leafD,
            R_C,
            keccak256(abi.encode("prev", seed)),
            keccak256(abi.encode("fp", seed)),
            1,
            256,
            uint64(price),
            uint16(royaltyBps),
            parentId
        );
        vm.stopPrank();
        assetIds.push(aid);
        assetMeta[aid] = AssetMeta({ K: K, N: N, s: s, C_i: C_i, leafD: leafD, honest: honest });
        successCount[this.listAsset.selector]++;
    }

    // Buy an asset
    function buyAsset(uint256 seed) public snapshot {
        if (assetIds.length == 0) return;
        uint256 aid = assetIds[seed % assetIds.length];
        address buyer = _actor(seed + 1);
        AssetRegistry.Asset memory a = reg.get(aid);
        if (!a.active) return;
        if (buyer == a.seller) return;
        if (escrow.sellerCredit(a.seller) < a.price) return;
        uint256 cost = a.price + 0.001 ether;
        if (buyer.balance < cost) return;
        vm.prank(buyer);
        uint256 sid = escrow.buy{value: cost}(aid);
        saleIds.push(sid);
        successCount[this.buyAsset.selector]++;
    }

    // Deliver
    function deliver(uint256 seed) public snapshot {
        (bool found, uint256 sid) = _findSale(seed, SaleEscrow.State.ESCROWED, true);
        if (!found) return;
        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        vm.prank(sl.seller);
        escrow.deliver(sid, abi.encodePacked(keccak256("key")));
        successCount[this.deliver.selector]++;
    }

    // Confirm
    function confirm(uint256 seed) public snapshot {
        (bool found, uint256 sid) = _findSale(seed, SaleEscrow.State.DELIVERED, true);
        if (!found) return;
        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        vm.prank(sl.buyer);
        escrow.confirm(sid);
        successCount[this.confirm.selector]++;
    }

    // Mode-1 integrity dispute (both consistent and inconsistent depending on assetMeta[aid].honest)
    function disputeMode1(uint256 seed) public snapshot {
        (bool found, uint256 sid) = _findSale(seed, SaleEscrow.State.DELIVERED, true);
        if (!found) return;
        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        AssetMeta memory meta = assetMeta[sl.assetId];
        SaleEscrow.DisputeProof memory proof = SaleEscrow.DisputeProof({
            K: meta.K,
            N: meta.N,
            s: meta.s,
            index: 0,
            C_i: meta.C_i,
            leafD: meta.leafD,
            proofD: new bytes32[](0),
            proofC: new bytes32[](0)
        });
        vm.prank(sl.buyer);
        escrow.disputeMode1(sid, proof);
        successCount[this.disputeMode1.selector]++;
    }

    // Mode-2 challenge (max once per sale)
    function disputeMode2(uint256 seed) public snapshot {
        uint256 len = saleIds.length;
        if (len == 0) return;
        uint256 start = seed % len;
        bool found = false;
        uint256 sid = 0;
        for (uint256 k = 0; k < len; k++) {
            uint256 candidate = saleIds[(start + k) % len];
            SaleEscrow.Sale memory sl = escrow.getSale(candidate);
            if (sl.state == SaleEscrow.State.DELIVERED && block.timestamp <= sl.tConfirm && !sl.mode2Challenged) {
                found = true;
                sid = candidate;
                break;
            }
        }
        if (!found) return;
        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        vm.prank(sl.buyer);
        escrow.disputeMode2(sid);
        successCount[this.disputeMode2.selector]++;
    }

    // Respond to Mode-2 challenge (valid and invalid key)
    function respond(uint256 seed, bool validKey) public snapshot {
        (bool found, uint256 sid) = _findSale(seed, SaleEscrow.State.CHALLENGED, true);
        if (!found) return;
        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        AssetMeta memory meta = assetMeta[sl.assetId];
        bytes32 kArg = validKey ? meta.K : bytes32(uint256(meta.K) ^ 1);
        vm.prank(sl.seller);
        escrow.respond(sid, kArg, meta.N, meta.s);
        successCount[this.respond.selector]++;
    }

    // Timeout deliver
    function timeoutDeliver(uint256 seed) public snapshot {
        (bool found, uint256 sid) = _findSale(seed, SaleEscrow.State.ESCROWED, false);
        if (!found) return;
        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        if (block.timestamp <= sl.tDeliver) {
            vm.warp(sl.tDeliver + 1);
        }
        escrow.timeoutDeliver(sid);
        successCount[this.timeoutDeliver.selector]++;
    }

    // Timeout confirm
    function timeoutConfirm(uint256 seed) public snapshot {
        (bool found, uint256 sid) = _findSale(seed, SaleEscrow.State.DELIVERED, false);
        if (!found) return;
        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        if (block.timestamp <= sl.tConfirm) {
            vm.warp(sl.tConfirm + 1);
        }
        vm.prank(sl.seller);
        escrow.timeoutConfirm(sid);
        successCount[this.timeoutConfirm.selector]++;
    }

    // Timeout respond
    function timeoutRespond(uint256 seed) public snapshot {
        (bool found, uint256 sid) = _findSale(seed, SaleEscrow.State.CHALLENGED, false);
        if (!found) return;
        SaleEscrow.Sale memory sl = escrow.getSale(sid);
        if (block.timestamp <= sl.tRespond) {
            vm.warp(sl.tRespond + 1);
        }
        escrow.timeoutRespond(sid);
        successCount[this.timeoutRespond.selector]++;
    }
}

contract Invariants is StdInvariant, Test {
    AssetRegistry reg;
    RoyaltySplitter royalty;
    LicenceToken lic;
    SaleEscrow escrow;
    Handler handler;

    function setUp() public {
        reg = new AssetRegistry();
        royalty = new RoyaltySplitter();
        lic = new LicenceToken();
        escrow = new SaleEscrow(address(reg), address(royalty), address(lic));
        royalty.setEscrow(address(escrow));
        lic.setMinter(address(escrow));
        handler = new Handler(reg, escrow, royalty, lic);
        targetContract(address(handler));
    }

    /// @notice Invariant: escrow ETH equals locked stakes plus unspent seller credit.
    function invariant_fundsConservation() public view {
        uint256 locked = 0;
        for (uint i = 0; i < handler.saleIdsLength(); i++) {
            SaleEscrow.Sale memory sl = escrow.getSale(handler.saleIdAt(i));
            if (
                sl.state == SaleEscrow.State.ESCROWED || sl.state == SaleEscrow.State.DELIVERED
                    || sl.state == SaleEscrow.State.CHALLENGED
            ) {
                // price + buyer bond + seller bond are held by the escrow
                locked += uint256(sl.price) + sl.bondBuyer + sl.bondSeller;
            }
        }
        uint256 credits = 0;
        for (uint i = 0; i < handler.actorsLength(); i++) {
            credits += escrow.sellerCredit(handler.actorAt(i));
        }
        assertEq(address(escrow).balance, locked + credits, "escrow ETH is conserved");
    }

    /// @notice Invariant: every sale is in exactly one state.
    function invariant_singleState() public view {
        // Check that no sale has an invalid state value.
        for (uint i = 0; i < handler.saleIdsLength(); i++) {
            uint256 sid = handler.saleIdAt(i);
            SaleEscrow.Sale memory sl = escrow.getSale(sid);
            assertTrue(uint8(sl.state) <= 5); // valid enum range
        }
    }

    /// @notice Invariant: terminal states are absorbing (no sale goes back).
    function invariant_terminalAbsorbing() public view {
        assertEq(handler.terminalViolations(), 0, "a terminal sale changed state");
        for (uint i = 0; i < handler.saleIdsLength(); i++) {
            SaleEscrow.Sale memory sl = escrow.getSale(handler.saleIdAt(i));
            if (sl.state == SaleEscrow.State.SETTLED) {
                // licence should be minted
                assertTrue(lic.balanceOf(sl.buyer, sl.assetId) >= 1);
            }
        }
    }
}