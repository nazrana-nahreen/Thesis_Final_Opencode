// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./DisputeVerifier.sol";
import "./AssetRegistry.sol";

interface IRoyaltySplitter {
    function credit(address account, uint256 amount) external;
}

interface ILicenceToken {
    function mint(address to, uint256 assetId) external;
}

/// @title SaleEscrow
/// @notice Per-sale state machine for CRC settlement: bonds, timeouts, two-mode dispute.
contract SaleEscrow is ReentrancyGuard {
    using DisputeVerifier for *;

    enum State { NONE, ESCROWED, DELIVERED, CHALLENGED, SETTLED, REFUNDED }

    struct Sale {
        address buyer;
        address seller;
        uint256 assetId;
        uint64 price;
        uint64 bondBuyer;
        uint64 bondSeller;
        uint64 tDeliver;
        uint64 tConfirm;
        uint64 tRespond;
        State state;
        bytes encK;
        bytes32 revealedK;
        bytes32 revealedN;
        bytes32 revealedS;
        bool keyRevealed;
        bool mode2Challenged;
    }

    struct DisputeProof {
        bytes32 K;
        bytes32 N;
        bytes32 s;
        uint256 index;
        bytes C_i;
        bytes32 leafD;
        bytes32[] proofD;
        bytes32[] proofC;
    }

    AssetRegistry public immutable registry;
    IRoyaltySplitter public immutable royalty;
    ILicenceToken public licenceToken;

    uint256 public nextSaleId;
    mapping(uint256 => Sale) private _sales;
    mapping(address => uint256) public sellerCredit;

    uint64 public constant DELIVER_WINDOW = 1 days;
    uint64 public constant CONFIRM_WINDOW = 2 days;
    uint64 public constant RESPOND_WINDOW = 1 days;
    uint64 public constant CONFIRM_EXTENSION = 1 days;
    uint64 public constant BUYER_BOND = 0.001 ether;

    event SaleCreated(uint256 indexed saleId, uint256 indexed assetId, address indexed buyer, uint64 price, uint64 bondSeller);
    event Delivered(uint256 indexed saleId);
    event Settled(uint256 indexed saleId, uint64 sellerAmount, uint64 parentAmount);
    event Refunded(uint256 indexed saleId, uint64 buyerAmount, string reason);
    event Disputed(uint256 indexed saleId, uint8 mode);
    event Responded(uint256 indexed saleId);
    event TimedOut(uint256 indexed saleId, uint8 phase);

    error NotSeller();
    error NotBuyer();
    error BadState(State expected, State actual);
    error Late();
    error Early();
    error InactiveAsset();
    error SelfPurchase();
    error InsufficientSellerCredit();
    error InvalidKey();
    error BadPayment();
    error AlreadyChallenged();

    constructor(address registry_, address royalty_, address licenceToken_) {
        registry = AssetRegistry(registry_);
        royalty = IRoyaltySplitter(royalty_);
        licenceToken = ILicenceToken(licenceToken_);
    }

    function depositBond() external payable {
        sellerCredit[msg.sender] += msg.value;
    }

    function withdrawBondCredit() external nonReentrant {
        uint256 amt = sellerCredit[msg.sender];
        require(amt > 0, "no credit");
        sellerCredit[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amt}("");
        require(ok, "transfer failed");
    }

    function buy(uint256 assetId) external payable nonReentrant returns (uint256 saleId) {
        AssetRegistry.Asset memory a = registry.get(assetId);
        if (!a.active) revert InactiveAsset();
        if (msg.sender == a.seller) revert SelfPurchase();
        if (msg.value != a.price + BUYER_BOND) revert BadPayment();
        if (sellerCredit[a.seller] < a.price) revert InsufficientSellerCredit();

        saleId = nextSaleId++;
        Sale storage sl = _sales[saleId];
        sl.buyer = msg.sender;
        sl.seller = a.seller;
        sl.assetId = assetId;
        sl.price = a.price;
        sl.bondBuyer = BUYER_BOND;
        sl.bondSeller = uint64(a.price);
        sl.tDeliver = uint64(block.timestamp) + DELIVER_WINDOW;
        sl.tConfirm = uint64(block.timestamp) + DELIVER_WINDOW + CONFIRM_WINDOW;
        sl.tRespond = 0;
        sl.state = State.ESCROWED;

        sellerCredit[a.seller] -= sl.bondSeller;

        emit SaleCreated(saleId, assetId, msg.sender, a.price, sl.bondSeller);
    }

    function deliver(uint256 saleId, bytes calldata encK) external nonReentrant {
        Sale storage sl = _sales[saleId];
        if (msg.sender != sl.seller) revert NotSeller();
        if (sl.state != State.ESCROWED) revert BadState(State.ESCROWED, sl.state);
        if (block.timestamp > sl.tDeliver) revert Late();
        if (encK.length < 32 || encK.length > 1024) revert("bad encK size");

        sl.encK = encK;
        sl.state = State.DELIVERED;
        emit Delivered(saleId);
    }

    function confirm(uint256 saleId) external nonReentrant {
        Sale storage sl = _sales[saleId];
        if (msg.sender != sl.buyer) revert NotBuyer();
        if (sl.state != State.DELIVERED) revert BadState(State.DELIVERED, sl.state);
        if (block.timestamp > sl.tConfirm) revert Late();

        _settle(saleId, sl);
    }

    function disputeMode1(uint256 saleId, DisputeProof calldata proof) external nonReentrant {
        Sale storage sl = _sales[saleId];
        if (msg.sender != sl.buyer) revert NotBuyer();
        if (sl.state != State.DELIVERED) {
            revert BadState(State.DELIVERED, sl.state);
        }
        if (block.timestamp > sl.tConfirm) revert Late();

        if (sl.keyRevealed) {
            if (proof.K != sl.revealedK || proof.N != sl.revealedN || proof.s != sl.revealedS) {
                revert InvalidKey();
            }
        }

        AssetRegistry.Asset memory a = registry.get(sl.assetId);

        bool consistent = DisputeVerifier.checkConsistency(
            a.R_D, a.R_C, a.cK,
            proof.K, proof.N, proof.s,
            proof.index, proof.C_i,
            proof.leafD, proof.proofD, proof.proofC
        );

        if (consistent) {
            // buyer's claim is false -> seller wins
            // Pay seller + royalty, mint licence, but do NOT return the buyer's
            // bond (it is forfeited as an anti-spam penalty).
            AssetRegistry.Asset memory a2 = registry.get(sl.assetId);
            uint256 parentAmount2 = 0;
            uint256 sellerAmount2 = sl.price;
            if (a2.parentAssetId != 0) {
                parentAmount2 = (uint256(sl.price) * a2.royaltyBps) / 10000;
                sellerAmount2 = sl.price - parentAmount2;
            }
            address seller2 = sl.seller;
            address buyer2 = sl.buyer;
            uint256 assetId2 = sl.assetId;
            uint64 bondSeller2 = sl.bondSeller;
            uint64 bondBuyer2 = sl.bondBuyer;
            address parentSeller2 = a2.parentAssetId != 0 ? registry.sellerOf(a2.parentAssetId) : address(0);

            // --- EFFECTS ---
            sl.state = State.SETTLED;
            sellerCredit[seller2] += bondSeller2 + bondBuyer2;
            emit Settled(saleId, uint64(sellerAmount2), uint64(parentAmount2));

            // --- INTERACTIONS ---
            _pay(seller2, sellerAmount2);
            if (parentAmount2 > 0) {
                _pay(address(royalty), parentAmount2);
                royalty.credit(parentSeller2, parentAmount2);
            }
            licenceToken.mint(buyer2, assetId2);
        } else {
            // seller cheated -> buyer wins
            address buyer = sl.buyer;
            uint64 bondSeller = sl.bondSeller;
            _refund(saleId, sl, "inconsistent");
            // slash seller bond to buyer
            _pay(buyer, bondSeller);
        }
    }

    function disputeMode2(uint256 saleId) external nonReentrant {
        Sale storage sl = _sales[saleId];
        if (msg.sender != sl.buyer) revert NotBuyer();
        if (sl.state != State.DELIVERED) revert BadState(State.DELIVERED, sl.state);
        if (block.timestamp > sl.tConfirm) revert Late();
        if (sl.mode2Challenged) revert AlreadyChallenged();

        sl.mode2Challenged = true;
        sl.state = State.CHALLENGED;
        sl.tRespond = uint64(block.timestamp) + RESPOND_WINDOW;
        emit Disputed(saleId, 2);
    }

    function respond(uint256 saleId, bytes32 K, bytes32 N, bytes32 s) external nonReentrant {
        Sale storage sl = _sales[saleId];
        if (msg.sender != sl.seller) revert NotSeller();
        if (sl.state != State.CHALLENGED) revert BadState(State.CHALLENGED, sl.state);
        if (block.timestamp > sl.tRespond) revert Late();

        AssetRegistry.Asset memory a = registry.get(sl.assetId);
        if (DisputeVerifier.keyCommitment(K, N, s) != a.cK) revert InvalidKey();

        sl.revealedK = K;
        sl.revealedN = N;
        sl.revealedS = s;
        sl.keyRevealed = true;
        sl.state = State.DELIVERED;

        uint64 extended = uint64(block.timestamp) + CONFIRM_EXTENSION;
        if (extended > sl.tConfirm) {
            sl.tConfirm = extended;
        }

        emit Responded(saleId);
    }

    function timeoutDeliver(uint256 saleId) external nonReentrant {
        Sale storage sl = _sales[saleId];
        if (sl.state != State.ESCROWED) revert BadState(State.ESCROWED, sl.state);
        if (block.timestamp <= sl.tDeliver) revert Early();

        address buyer = sl.buyer;
        uint64 bondSeller = sl.bondSeller;
        _refund(saleId, sl, "no delivery");
        _pay(buyer, bondSeller);
        emit TimedOut(saleId, 0);
    }

    function timeoutConfirm(uint256 saleId) external nonReentrant {
        Sale storage sl = _sales[saleId];
        if (msg.sender != sl.seller) revert NotSeller();
        if (sl.state != State.DELIVERED) revert BadState(State.DELIVERED, sl.state);
        if (block.timestamp <= sl.tConfirm) revert Early();

        _settle(saleId, sl);
        emit TimedOut(saleId, 1);
    }

    function timeoutRespond(uint256 saleId) external nonReentrant {
        Sale storage sl = _sales[saleId];
        if (sl.state != State.CHALLENGED) revert BadState(State.CHALLENGED, sl.state);
        if (block.timestamp <= sl.tRespond) revert Early();

        address buyer = sl.buyer;
        uint64 bondSeller = sl.bondSeller;
        _refund(saleId, sl, "no respond");
        _pay(buyer, bondSeller);
        emit TimedOut(saleId, 2);
    }

    // ---------- internal ----------

    function _settle(uint256 saleId, Sale storage sl) internal {
        AssetRegistry.Asset memory a = registry.get(sl.assetId);

        uint256 parentAmount = 0;
        uint256 sellerAmount = sl.price;
        if (a.parentAssetId != 0) {
            parentAmount = (uint256(sl.price) * a.royaltyBps) / 10000;
            sellerAmount = sl.price - parentAmount;
        }

        address seller = sl.seller;
        address buyer = sl.buyer;
        uint256 assetId = sl.assetId;
        uint64 bondBuyer = sl.bondBuyer;
        uint64 bondSeller = sl.bondSeller;
        address parentSeller = a.parentAssetId != 0 ? registry.sellerOf(a.parentAssetId) : address(0);

        // --- EFFECTS ---
        sl.state = State.SETTLED;
        sellerCredit[seller] += bondSeller;
        emit Settled(saleId, uint64(sellerAmount), uint64(parentAmount));

        // --- INTERACTIONS ---
        _pay(seller, sellerAmount);
        if (parentAmount > 0) {
            _pay(address(royalty), parentAmount);
            royalty.credit(parentSeller, parentAmount);
        }
        _pay(buyer, bondBuyer);
        licenceToken.mint(buyer, assetId);
    }

    function _refund(uint256 saleId, Sale storage sl, string memory reason) internal {
        uint256 refundAmount = sl.price + sl.bondBuyer;
        address buyer = sl.buyer;
        // --- EFFECTS ---
        sl.state = State.REFUNDED;
        emit Refunded(saleId, uint64(refundAmount), reason);
        // --- INTERACTIONS ---
        _pay(buyer, refundAmount);
    }

    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
    }

    function getSale(uint256 saleId) external view returns (Sale memory) {
        return _sales[saleId];
    }
}

