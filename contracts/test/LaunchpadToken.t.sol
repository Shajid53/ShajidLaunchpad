// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LaunchpadToken} from "../LaunchpadToken.sol";

contract LaunchpadTokenTest is Test {
    address internal recipient = makeAddr("recipient");
    address internal other = makeAddr("other");

    function _make(uint8 dec, uint256 supply) internal returns (LaunchpadToken) {
        return new LaunchpadToken("Name", "SYM", dec, supply, recipient, "ipfs://m", "https://l");
    }

    function test_CustomDecimals_0() public {
        assertEq(_make(0, 1_000).decimals(), 0);
    }

    function test_CustomDecimals_6() public {
        assertEq(_make(6, 1_000e6).decimals(), 6);
    }

    function test_CustomDecimals_18() public {
        assertEq(_make(18, 1_000e18).decimals(), 18);
    }

    function testFuzz_DecimalsUpTo18(uint8 dec) public {
        dec = uint8(bound(dec, 0, 18));
        assertEq(_make(dec, 1e9).decimals(), dec);
    }

    function test_SupplyMintedEntirelyToRecipient() public {
        LaunchpadToken t = _make(18, 123_456e18);
        assertEq(t.totalSupply(), 123_456e18);
        assertEq(t.balanceOf(recipient), 123_456e18);
    }

    function test_MetadataGetters() public {
        LaunchpadToken t = _make(6, 1);
        assertEq(t.name(), "Name");
        assertEq(t.symbol(), "SYM");
        assertEq(t.metadataURI(), "ipfs://m");
        assertEq(t.logoURL(), "https://l");
    }

    function test_EmptyMetadataAllowed() public {
        LaunchpadToken t = new LaunchpadToken("N", "S", 18, 1, recipient, "", "");
        assertEq(bytes(t.metadataURI()).length, 0);
        assertEq(bytes(t.logoURL()).length, 0);
    }

    function test_RevertWhen_DecimalsAbove18() public {
        vm.expectRevert(LaunchpadToken.InvalidDecimals.selector);
        _make(19, 1);
    }

    function testFuzz_RevertWhen_DecimalsAbove18(uint8 dec) public {
        dec = uint8(bound(dec, 19, 255));
        vm.expectRevert(LaunchpadToken.InvalidDecimals.selector);
        _make(dec, 1);
    }

    function test_RevertWhen_ZeroSupply() public {
        vm.expectRevert(LaunchpadToken.InvalidSupply.selector);
        _make(18, 0);
    }

    function test_RevertWhen_ZeroRecipient() public {
        vm.expectRevert(LaunchpadToken.InvalidRecipient.selector);
        new LaunchpadToken("N", "S", 18, 1, address(0), "", "");
    }

    function test_TransferMovesBalance() public {
        LaunchpadToken t = _make(0, 100);
        vm.prank(recipient);
        t.transfer(other, 40);
        assertEq(t.balanceOf(other), 40);
        assertEq(t.balanceOf(recipient), 60);
        assertEq(t.totalSupply(), 100);
    }
}
