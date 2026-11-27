// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "../DisputeVerifier.sol";

/// @title FairSwapLite (B2)
/// @notice FairSwap-style baseline: the seller commits to plaintext and
///         ciphertext Merkle roots, the buyer pays, the seller reveals the key
///         publicly on-chain, and the buyer either confirms or proves one
///         inconsistent block. There is no per-buyer key wrapping, no bond, and
///         no royalty/licence layer.
/// @dev This is a deliberately small reimplementation for cost and security
///      comparison, not a full FairSwap implementation.
contract FairSwapLite {
    using DisputeVerifier for *;

    enum State {
        NONE,
        ESCROWED,
        REVEALED,
        SETTLED,
        REFUNDED
    }

    struct Listing {
        address seller;
        bytes32 hD;
        bytes32 R_D;
        bytes32 R_C;
        uint32 m;
        uint32 beta;
        uint64 price;
        bool active;
        uint64 listedAt;
    }

    struct Sale {
        address buyer;
        address seller;
        uint256 assetId;
        uint64 price;
        uint64 tReveal;
        uint64 tConfirm;
        State state;
        bytes32 K;
    }

    uint256 public nextAssetId = 1;
    uint256 public nextSaleId = 1;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Sale) public sales;

    uint64 public constant REVEAL_WINDOW = 1 days;
    uint64 public constant CONFIRM_WINDOW = 1 days;

    event Listed(uint256 indexed assetId, address indexed seller, bytes32 hD, uint64 price);
    event Bought(uint256 indexed saleId, uint256 indexed assetId, address indexed buyer, uint64 price);
    event KeyRevealed(uint256 indexed saleId, bytes32 K);
    event Settled(uint256 indexed saleId, uint64 amount);
    event Refunded(uint256 indexed saleId, uint64 amount);
    event TimedOut(uint256 indexed saleId, uint8 phase);

    error NotSeller();
    error NotBuyer();
    error Inactive();
    error BadState();
    error BadPayment();
    error Late();
    error Early();
    error Consistent();

    function stateOf(uint256 saleId) external view returns (State) {
        return sales[saleId].state;
    }

    function keyOf(uint256 saleId) external view returns (bytes32) {
        return sales[saleId].K;
    }

    function list(bytes32 hD, bytes32 R_D, bytes32 R_C, uint32 m, uint32 beta, uint64 price)
        external
        returns (uint256 assetId)
    {
        require(price > 0, "price=0");
        require(m > 0, "m=0");
        require(beta >= 256 && beta <= 65536, "bad beta");
        assetId = nextAssetId++;
        listings[assetId] = Listing({
            seller: msg.sender,
            hD: hD,
            R_D: R_D,
            R_C: R_C,
            m: m,
            beta: beta,
            price: price,
            active: true,
            listedAt: uint64(block.timestamp)
        });
        emit Listed(assetId, msg.sender, hD, price);
    }

    function buy(uint256 assetId) external payable returns (uint256 saleId) {
        Listing storage l = listings[assetId];
        if (!l.active) revert Inactive();
        if (msg.sender == l.seller) revert NotSeller();
        if (msg.value != l.price) revert BadPayment();

        saleId = nextSaleId++;
        sales[saleId] = Sale({
            buyer: msg.sender,
            seller: l.seller,
            assetId: assetId,
            price: l.price,
            tReveal: uint64(block.timestamp) + REVEAL_WINDOW,
            tConfirm: 0,
            state: State.ESCROWED,
            K: bytes32(0)
        });
        emit Bought(saleId, assetId, msg.sender, l.price);
    }

    /// @notice Public key reveal: after this call the key is readable by anyone.
    function revealKey(uint256 saleId, bytes32 K) external {
        Sale storage s = sales[saleId];
        if (msg.sender != s.seller) revert NotSeller();
        if (s.state != State.ESCROWED) revert BadState();
        if (block.timestamp > s.tReveal) revert Late();

        s.K = K;
        s.tConfirm = uint64(block.timestamp) + CONFIRM_WINDOW;
        s.state = State.REVEALED;
        emit KeyRevealed(saleId, K);
    }

    function confirm(uint256 saleId) external {
        Sale storage s = sales[saleId];
        if (msg.sender != s.buyer) revert NotBuyer();
        if (s.state != State.REVEALED) revert BadState();
        if (block.timestamp > s.tConfirm) revert Late();
        s.state = State.SETTLED;
        _pay(s.seller, s.price);
        emit Settled(saleId, s.price);
    }

    /// @notice Prove that one committed ciphertext block decrypts to a plaintext
    ///         block that is not the committed one. A successful proof refunds
    ///         the buyer; a consistent block reverts the claim.
    function dispute(
        uint256 saleId,
        uint256 index,
        bytes calldata C_i,
        bytes32 leafD,
        bytes32[] calldata proofD,
        bytes32[] calldata proofC
    ) external {
        Sale storage s = sales[saleId];
        if (msg.sender != s.buyer) revert NotBuyer();
        if (s.state != State.REVEALED) revert BadState();

        Listing memory l = listings[s.assetId];
        bytes32 kEnc = DisputeVerifier.hmacSha256(s.K, abi.encodePacked(bytes1(0x01)));
        bytes memory D_i = DisputeVerifier.decryptBlock(kEnc, index, C_i);
        bytes32 recomputed = DisputeVerifier.plainLeaf(index, D_i);

        // Both the supplied ciphertext block and the supplied plaintext leaf
        // must be committed, otherwise the proof is fabricated.
        require(
            DisputeVerifier.verifyMerkle(l.R_C, DisputeVerifier.cipherLeaf(index, C_i), index, proofC),
            "bad cipher proof"
        );
        require(DisputeVerifier.verifyMerkle(l.R_D, leafD, index, proofD), "bad plain proof");

        if (recomputed == leafD) revert Consistent();

        s.state = State.REFUNDED;
        _pay(s.buyer, s.price);
        emit Refunded(saleId, s.price);
    }

    function timeoutReveal(uint256 saleId) external {
        Sale storage s = sales[saleId];
        if (s.state != State.ESCROWED) revert BadState();
        if (block.timestamp <= s.tReveal) revert Early();
        s.state = State.REFUNDED;
        _pay(s.buyer, s.price);
        emit TimedOut(saleId, 0);
    }

    function timeoutConfirm(uint256 saleId) external {
        Sale storage s = sales[saleId];
        if (msg.sender != s.seller) revert NotSeller();
        if (s.state != State.REVEALED) revert BadState();
        if (block.timestamp <= s.tConfirm) revert Early();
        s.state = State.SETTLED;
        _pay(s.seller, s.price);
        emit TimedOut(saleId, 1);
    }

    function _pay(address to, uint256 amount) internal {
        (bool ok, ) = to.call{ value: amount }("");
        require(ok, "transfer failed");
    }
}
