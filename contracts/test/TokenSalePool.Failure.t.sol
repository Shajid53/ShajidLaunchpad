// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LaunchpadBase} from "./LaunchpadBase.t.sol";
import {TokenSalePool} from "../TokenSalePool.sol";

/// Soft-cap failure path.
contract TokenSalePoolFailureTest is LaunchpadBase {
    function _failFlow(uint8 dec) internal {
        uint256 u = _unit(dec);
        _deploy(dec);
        _toStart();
        _contribute(alice, 100e6);
        _contribute(bob, 50e6);
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        // not refundable while sale is still running
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.CannotRefund.selector);
        pool.claimRefund();
        assertEq(pool.refundable(alice), 0);

        vm.warp(end - 1);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.CannotRefund.selector);
        pool.claimRefund();

        _toEnd();
        assertEq(uint8(pool.status()), uint8(TokenSalePool.Status.Failed));
        assertEq(pool.refundable(alice), 100e6);
        assertEq(pool.tokensOwed(alice), 0);

        // refund works WITHOUT finalizeSale
        assertFalse(pool.finalized());
        vm.expectEmit(true, false, false, true, address(pool));
        emit TokenSalePool.Refunded(alice, 100e6);
        vm.prank(alice);
        pool.claimRefund();
        assertEq(usdc.balanceOf(alice), aliceBefore + 100e6);
        assertEq(pool.refundable(alice), 0);

        // claims never open
        vm.prank(bob);
        vm.expectRevert(TokenSalePool.CannotClaim.selector);
        pool.claimTokens();

        // finalize returns ALL sale tokens to creator
        vm.expectEmit(false, false, false, true, address(pool));
        emit TokenSalePool.Finalized(false, 150e6, 0, 0, 1000 * u);
        vm.prank(dave);
        pool.finalizeSale();
        assertFalse(pool.successful());
        assertEq(token.balanceOf(creator), 10_000 * u);
        assertEq(token.balanceOf(address(pool)), 0);

        // treasury / creator USDC paths closed
        vm.expectRevert(TokenSalePool.CannotWithdraw.selector);
        pool.withdrawProceeds();
        vm.expectRevert(TokenSalePool.CannotWithdraw.selector);
        pool.withdrawPlatformFee();

        // refund still works after finalize; exact amount
        vm.prank(bob);
        pool.claimRefund();
        assertEq(usdc.balanceOf(bob), bobBefore + 50e6);
        assertEq(usdc.balanceOf(address(pool)), 0);

        // double refund / still no claim
        vm.prank(bob);
        vm.expectRevert(TokenSalePool.CannotRefund.selector);
        pool.claimRefund();
        vm.prank(bob);
        vm.expectRevert(TokenSalePool.CannotClaim.selector);
        pool.claimTokens();
    }

    function test_SoftCapFailure_18Decimals() public {
        _failFlow(18);
    }

    function test_SoftCapFailure_6Decimals() public {
        _failFlow(6);
    }

    function test_SoftCapFailure_0Decimals() public {
        _failFlow(0);
    }

    function test_OneBaseUnitBelowSoftCapFails() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 200e6 - 1);
        _toEnd();
        assertEq(uint8(pool.status()), uint8(TokenSalePool.Status.Failed));
        vm.prank(alice);
        pool.claimRefund();
        assertEq(usdc.balanceOf(alice), INVESTOR_FUNDS);
    }

    function test_NoContributions_FinalizeReturnsAllTokens() public {
        _deploy(18);
        _toEnd();
        pool.finalizeSale();
        assertFalse(pool.successful());
        assertEq(token.balanceOf(creator), 10_000e18);
        assertEq(token.balanceOf(address(pool)), 0);
    }

    function test_RefundWithoutContributionReverts() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 100e6);
        _toEnd();
        vm.prank(carol);
        vm.expectRevert(TokenSalePool.CannotRefund.selector);
        pool.claimRefund();
    }

    function test_RefundNotAvailableAfterSuccess() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 300e6);
        _toEnd();
        assertEq(pool.refundable(alice), 0);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.CannotRefund.selector);
        pool.claimRefund();
    }

    function test_DoubleFinalizeReverts() public {
        _deploy(18);
        _toEnd();
        pool.finalizeSale();
        vm.expectRevert(TokenSalePool.CannotFinalize.selector);
        pool.finalizeSale();
    }

    function test_ContributeAfterEndReverts_EvenBelowSoftCap() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 100e6);
        _toEnd();
        vm.prank(bob);
        vm.expectRevert(TokenSalePool.SaleNotActive.selector);
        pool.contribute(100e6);
    }
}
