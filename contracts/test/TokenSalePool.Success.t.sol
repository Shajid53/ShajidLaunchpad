// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LaunchpadBase} from "./LaunchpadBase.t.sol";
import {LaunchpadFactory} from "../LaunchpadFactory.sol";
import {TokenSalePool} from "../TokenSalePool.sol";

/// Successful-sale lifecycle.
contract TokenSalePoolSuccessTest is LaunchpadBase {
    // ---- full flow, parameterized by token decimals ----
    function _fullFlow(uint8 dec) internal {
        uint256 u = _unit(dec);
        _deploy(dec);
        _toStart();

        _contribute(alice, 300e6);
        _contribute(bob, 200e6);
        _contribute(carol, 100e6);
        assertEq(pool.totalRaised(), 600e6);
        assertEq(pool.totalAllocated(), 600 * u);
        assertEq(pool.contributions(alice), 300e6);
        assertEq(usdc.balanceOf(address(pool)), 600e6);
        assertEq(uint8(pool.status()), uint8(TokenSalePool.Status.Active));

        _toEnd();
        assertEq(uint8(pool.status()), uint8(TokenSalePool.Status.Succeeded));

        // anyone can finalize; unsold tokens go back to the creator
        vm.expectEmit(false, false, false, true, address(pool));
        emit TokenSalePool.Finalized(true, 600e6, 15e6, 585e6, 400 * u);
        vm.prank(dave);
        pool.finalizeSale();
        assertTrue(pool.finalized());
        assertTrue(pool.successful());
        assertEq(pool.platformFee(), 15e6); // 600e6 * 250 / 10000
        assertEq(pool.creatorProceeds(), 585e6);
        assertEq(token.balanceOf(creator), 9000 * u + 400 * u);
        assertEq(token.balanceOf(address(pool)), 600 * u);

        // USDC is only moved by the independent withdrawals (called by a stranger)
        assertEq(usdc.balanceOf(address(pool)), 600e6);
        uint256 creatorUsdc = usdc.balanceOf(creator);
        uint256 treasuryUsdc = usdc.balanceOf(treasury);

        vm.expectEmit(true, false, false, true, address(pool));
        emit TokenSalePool.ProceedsWithdrawn(creator, 585e6);
        vm.prank(dave);
        pool.withdrawProceeds();
        vm.expectEmit(true, false, false, true, address(pool));
        emit TokenSalePool.PlatformFeeWithdrawn(treasury, 15e6);
        vm.prank(dave);
        pool.withdrawPlatformFee();
        assertEq(usdc.balanceOf(creator), creatorUsdc + 585e6);
        assertEq(usdc.balanceOf(treasury), treasuryUsdc + 15e6);
        assertEq(usdc.balanceOf(address(pool)), 0);

        // claims
        assertEq(pool.tokensOwed(alice), 300 * u);
        vm.expectEmit(true, false, false, true, address(pool));
        emit TokenSalePool.TokensClaimed(alice, 300 * u);
        vm.prank(alice);
        pool.claimTokens();
        vm.prank(bob);
        pool.claimTokens();
        vm.prank(carol);
        pool.claimTokens();
        assertEq(token.balanceOf(alice), 300 * u);
        assertEq(token.balanceOf(bob), 200 * u);
        assertEq(token.balanceOf(carol), 100 * u);
        assertEq(pool.tokensOwed(alice), 0);

        // conservation: nothing stranded, supply intact
        assertEq(token.balanceOf(address(pool)), 0);
        assertEq(usdc.balanceOf(address(pool)), 0);
        assertEq(
            token.balanceOf(alice) + token.balanceOf(bob) + token.balanceOf(carol) + token.balanceOf(creator),
            10_000 * u
        );
    }

    function test_FullSuccessfulSale_18Decimals() public {
        _fullFlow(18);
    }

    function test_FullSuccessfulSale_6Decimals() public {
        _fullFlow(6);
    }

    function test_FullSuccessfulSale_0Decimals() public {
        _fullFlow(0);
    }

    // ---- hard cap filled early ----
    function test_HardCapFillEarly_ClaimsOnlyAfterEndTime() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 500e6);
        _contribute(bob, 500e6);
        assertEq(pool.remainingRoom(), 0);
        assertEq(uint8(pool.status()), uint8(TokenSalePool.Status.Succeeded));

        // sale is closed to new money, claims not yet open
        vm.prank(carol);
        vm.expectRevert(TokenSalePool.SaleNotActive.selector);
        pool.contribute(10e6);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.CannotClaim.selector);
        pool.claimTokens();

        // finalize early (hard cap reached); no unsold tokens -> creator unchanged
        vm.prank(carol);
        pool.finalizeSale();
        assertEq(token.balanceOf(creator), 9000e18);
        assertEq(pool.platformFee(), 25e6);
        assertEq(pool.creatorProceeds(), 975e6);
        pool.withdrawProceeds();
        pool.withdrawPlatformFee();

        vm.warp(end - 1);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.CannotClaim.selector);
        pool.claimTokens();

        vm.warp(end);
        vm.prank(alice);
        pool.claimTokens();
        vm.prank(bob);
        pool.claimTokens();
        assertEq(token.balanceOf(alice), 500e18);
        assertEq(token.balanceOf(bob), 500e18);
        assertEq(token.balanceOf(address(pool)), 0);
        assertEq(usdc.balanceOf(address(pool)), 0);
    }

    function test_ClaimWorksWithoutFinalize_ThenFinalizeReturnsOnlyUnsold() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 300e6);
        _toEnd();
        vm.prank(alice);
        pool.claimTokens();
        assertEq(token.balanceOf(address(pool)), 700e18);
        pool.finalizeSale();
        assertEq(token.balanceOf(address(pool)), 0);
        assertEq(token.balanceOf(creator), 9000e18 + 700e18);
    }

    function test_SoftCapExactlyMetSucceeds() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 200e6);
        _toEnd();
        assertEq(uint8(pool.status()), uint8(TokenSalePool.Status.Succeeded));
        pool.finalizeSale();
        assertTrue(pool.successful());
        vm.prank(alice);
        pool.claimTokens();
        assertEq(token.balanceOf(alice), 200e18);
    }

    function test_RemainingRoomFillBelowMinimumSucceeds() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 500e6);
        _contribute(bob, 495e6);
        _contribute(carol, 5e6); // below min (10e6) but equals remaining room
        assertEq(pool.totalRaised(), 1000e6);
        assertEq(pool.contributions(carol), 5e6);
        _toEnd();
        vm.prank(carol);
        pool.claimTokens();
        assertEq(token.balanceOf(carol), 5e18);
    }

    // ---- rounding & fees ----
    function test_FloorRoundingPerWallet_UnsoldUsesTotalAllocated() public {
        LaunchpadFactory.TokenParams memory t = _tokenParams(0);
        LaunchpadFactory.SaleParams memory s = _saleParams(0);
        s.price = 3e6;
        s.tokensForSale = 400; // hard cap 1000e6 / 3e6 = 333 tokens covered
        s.softCap = 20e6;
        _launch(t, s);
        _toStart();
        _contribute(alice, 10e6); // 3
        _contribute(bob, 11e6); // 3
        _contribute(carol, 12e6); // 4
        _contribute(dave, 10e6); // 3
        _contribute(dave, 11e6); // total 21e6 -> 7 (per-wallet floor, not 3 + 3)
        assertEq(pool.totalAllocated(), 3 + 3 + 4 + 7);
        _toEnd();
        pool.finalizeSale();
        assertEq(token.balanceOf(creator), 9_600 + (400 - 17));
        vm.prank(alice);
        pool.claimTokens();
        vm.prank(bob);
        pool.claimTokens();
        vm.prank(carol);
        pool.claimTokens();
        vm.prank(dave);
        pool.claimTokens();
        assertEq(token.balanceOf(alice), 3);
        assertEq(token.balanceOf(bob), 3);
        assertEq(token.balanceOf(carol), 4);
        assertEq(token.balanceOf(dave), 7);
        assertEq(token.balanceOf(address(pool)), 0);
    }

    function test_FeeMathFloorsAndProceedsPlusFeeEqualsRaised() public {
        LaunchpadFactory.SaleParams memory s = _saleParams(18);
        s.softCap = 10e6;
        _launch(_tokenParams(18), s);
        _toStart();
        _contribute(alice, 10_000_007);
        _toEnd();
        pool.finalizeSale();
        assertEq(pool.platformFee(), 250_000); // floor(10_000_007 * 250 / 10_000)
        assertEq(pool.creatorProceeds(), 9_750_007);
        assertEq(pool.platformFee() + pool.creatorProceeds(), pool.totalRaised());
        pool.withdrawProceeds();
        pool.withdrawPlatformFee();
        assertEq(usdc.balanceOf(address(pool)), 0);
    }

    function test_MaxFeeTenPercent() public {
        vm.prank(owner);
        factory.setSaleFeeBps(1000);
        _deploy(18);
        _toStart();
        _contribute(alice, 300e6);
        _toEnd();
        pool.finalizeSale();
        assertEq(pool.platformFee(), 30e6);
        assertEq(pool.creatorProceeds(), 270e6);
    }

    function test_ZeroFeeSale_WithdrawFeeCompletesWithZeroAmount() public {
        vm.prank(owner);
        factory.setSaleFeeBps(0);
        _deploy(18);
        _toStart();
        _contribute(alice, 300e6);
        _toEnd();
        pool.finalizeSale();
        assertEq(pool.platformFee(), 0);
        assertEq(pool.creatorProceeds(), 300e6);
        uint256 tBefore = usdc.balanceOf(treasury);
        vm.expectEmit(true, false, false, true, address(pool));
        emit TokenSalePool.PlatformFeeWithdrawn(treasury, 0);
        pool.withdrawPlatformFee();
        assertEq(usdc.balanceOf(treasury), tBefore);
        assertTrue(pool.feeWithdrawn());
        vm.expectRevert(TokenSalePool.CannotWithdraw.selector);
        pool.withdrawPlatformFee();
    }

    // ---- views & ordering ----
    function test_StatusTransitionsAndGetInfo() public {
        _deploy(18);
        assertEq(uint8(pool.status()), uint8(TokenSalePool.Status.Upcoming));
        _toStart();
        assertEq(uint8(pool.status()), uint8(TokenSalePool.Status.Active));
        _contribute(alice, 250e6);
        TokenSalePool.Info memory info = pool.getInfo();
        assertEq(info.token, address(token));
        assertEq(info.creator, creator);
        assertEq(info.price, 1e6);
        assertEq(info.tokensForSale, 1000e18);
        assertEq(info.softCap, 200e6);
        assertEq(info.hardCap, 1000e6);
        assertEq(info.minContribution, 10e6);
        assertEq(info.maxContribution, 500e6);
        assertEq(info.startTime, start);
        assertEq(info.endTime, end);
        assertEq(info.totalRaised, 250e6);
        assertEq(info.totalAllocated, 250e18);
        assertFalse(info.finalized);
        assertEq(uint8(info.status), uint8(TokenSalePool.Status.Active));
        assertEq(pool.tokensOwed(alice), 250e18); // visible before settlement
        assertEq(pool.refundable(alice), 0);
        assertEq(pool.remainingRoom(), 750e6);
    }

    function test_WithdrawBeforeFinalizeReverts() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 300e6);
        _toEnd();
        vm.expectRevert(TokenSalePool.CannotWithdraw.selector);
        pool.withdrawProceeds();
        vm.expectRevert(TokenSalePool.CannotWithdraw.selector);
        pool.withdrawPlatformFee();
    }

    function test_FinalizeBeforeEndWithoutHardCapReverts() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 300e6);
        vm.warp(end - 1);
        vm.expectRevert(TokenSalePool.CannotFinalize.selector);
        pool.finalizeSale();
    }
}
