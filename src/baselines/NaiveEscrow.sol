// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title NaiveEscrow (B1)
/// @notice Deliberately minimal baseline: buyer pays, seller delivers, buyer
///         confirms. There is no content verification, no bond, no timeout, and
///         no dispute procedure. It is the cost floor, not a secure design.
/// @dev Used only for the thesis comparison. Overpayment is accepted and left
///      in the contract, which is intentional: it makes AT-08 observable.
contract NaiveEscrow {
    enum State {
        NONE,
        ESCROWED,
        DELIVERED,
        SETTLED,
        REFUNDED
    }

    struct Listing {
        address seller;
        uint64 price;
        bool active;
    }

    struct Sale {
        address buyer;
        address seller;
        uint256 assetId;
        uint64 price;
        State state;
        bytes32 deliveryHash;
    }

    uint256 public nextAssetId = 1;
    uint256 public nextSaleId = 1;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Sale) public sales;

    event Listed(uint256 indexed assetId, address indexed seller, uint64 price);
    event PriceUpdated(uint256 indexed assetId, uint64 price);
    event Bought(uint256 indexed saleId, uint256 indexed assetId, address indexed buyer, uint64 paid, uint64 price);
    event Delivered(uint256 indexed saleId, bytes32 deliveryHash);
    event Settled(uint256 indexed saleId, uint64 amount);
    event Refunded(uint256 indexed saleId, uint64 amount);

    error NotSeller();
    error NotBuyer();
    error Inactive();
    error BadState();
    error BadPayment();

    function list(uint64 price) external returns (uint256 assetId) {
        require(price > 0, "price=0");
        assetId = nextAssetId++;
        listings[assetId] = Listing({ seller: msg.sender, price: price, active: true });
        emit Listed(assetId, msg.sender, price);
    }

    function updatePrice(uint256 assetId, uint64 newPrice) external {
        Listing storage l = listings[assetId];
        if (msg.sender != l.seller) revert NotSeller();
        require(newPrice > 0, "price=0");
        l.price = newPrice;
        emit PriceUpdated(assetId, newPrice);
    }

    function buy(uint256 assetId) external payable returns (uint256 saleId) {
        Listing storage l = listings[assetId];
        if (!l.active) revert Inactive();
        if (msg.sender == l.seller) revert NotSeller();
        // Deliberately accepts overpayment; the excess is stranded (AT-08).
        if (msg.value < l.price) revert BadPayment();

        saleId = nextSaleId++;
        sales[saleId] = Sale({
            buyer: msg.sender,
            seller: l.seller,
            assetId: assetId,
            price: l.price,
            state: State.ESCROWED,
            deliveryHash: bytes32(0)
        });
        emit Bought(saleId, assetId, msg.sender, uint64(msg.value), l.price);
    }

    function deliver(uint256 saleId, bytes32 deliveryHash) external {
        Sale storage s = sales[saleId];
        if (msg.sender != s.seller) revert NotSeller();
        if (s.state != State.ESCROWED) revert BadState();
        s.deliveryHash = deliveryHash;
        s.state = State.DELIVERED;
        emit Delivered(saleId, deliveryHash);
    }

    function confirm(uint256 saleId) external {
        Sale storage s = sales[saleId];
        if (msg.sender != s.buyer) revert NotBuyer();
        if (s.state != State.DELIVERED) revert BadState();
        s.state = State.SETTLED;
        _pay(s.seller, s.price);
        emit Settled(saleId, s.price);
    }

    /// @notice Refund is voluntary: only the seller can trigger it.
    function refund(uint256 saleId) external {
        Sale storage s = sales[saleId];
        if (msg.sender != s.seller) revert NotSeller();
        if (s.state != State.ESCROWED && s.state != State.DELIVERED) revert BadState();
        s.state = State.REFUNDED;
        _pay(s.buyer, s.price);
        emit Refunded(saleId, s.price);
    }

    function _pay(address to, uint256 amount) internal {
        (bool ok, ) = to.call{ value: amount }("");
        require(ok, "transfer failed");
    }
}
