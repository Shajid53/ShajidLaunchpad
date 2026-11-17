// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LaunchpadBase} from "./LaunchpadBase.t.sol";
import {LaunchpadFactory} from "../LaunchpadFactory.sol";
import {TokenSalePool} from "../TokenSalePool.sol";

/// Contribution limits, timing boundaries, double-action reverts and cancellation.
contract TokenSalePoolLimitsTest is LaunchpadBase {
    function setUp() public override {
        super.setUp();
        _deploy(18);
    }

    // ---- contribution limits ----
    function test_RevertWhen_ZeroAmount() public {
        _toStart();
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.InvalidContribution.selector);
        pool.contribute(0);
    }

    function test_RevertWhen_BelowMin() public {
        _toStart();
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.InvalidContribution.selector);
        pool.contribute(10e6 - 1);
    }

    function test_ExactMinAccepted() public {
        _toStart();
        _contribute(alice, 10e6);
        assertEq(pool.contributions(alice), 10e6);
    }

    function test_RevertWhen_BelowMinAndNotExactRoom() public {
        _toStart();
        _contribute(alice, 500e6);
        _contribute(bob, 495e6); // room = 5e6
        vm.prank(carol);
        vm.expectRevert(TokenSalePool.InvalidContribution.selector);
        pool.contribute(4e6);
    }

    function test_RevertWhen_AboveMaxSingle() public {
        _toStart();
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.ContributionLimitExceeded.selector);
        pool.contribute(500e6 + 1);
    }

    function test_RevertWhen_PerWalletMaxExceededAcrossContributions() public {
        _toStart();
        _contribute(alice, 300e6);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.ContributionLimitExceeded.selector);
        pool.contribute(200e6 + 1);
        _contribute(alice, 200e6); // exactly up to the max is fine
        assertEq(pool.contributions(alice), 500e6);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.ContributionLimitExceeded.selector);
        pool.contribute(10e6);
    }

    function test_RevertWhen_ExceedsHardCap() public {
        _toStart();
        _contribute(alice, 500e6);
        _contribute(bob, 450e6); // room = 50e6
        vm.prank(carol);
        vm.expectRevert(TokenSalePool.ContributionLimitExceeded.selector);
        pool.contribute(51e6);
        assertEq(pool.totalRaised(), 950e6);
    }

    function test_ContributeAfterHardCapReverts() public {
        _toStart();
        _contribute(alice, 500e6);
        _contribute(bob, 500e6);
        vm.prank(carol);
        vm.expectRevert(TokenSalePool.SaleNotActive.selector);
        pool.contribute(10e6);
    }

    function test_ContributeEmitsEvent() public {
        _toStart();
        vm.expectEmit(true, false, false, true, address(pool));
        emit TokenSalePool.Contributed(alice, 123e6, 123e6);
        _contribute(alice, 123e6);
    }

    function test_RevertWhen_NoUsdcAllowanceOrBalance() public {
        _toStart();
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(); // ERC20InsufficientAllowance
        pool.contribute(10e6);
    }

    // ---- timing boundaries ----
    function test_RevertWhen_ContributeBeforeStart() public {
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.SaleNotActive.selector);
        pool.contribute(10e6);
        vm.warp(start - 1);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.SaleNotActive.selector);
        pool.contribute(10e6);
    }

    function test_ContributeAtExactlyStartTimeOk() public {
        vm.warp(start);
        _contribute(alice, 10e6);
        assertEq(pool.totalRaised(), 10e6);
    }

    function test_ContributeOneSecondBeforeEndOk() public {
        vm.warp(end - 1);
        _contribute(alice, 10e6);
        assertEq(pool.totalRaised(), 10e6);
    }

    function test_RevertWhen_ContributeAtEndTime() public {
        vm.warp(end);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.SaleNotActive.selector);
        pool.contribute(10e6);
    }

    function test_RevertWhen_ContributeAfterEnd() public {
        vm.warp(end + 1 days);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.SaleNotActive.selector);
        pool.contribute(10e6);
    }

    function test_ClaimTokensClosedUntilExactlyEndTime() public {
        _toStart();
        _contribute(alice, 300e6);
        vm.warp(end - 1);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.CannotClaim.selector);
        pool.claimTokens();
        vm.warp(end);
        vm.prank(alice);
        pool.claimTokens();
        assertEq(token.balanceOf(alice), 300e18);
    }

    function test_RevertWhen_ClaimWithoutContribution() public {
        _toStart();
        _contribute(alice, 300e6);
        _toEnd();
        vm.prank(bob);
        vm.expectRevert(TokenSalePool.CannotClaim.selector);
        pool.claimTokens();
    }

    // ---- double actions ----
    function test_DoubleClaimReverts() public {
        _toStart();
        _contribute(alice, 300e6);
        _toEnd();
        vm.prank(alice);
        pool.claimTokens();
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.CannotClaim.selector);
        pool.claimTokens();
        assertTrue(pool.claimed(alice));
    }

    function test_DoubleFinalizeAndWithdrawRevert() public {
        _toStart();
        _contribute(alice, 300e6);
        _toEnd();
        pool.finalizeSale();
        vm.expectRevert(TokenSalePool.CannotFinalize.selector);
        pool.finalizeSale();
        pool.withdrawProceeds();
        vm.expectRevert(TokenSalePool.CannotWithdraw.selector);
        pool.withdrawProceeds();
        pool.withdrawPlatformFee();
        vm.expectRevert(TokenSalePool.CannotWithdraw.selector);
        pool.withdrawPlatformFee();
        assertTrue(pool.proceedsWithdrawn());
        assertTrue(pool.feeWithdrawn());
    }

    // ---- 0-decimal sub-unit allocation ----
    function _deployZeroDecimals() internal {
        LaunchpadFactory.SaleParams memory s = _saleParams(0);
        s.tokensForSale = 1000;
        s.softCap = 1e6;
        s.minContribution = 1;
        _launch(_tokenParams(0), s);
        _toStart();
    }

    function test_RevertWhen_SubUnitContributionYieldsNoAllocation() public {
        _deployZeroDecimals();
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.NoTokenAllocation.selector);
        pool.contribute(999_999); // < 1 whole token at 1 USDC
        assertEq(pool.totalRaised(), 0);
    }

    function test_RevertWhen_FollowUpContributionAddsNoWholeToken() public {
        _deployZeroDecimals();
        _contribute(alice, 1_500_000); // 1 token
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.NoTokenAllocation.selector);
        pool.contribute(400_000); // 1.9 -> still 1
        _contribute(alice, 500_000); // 2.0 -> 2 tokens
        assertEq(pool.totalAllocated(), 2);
        assertEq(pool.contributions(alice), 2_000_000);
    }

    // ---- cancellation ----
    function test_CancelSale_CreatorBeforeStart() public {
        vm.expectEmit(false, false, false, false, address(pool));
        emit TokenSalePool.SaleCancelled();
        vm.prank(creator);
        pool.cancelSale();
        assertTrue(pool.cancelled());
        assertTrue(pool.finalized());
        assertFalse(pool.successful());
        assertEq(uint8(pool.status()), uint8(TokenSalePool.Status.Cancelled));
        assertEq(token.balanceOf(creator), 10_000e18);
        assertEq(token.balanceOf(address(pool)), 0);
    }

    function test_RevertWhen_NonCreatorCancels() public {
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.CannotCancel.selector);
        pool.cancelSale();
        vm.prank(owner);
        vm.expectRevert(TokenSalePool.CannotCancel.selector);
        pool.cancelSale();
    }

    function test_RevertWhen_CancelAtOrAfterStart() public {
        vm.warp(start - 1);
        vm.prank(creator);
        pool.cancelSale(); // still allowed 1s before start
        assertTrue(pool.cancelled());
    }

    function test_RevertWhen_CancelAtStartTime() public {
        vm.warp(start);
        vm.prank(creator);
        vm.expectRevert(TokenSalePool.CannotCancel.selector);
        pool.cancelSale();
    }

    function test_RevertWhen_CancelDuringSale() public {
        _toStart();
        _contribute(alice, 100e6);
        vm.prank(creator);
        vm.expectRevert(TokenSalePool.CannotCancel.selector);
        pool.cancelSale();
    }

    function test_RevertWhen_CancelTwice() public {
        vm.startPrank(creator);
        pool.cancelSale();
        vm.expectRevert(TokenSalePool.CannotCancel.selector);
        pool.cancelSale();
        vm.stopPrank();
    }

    function test_AfterCancel_NoContributeClaimRefundFinalizeOrWithdraw() public {
        vm.prank(creator);
        pool.cancelSale();
        _toStart();
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.SaleNotActive.selector);
        pool.contribute(10e6);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.CannotClaim.selector);
        pool.claimTokens();
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.CannotRefund.selector); // nothing was ever contributed
        pool.claimRefund();
        _toEnd();
        vm.expectRevert(TokenSalePool.CannotFinalize.selector);
        pool.finalizeSale();
        vm.expectRevert(TokenSalePool.CannotWithdraw.selector);
        pool.withdrawProceeds();
        vm.expectRevert(TokenSalePool.CannotWithdraw.selector);
        pool.withdrawPlatformFee();
        assertEq(pool.tokensOwed(alice), 0);
        assertEq(pool.refundable(alice), 0);
    }
}
