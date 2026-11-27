// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RoyaltySplitter
/// @notice Pull-payment royalty accounting. Credits are pushed by the escrow;
///         recipients withdraw themselves.
contract RoyaltySplitter is ReentrancyGuard {
    mapping(address => uint256) public credits;

    event Credited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);

    address public escrow;

    constructor() {}

    /// @dev Holds ETH transferred by the escrow when a royalty is credited.
    receive() external payable {}

    function setEscrow(address escrow_) external {
        require(escrow == address(0), "escrow set");
        escrow = escrow_;
    }

    modifier onlyEscrow() {
        require(msg.sender == escrow, "not escrow");
        _;
    }

    function credit(address account, uint256 amount) external onlyEscrow {
        if (amount == 0) return;
        credits[account] += amount;
        emit Credited(account, amount);
    }

    function withdraw() external nonReentrant {
        uint256 amt = credits[msg.sender];
        require(amt > 0, "nothing to withdraw");
        credits[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amt}("");
        require(ok, "transfer failed");
        emit Withdrawn(msg.sender, amt);
    }

    function creditOf(address account) external view returns (uint256) {
        return credits[account];
    }
}

