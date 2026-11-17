// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20 with a one-shot hook: on the next transfer it calls `target` with `payload`
/// and records whether the re-entrant call succeeded and what it reverted with.
contract ReentrantERC20 is ERC20 {
    uint8 private immutable _dec;

    address public target;
    bytes public payload;
    bool public armed;
    bool public reentered;
    bool public reentrySucceeded;
    bytes public reentryRevertData;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
        armed = true;
        reentered = false;
        reentrySucceeded = false;
        delete reentryRevertData;
    }

    function revertSelector() external view returns (bytes4 sel) {
        bytes memory d = reentryRevertData;
        if (d.length < 4) return bytes4(0);
        assembly {
            sel := mload(add(d, 32))
        }
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed) {
            armed = false;
            reentered = true;
            (bool ok, bytes memory ret) = target.call(payload);
            reentrySucceeded = ok;
            reentryRevertData = ret;
        }
    }
}
