// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LaunchpadBase} from "./LaunchpadBase.t.sol";
import {LaunchpadToken} from "../LaunchpadToken.sol";
import {TokenSalePool} from "../TokenSalePool.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {ReentrantERC20} from "./mocks/ReentrantERC20.sol";

/// Blocklisted creator/treasury must not trap investors; malicious tokens cannot re-enter.
contract TokenSalePoolResilienceTest is LaunchpadBase {
    // =====================================================================
    // Blocklist: creator / treasury unable to receive USDC
    // =====================================================================
    function _successfulSale() internal {
        _deploy(18);
        _toStart();
        _contribute(alice, 300e6);
        _contribute(bob, 100e6);
        _toEnd();
    }

    function _blockedErr(address who) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(MockUSDC.Blocked.selector, who);
    }

    function test_BlockedCreator_WithdrawProceedsRevertsButNothingElseBreaks() public {
        _successfulSale();
        usdc.setBlocked(creator, true);
        pool.finalizeSale(); // no USDC leaves the pool during finalize

        vm.expectRevert(_blockedErr(creator));
        pool.withdrawProceeds();
        assertFalse(pool.proceedsWithdrawn());

        // investors claim tokens
        vm.prank(alice);
        pool.claimTokens();
        vm.prank(bob);
        pool.claimTokens();
        assertEq(token.balanceOf(alice), 300e18);
        assertEq(token.balanceOf(bob), 100e18);

        // treasury fee withdrawal unaffected
        uint256 tBefore = usdc.balanceOf(treasury);
        pool.withdrawPlatformFee();
        assertEq(usdc.balanceOf(treasury), tBefore + 10e6); // 400e6 * 2.5%
        // proceeds stay safely escrowed until the creator can receive again
        assertEq(usdc.balanceOf(address(pool)), 390e6);

        usdc.setBlocked(creator, false);
        pool.withdrawProceeds();
        assertEq(usdc.balanceOf(address(pool)), 0);
    }

    function test_BlockedTreasury_WithdrawFeeRevertsButNothingElseBreaks() public {
        _successfulSale();
        usdc.setBlocked(treasury, true);
        pool.finalizeSale();

        vm.expectRevert(_blockedErr(treasury));
        pool.withdrawPlatformFee();
        assertFalse(pool.feeWithdrawn());

        uint256 cBefore = usdc.balanceOf(creator);
        pool.withdrawProceeds();
        assertEq(usdc.balanceOf(creator), cBefore + 390e6);

        vm.prank(alice);
        pool.claimTokens();
        vm.prank(bob);
        pool.claimTokens();
        assertEq(token.balanceOf(alice), 300e18);

        usdc.setBlocked(treasury, false);
        pool.withdrawPlatformFee();
        assertEq(usdc.balanceOf(address(pool)), 0);
    }

    function test_BlockedCreatorAndTreasury_ClaimsWorkWithoutFinalize() public {
        _successfulSale();
        usdc.setBlocked(creator, true);
        usdc.setBlocked(treasury, true);
        vm.prank(alice);
        pool.claimTokens();
        assertEq(token.balanceOf(alice), 300e18);
        pool.finalizeSale(); // token transfer to creator is unaffected by USDC blocklist
        assertEq(token.balanceOf(creator), 9000e18 + 600e18);
        vm.prank(bob);
        pool.claimTokens();
        assertEq(token.balanceOf(address(pool)), 0);
    }

    function test_BlockedCreatorAndTreasury_RefundsStillWorkOnFailedSale() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 100e6);
        _contribute(bob, 50e6);
        _toEnd();
        usdc.setBlocked(creator, true);
        usdc.setBlocked(treasury, true);
        vm.prank(alice);
        pool.claimRefund();
        pool.finalizeSale();
        vm.prank(bob);
        pool.claimRefund();
        assertEq(usdc.balanceOf(alice), INVESTOR_FUNDS);
        assertEq(usdc.balanceOf(bob), INVESTOR_FUNDS);
        assertEq(usdc.balanceOf(address(pool)), 0);
    }

    function test_BlockedInvestorDoesNotAffectOthersRefunds() public {
        _deploy(18);
        _toStart();
        _contribute(alice, 100e6);
        _contribute(bob, 50e6);
        _toEnd();
        usdc.setBlocked(alice, true);
        vm.prank(alice);
        vm.expectRevert(_blockedErr(alice));
        pool.claimRefund();
        vm.prank(bob);
        pool.claimRefund();
        assertEq(usdc.balanceOf(bob), INVESTOR_FUNDS);
        usdc.setBlocked(alice, false);
        vm.prank(alice);
        pool.claimRefund(); // failed attempt did not burn the refund
        assertEq(usdc.balanceOf(alice), INVESTOR_FUNDS);
    }

    // =====================================================================
    // Reentrancy
    // =====================================================================
    function _cfg(address usdc_, address token_, uint256 tokensForSale_)
        internal
        view
        returns (TokenSalePool.Config memory c)
    {
        c = TokenSalePool.Config({
            usdc: usdc_,
            token: token_,
            creator: creator,
            treasury: treasury,
            feeBps: 250,
            price: 1e6,
            tokensForSale: tokensForSale_,
            softCap: 200e6,
            hardCap: 1000e6,
            minContribution: 10e6,
            maxContribution: 500e6,
            startTime: uint64(block.timestamp + 1 hours),
            endTime: uint64(block.timestamp + 1 hours + 7 days)
        });
        // note: caller must keep tokensForSale_ >= 1000 whole tokens for the coverage check
    }

    function test_Reentrancy_MaliciousUsdcCannotReenterContribute() public {
        ReentrantERC20 bad = new ReentrantERC20("BadUSDC", "BAD", 6);
        LaunchpadToken tk = new LaunchpadToken("T", "T", 18, 1000e18, address(this), "", "");
        TokenSalePool.Config memory c = _cfg(address(bad), address(tk), 1000e18);
        TokenSalePool p = new TokenSalePool(c);
        tk.transfer(address(p), 1000e18);
        bad.mint(alice, 1000e6);
        vm.prank(alice);
        bad.approve(address(p), type(uint256).max);

        vm.warp(c.startTime);
        bad.arm(address(p), abi.encodeCall(TokenSalePool.contribute, (10e6)));
        vm.prank(alice);
        p.contribute(100e6);

        assertTrue(bad.reentered());
        assertFalse(bad.reentrySucceeded());
        assertEq(bad.revertSelector(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(p.contributions(alice), 100e6);
        assertEq(p.totalRaised(), 100e6);
        assertEq(bad.balanceOf(address(p)), 100e6);
    }

    function test_Reentrancy_MaliciousUsdcCannotReenterClaimRefund() public {
        ReentrantERC20 bad = new ReentrantERC20("BadUSDC", "BAD", 6);
        LaunchpadToken tk = new LaunchpadToken("T", "T", 18, 1000e18, address(this), "", "");
        TokenSalePool.Config memory c = _cfg(address(bad), address(tk), 1000e18);
        TokenSalePool p = new TokenSalePool(c);
        tk.transfer(address(p), 1000e18);
        bad.mint(alice, 1000e6);
        vm.prank(alice);
        bad.approve(address(p), type(uint256).max);
        vm.warp(c.startTime);
        vm.prank(alice);
        p.contribute(100e6); // below soft cap
        vm.warp(c.endTime);

        bad.arm(address(p), abi.encodeCall(TokenSalePool.claimRefund, ()));
        vm.prank(alice);
        p.claimRefund();

        assertTrue(bad.reentered());
        assertFalse(bad.reentrySucceeded());
        assertEq(bad.revertSelector(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(bad.balanceOf(alice), 1000e6); // refunded exactly once
        assertEq(bad.balanceOf(address(p)), 0);
    }

    function _badTokenSale() internal returns (TokenSalePool p, ReentrantERC20 bad, uint64 s, uint64 e) {
        bad = new ReentrantERC20("BadTok", "BTK", 18);
        TokenSalePool.Config memory c = _cfg(address(usdc), address(bad), 1000e18);
        p = new TokenSalePool(c);
        bad.mint(address(p), 1000e18);
        vm.prank(alice);
        usdc.approve(address(p), type(uint256).max);
        s = c.startTime;
        e = c.endTime;
        vm.warp(s);
        vm.prank(alice);
        p.contribute(300e6);
        vm.warp(e);
    }

    function test_Reentrancy_MaliciousTokenCannotReenterClaimTokens() public {
        (TokenSalePool p, ReentrantERC20 bad,,) = _badTokenSale();
        bad.arm(address(p), abi.encodeCall(TokenSalePool.claimTokens, ()));
        vm.prank(alice);
        p.claimTokens();

        assertTrue(bad.reentered());
        assertFalse(bad.reentrySucceeded());
        assertEq(bad.revertSelector(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(bad.balanceOf(alice), 300e18); // exactly once
        assertEq(bad.balanceOf(address(p)), 700e18);
    }

    function test_Reentrancy_MaliciousTokenCannotReenterFinalize() public {
        (TokenSalePool p, ReentrantERC20 bad,,) = _badTokenSale();
        bad.arm(address(p), abi.encodeCall(TokenSalePool.finalizeSale, ()));
        p.finalizeSale();

        assertTrue(bad.reentered());
        assertFalse(bad.reentrySucceeded());
        assertEq(bad.revertSelector(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(bad.balanceOf(creator), 700e18);
        assertEq(bad.balanceOf(address(p)), 300e18);
    }

    function test_Reentrancy_MaliciousTokenCannotReenterRefundDuringClaim() public {
        (TokenSalePool p, ReentrantERC20 bad,,) = _badTokenSale();
        bad.arm(address(p), abi.encodeCall(TokenSalePool.claimRefund, ()));
        vm.prank(alice);
        p.claimTokens();
        assertFalse(bad.reentrySucceeded());
        assertEq(bad.revertSelector(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertFalse(p.refunded(alice));
    }
}
