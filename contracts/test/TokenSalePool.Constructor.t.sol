// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LaunchpadBase} from "./LaunchpadBase.t.sol";
import {LaunchpadToken} from "../LaunchpadToken.sol";
import {TokenSalePool} from "../TokenSalePool.sol";
import {ReentrantERC20} from "./mocks/ReentrantERC20.sol";

/// Direct constructor validation of TokenSalePool.
contract TokenSalePoolConstructorTest is LaunchpadBase {
    LaunchpadToken internal tk;

    function setUp() public override {
        super.setUp();
        tk = new LaunchpadToken("T", "T", 18, 10_000e18, address(this), "", "");
    }

    function _cfg() internal view returns (TokenSalePool.Config memory c) {
        c = TokenSalePool.Config({
            usdc: address(usdc),
            token: address(tk),
            creator: creator,
            treasury: treasury,
            feeBps: 250,
            price: 1e6,
            tokensForSale: 1000e18,
            softCap: 200e6,
            hardCap: 1000e6,
            minContribution: 10e6,
            maxContribution: 500e6,
            startTime: uint64(block.timestamp + 1 hours),
            endTime: uint64(block.timestamp + 1 hours + 7 days)
        });
    }

    function test_ValidConfigStoresImmutables() public {
        TokenSalePool.Config memory c = _cfg();
        TokenSalePool p = new TokenSalePool(c);
        assertEq(address(p.usdc()), address(usdc));
        assertEq(address(p.token()), address(tk));
        assertEq(p.creator(), creator);
        assertEq(p.treasury(), treasury);
        assertEq(p.feeBps(), 250);
        assertEq(p.tokenDecimals(), 18);
        assertEq(p.price(), 1e6);
        assertEq(p.tokensForSale(), 1000e18);
        assertEq(p.softCap(), 200e6);
        assertEq(p.hardCap(), 1000e6);
        assertEq(p.minContribution(), 10e6);
        assertEq(p.maxContribution(), 500e6);
        assertEq(p.startTime(), c.startTime);
        assertEq(p.endTime(), c.endTime);
    }

    function test_RevertWhen_ZeroUsdc() public {
        TokenSalePool.Config memory c = _cfg();
        c.usdc = address(0);
        vm.expectRevert(TokenSalePool.ZeroAddress.selector);
        new TokenSalePool(c);
    }

    function test_RevertWhen_ZeroToken() public {
        TokenSalePool.Config memory c = _cfg();
        c.token = address(0);
        vm.expectRevert(TokenSalePool.ZeroAddress.selector);
        new TokenSalePool(c);
    }

    function test_RevertWhen_ZeroCreator() public {
        TokenSalePool.Config memory c = _cfg();
        c.creator = address(0);
        vm.expectRevert(TokenSalePool.ZeroAddress.selector);
        new TokenSalePool(c);
    }

    function test_RevertWhen_ZeroTreasury() public {
        TokenSalePool.Config memory c = _cfg();
        c.treasury = address(0);
        vm.expectRevert(TokenSalePool.ZeroAddress.selector);
        new TokenSalePool(c);
    }

    function test_FeeBoundary() public {
        TokenSalePool.Config memory c = _cfg();
        c.feeBps = 1000;
        new TokenSalePool(c); // ok
        c.feeBps = 1001;
        vm.expectRevert(TokenSalePool.InvalidFee.selector);
        new TokenSalePool(c);
    }

    function test_RevertWhen_ZeroPrice() public {
        TokenSalePool.Config memory c = _cfg();
        c.price = 0;
        vm.expectRevert(TokenSalePool.InvalidPriceOrSupply.selector);
        new TokenSalePool(c);
    }

    function test_RevertWhen_ZeroTokensForSale() public {
        TokenSalePool.Config memory c = _cfg();
        c.tokensForSale = 0;
        vm.expectRevert(TokenSalePool.InvalidPriceOrSupply.selector);
        new TokenSalePool(c);
    }

    function test_RevertWhen_ZeroSoftCap() public {
        TokenSalePool.Config memory c = _cfg();
        c.softCap = 0;
        vm.expectRevert(TokenSalePool.InvalidCaps.selector);
        new TokenSalePool(c);
    }

    function test_SoftCapEqualHardCapAllowed_AboveReverts() public {
        TokenSalePool.Config memory c = _cfg();
        c.softCap = c.hardCap;
        new TokenSalePool(c);
        c.softCap = c.hardCap + 1;
        vm.expectRevert(TokenSalePool.InvalidCaps.selector);
        new TokenSalePool(c);
    }

    function test_RevertWhen_ZeroMin() public {
        TokenSalePool.Config memory c = _cfg();
        c.minContribution = 0;
        vm.expectRevert(TokenSalePool.InvalidContributionLimits.selector);
        new TokenSalePool(c);
    }

    function test_RevertWhen_MinAboveMax() public {
        TokenSalePool.Config memory c = _cfg();
        c.minContribution = 501e6;
        vm.expectRevert(TokenSalePool.InvalidContributionLimits.selector);
        new TokenSalePool(c);
    }

    function test_RevertWhen_MaxAboveHardCap() public {
        TokenSalePool.Config memory c = _cfg();
        c.maxContribution = c.hardCap + 1;
        vm.expectRevert(TokenSalePool.InvalidContributionLimits.selector);
        new TokenSalePool(c);
    }

    function test_StartBoundary() public {
        TokenSalePool.Config memory c = _cfg();
        c.startTime = uint64(block.timestamp);
        c.endTime = c.startTime + 1 days;
        new TokenSalePool(c); // start == now allowed
        c.startTime = uint64(block.timestamp - 1);
        c.endTime = c.startTime + 1 days;
        vm.expectRevert(TokenSalePool.InvalidTimes.selector);
        new TokenSalePool(c);
    }

    function test_RevertWhen_EndNotAfterStart() public {
        TokenSalePool.Config memory c = _cfg();
        c.endTime = c.startTime;
        vm.expectRevert(TokenSalePool.InvalidTimes.selector);
        new TokenSalePool(c);
        c.endTime = c.startTime - 1;
        vm.expectRevert(TokenSalePool.InvalidTimes.selector);
        new TokenSalePool(c);
    }

    function test_DurationBoundaries() public {
        TokenSalePool.Config memory c = _cfg();
        c.endTime = c.startTime + 10 minutes;
        new TokenSalePool(c); // min ok
        c.endTime = c.startTime + 10 minutes - 1;
        vm.expectRevert(TokenSalePool.InvalidTimes.selector);
        new TokenSalePool(c);
        c.endTime = c.startTime + 90 days;
        new TokenSalePool(c); // max ok
        c.endTime = c.startTime + 90 days + 1;
        vm.expectRevert(TokenSalePool.InvalidTimes.selector);
        new TokenSalePool(c);
    }

    function test_RevertWhen_TokenDecimalsAbove18() public {
        ReentrantERC20 bad = new ReentrantERC20("B", "B", 19);
        TokenSalePool.Config memory c = _cfg();
        c.token = address(bad);
        vm.expectRevert(TokenSalePool.InvalidDecimals.selector);
        new TokenSalePool(c);
    }

    function test_HardCapCoverage_100TokensAt2UsdcSupports200UsdcHardCap() public {
        TokenSalePool.Config memory c = _cfg();
        c.price = 2e6;
        c.tokensForSale = 100e18;
        c.hardCap = 200e6;
        c.softCap = 100e6;
        c.maxContribution = 200e6;
        new TokenSalePool(c); // 200e6 * 1e18 / 2e6 == 100e18 exactly
    }

    function test_RevertWhen_HardCapExceedsTokenCoverage() public {
        TokenSalePool.Config memory c = _cfg();
        c.price = 2e6;
        c.tokensForSale = 100e18;
        c.hardCap = 200e6 + 1;
        c.softCap = 100e6;
        c.maxContribution = 200e6;
        vm.expectRevert(TokenSalePool.InsufficientTokenCoverage.selector);
        new TokenSalePool(c);
    }

    function test_HardCapCoverage_ZeroDecimalsAndSixDecimals() public {
        LaunchpadToken t0 = new LaunchpadToken("Z", "Z", 0, 1000, address(this), "", "");
        TokenSalePool.Config memory c = _cfg();
        c.token = address(t0);
        c.tokensForSale = 1000; // 1000e6 / 1e6 = 1000 whole tokens
        new TokenSalePool(c);
        c.tokensForSale = 999;
        vm.expectRevert(TokenSalePool.InsufficientTokenCoverage.selector);
        new TokenSalePool(c);

        LaunchpadToken t6 = new LaunchpadToken("S", "S", 6, 1000e6, address(this), "", "");
        c = _cfg();
        c.token = address(t6);
        c.tokensForSale = 1000e6;
        new TokenSalePool(c);
        c.tokensForSale = 1000e6 - 1;
        vm.expectRevert(TokenSalePool.InsufficientTokenCoverage.selector);
        new TokenSalePool(c);
    }
}
