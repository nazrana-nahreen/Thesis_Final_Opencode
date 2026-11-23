// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title AssetRegistry
/// @notice Immutable pre-sale commitments and listing state for AIGC assets.
/// @dev No funds are held here. Commitments are write-once. Parent is an assetId
///      (0 = none). The parent's royaltyBps is fixed at the parent's listing time
///      and cannot be changed by the child (fixes MetaTrade's contradiction).
contract AssetRegistry {
    struct Asset {
        address seller;
        bytes32 hD;
        bytes32 hC;
        bytes32 R_D;
        bytes32 R_C;
        bytes32 cK;
        bytes32 leafListD;
        bytes32 leafListC;
        bytes32 previewCid;
        bytes32 fingerprint;
        uint32 m;
        uint32 blockSize;
        uint64 price;
        uint16 royaltyBps;
        uint256 parentAssetId; // 0 = no parent
        bool active;
        uint64 listedAt;
    }

    uint256 public nextAssetId = 1;
    mapping(uint256 => Asset) private _assets;

    uint16 public constant MAX_ROYALTY_BPS = 5000; // 50%
    uint32 public constant MIN_BLOCK = 256;
    uint32 public constant MAX_BLOCK = 65536;

    event AssetListed(
        uint256 indexed assetId,
        address indexed seller,
        bytes32 hD,
        bytes32 hC,
        uint64 price,
        uint16 royaltyBps,
        uint256 parentAssetId
    );
    event AssetDeactivated(uint256 indexed assetId, address indexed by, bytes8 reason);

    error InvalidBlockSize(uint32 blockSize);
    error InvalidRoyalty(uint16 royaltyBps);
    error InvalidPrice();
    error InvalidBlockCount();
    error NotSeller();
    error AlreadyInactive();
    error SelfParent();
    error ParentNotFoundOrInactive(uint256 parentAssetId);

    function list(
        bytes32 hD,
        bytes32 hC,
        bytes32 R_D,
        bytes32 R_C,
        bytes32 cK,
        bytes32 leafListD,
        bytes32 leafListC,
        bytes32 previewCid,
        bytes32 fingerprint,
        uint32 m,
        uint32 blockSize,
        uint64 price,
        uint16 royaltyBps,
        uint256 parentAssetId
    ) external returns (uint256 assetId) {
        if (blockSize < MIN_BLOCK || blockSize > MAX_BLOCK) revert InvalidBlockSize(blockSize);
        if (royaltyBps > MAX_ROYALTY_BPS) revert InvalidRoyalty(royaltyBps);
        if (price == 0) revert InvalidPrice();
        if (m == 0) revert InvalidBlockCount();
        if (parentAssetId != 0) {
            Asset storage p = _assets[parentAssetId];
            if (p.seller == address(0) || !p.active) revert ParentNotFoundOrInactive(parentAssetId);
            if (p.seller == msg.sender) revert SelfParent();
        }

        assetId = nextAssetId++;
        _assets[assetId] = Asset({
            seller: msg.sender,
            hD: hD,
            hC: hC,
            R_D: R_D,
            R_C: R_C,
            cK: cK,
            leafListD: leafListD,
            leafListC: leafListC,
            previewCid: previewCid,
            fingerprint: fingerprint,
            m: m,
            blockSize: blockSize,
            price: price,
            royaltyBps: royaltyBps,
            parentAssetId: parentAssetId,
            active: true,
            listedAt: uint64(block.timestamp)
        });

        emit AssetListed(assetId, msg.sender, hD, hC, price, royaltyBps, parentAssetId);
    }

    function deactivate(uint256 assetId, bytes8 reason) external {
        Asset storage a = _assets[assetId];
        if (a.seller != msg.sender) revert NotSeller();
        if (!a.active) revert AlreadyInactive();
        a.active = false;
        emit AssetDeactivated(assetId, msg.sender, reason);
    }

    function get(uint256 assetId) external view returns (Asset memory) {
        return _assets[assetId];
    }

    function isActive(uint256 assetId) external view returns (bool) {
        return _assets[assetId].active;
    }

    function sellerOf(uint256 assetId) external view returns (address) {
        return _assets[assetId].seller;
    }

    function parentOf(uint256 assetId) external view returns (uint256) {
        return _assets[assetId].parentAssetId;
    }

    function royaltyOf(uint256 assetId) external view returns (uint16) {
        return _assets[assetId].royaltyBps;
    }
}

