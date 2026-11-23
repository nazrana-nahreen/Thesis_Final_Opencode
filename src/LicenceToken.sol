// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/// @title LicenceToken
/// @notice ERC-1155 licence balances. One token id per asset; balance = licences held.
contract LicenceToken is ERC1155 {
    address public minter;

    constructor() ERC1155("") {}

    function setMinter(address minter_) external {
        require(minter == address(0), "minter set");
        minter = minter_;
    }

    function mint(address to, uint256 assetId) external {
        require(msg.sender == minter, "not minter");
        _mint(to, assetId, 1, "");
    }
}

