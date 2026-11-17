// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title LaunchpadToken
/// @notice Fixed-supply ERC-20 with construction-only metadata and custom decimals.
contract LaunchpadToken is ERC20 {
    error InvalidDecimals();
    error InvalidSupply();
    error InvalidRecipient();

    uint8 private immutable _customDecimals;

    /// @notice Metadata URI set at construction; there is no update function.
    string public metadataURI;
    /// @notice Logo URL set at construction; there is no update function.
    string public logoURL;

    /// @notice Mint the entire base-unit supply to a nonzero recipient.
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 initialSupply,
        address recipient,
        string memory metadataURI_,
        string memory logoURL_
    ) ERC20(name, symbol) {
        if (decimals_ > 18) revert InvalidDecimals();
        if (initialSupply == 0) revert InvalidSupply();
        if (recipient == address(0)) revert InvalidRecipient();
        _customDecimals = decimals_;
        metadataURI = metadataURI_;
        logoURL = logoURL_;
        _mint(recipient, initialSupply);
    }

    /// @notice Return the construction-time token precision (0 through 18).
    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }
}
