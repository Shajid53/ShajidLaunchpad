// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {LaunchpadBase} from "./LaunchpadBase.t.sol";
import {LaunchpadFactory} from "../LaunchpadFactory.sol";
import {TokenSalePool} from "../TokenSalePool.sol";

/// Fuzzing of contribution / claim / refund / fee math across decimals and prices.
contract TokenSalePoolFuzzTest is LaunchpadBase {
    uint256 internal unit;
    uint256 internal price_;

    /// @dev Launch with exactly the minimum token coverage for the 1000 USDC hard cap.
    function _fuzzLaunch(uint8 dec, uint256 price, uint16 feeBps, uint256 softCap) internal {
        vm.prank(owner);
        factory.setSaleFeeBps(feeBps);
        unit = 10 ** uint256(dec);
        price_ = price;
        uint256 tfs = Math.mulDiv(1000e6, unit, price, Math.Rounding.Ceil);
        LaunchpadFactory.TokenParams memory t = _tokenParams(dec);
        t.totalSupply = tfs + unit;
        LaunchpadFactory.SaleParams memory s = _saleParams(dec);
        s.price = price;
        s.tokensForSale = tfs;
        s.softCap = softCap;
        _launch(t, s);
    }

    function _owed(uint256 usdcAmount) internal view returns (uint256) {
        return Math.mulDiv(usdcAmount, unit, price_);
    }

    function testFuzz_SuccessfulSale_ConservesTokensAndUsdc(
        uint8 dec,
        uint256 price,
        uint16 feeBps,
        uint256 a,
        uint256 b,
        uint256 c
    ) public {
        dec = uint8(bound(dec, 0, 18));
        price = bound(price, 1, 10e6);
        feeBps = uint16(bound(feeBps, 0, 1000));
        a = bound(a, 10e6, 333e6);
        b = bound(b, 10e6, 333e6);
        c = bound(c, 10e6, 333e6);
        _fuzzLaunch(dec, price, feeBps, 30e6);
        uint256 creatorUsdc0 = usdc.balanceOf(creator);
        uint256 treasuryUsdc0 = usdc.balanceOf(treasury);

        _toStart();
        _contribute(alice, a);
        _contribute(bob, b);
        _contribute(carol, c);
        uint256 raised = a + b + c;
        assertEq(usdc.balanceOf(address(pool)), raised);
        _toEnd();
        pool.finalizeSale();
        pool.withdrawProceeds();
        pool.withdrawPlatformFee();

        // USDC in == USDC out (creator + treasury), pool empty
        uint256 fee = (raised * feeBps) / 10_000;
        assertEq(usdc.balanceOf(treasury) - treasuryUsdc0, fee);
        assertEq(usdc.balanceOf(creator) - creatorUsdc0, raised - fee);
        assertEq(usdc.balanceOf(address(pool)), 0);

        // claims
        vm.prank(alice);
        pool.claimTokens();
        vm.prank(bob);
        pool.claimTokens();
        vm.prank(carol);
        pool.claimTokens();
        assertEq(token.balanceOf(alice), _owed(a));
        assertEq(token.balanceOf(bob), _owed(b));
        assertEq(token.balanceOf(carol), _owed(c));
        uint256 claimedSum = token.balanceOf(alice) + token.balanceOf(bob) + token.balanceOf(carol);
        assertLe(claimedSum, pool.tokensForSale());
        assertEq(claimedSum, pool.totalAllocated());
        assertEq(token.balanceOf(address(pool)), 0);
        assertEq(token.balanceOf(creator), token.totalSupply() - claimedSum);
    }

    function testFuzz_FailedSale_RefundsExactAndConserves(uint8 dec, uint256 price, uint256 a, uint256 b, uint256 c)
        public
    {
        dec = uint8(bound(dec, 0, 18));
        price = bound(price, 1, 10e6);
        a = bound(a, 10e6, 60e6);
        b = bound(b, 10e6, 60e6);
        c = bound(c, 10e6, 60e6); // total <= 180e6 < 200e6 soft cap
        _fuzzLaunch(dec, price, FEE_BPS, 200e6);
        _toStart();
        _contribute(alice, a);
        _contribute(bob, b);
        _contribute(carol, c);
        _toEnd();

        vm.prank(alice);
        pool.claimRefund();
        vm.prank(bob);
        pool.claimRefund();
        vm.prank(carol);
        pool.claimRefund();
        assertEq(usdc.balanceOf(alice), INVESTOR_FUNDS);
        assertEq(usdc.balanceOf(bob), INVESTOR_FUNDS);
        assertEq(usdc.balanceOf(carol), INVESTOR_FUNDS);
        assertEq(usdc.balanceOf(address(pool)), 0);

        pool.finalizeSale();
        assertEq(token.balanceOf(creator), token.totalSupply());
        assertEq(token.balanceOf(address(pool)), 0);
        vm.prank(alice);
        vm.expectRevert(TokenSalePool.CannotClaim.selector);
        pool.claimTokens();
    }

    function testFuzz_SingleWalletChunks_UsePerWalletFloor(uint8 dec, uint256 price, uint256 c1, uint256 c2) public {
        dec = uint8(bound(dec, 0, 18));
        price = bound(price, 1, 10e6);
        c1 = bound(c1, 10e6, 250e6);
        c2 = bound(c2, 10e6, 250e6);
        _fuzzLaunch(dec, price, FEE_BPS, 20e6);
        _toStart();
        _contribute(alice, c1);
        _contribute(alice, c2);
        assertEq(pool.totalAllocated(), _owed(c1 + c2));
        assertGe(pool.totalAllocated(), _owed(c1) + _owed(c2));
        _toEnd();
        vm.prank(alice);
        pool.claimTokens();
        assertEq(token.balanceOf(alice), _owed(c1 + c2));
        pool.finalizeSale();
        assertEq(token.balanceOf(address(pool)), 0);
    }

    function testFuzz_FillToHardCap_NeverOverAllocates(uint8 dec, uint256 price, uint256 a, uint256 b) public {
        dec = uint8(bound(dec, 0, 18));
        price = bound(price, 1, 10e6);
        a = bound(a, 10e6, 500e6);
        b = bound(b, 10e6, 500e6);
        _fuzzLaunch(dec, price, FEE_BPS, 30e6);
        _toStart();
        _contribute(alice, a);
        _contribute(bob, b);
        address[2] memory fillers = [carol, dave];
        for (uint256 i; i < 2; ++i) {
            uint256 room = pool.remainingRoom();
            if (room == 0) break;
            uint256 amt = room > 500e6 ? 500e6 : room;
            vm.prank(fillers[i]);
            try pool.contribute(amt) {} catch {} // tiny remainders may legitimately yield zero tokens
        }
        assertLe(pool.totalRaised(), 1000e6);
        assertLe(pool.totalAllocated(), pool.tokensForSale());
        assertEq(usdc.balanceOf(address(pool)), pool.totalRaised());

        _toEnd();
        pool.finalizeSale();
        address[4] memory all = [alice, bob, carol, dave];
        uint256 claimedSum;
        for (uint256 i; i < 4; ++i) {
            if (pool.contributions(all[i]) == 0) continue;
            vm.prank(all[i]);
            pool.claimTokens();
            claimedSum += token.balanceOf(all[i]);
        }
        assertEq(claimedSum, pool.totalAllocated());
        assertLe(claimedSum, pool.tokensForSale());
        assertEq(token.balanceOf(address(pool)), 0);
    }

    function testFuzz_PlatformFeePlusProceedsEqualsRaised(uint16 feeBps, uint256 a) public {
        feeBps = uint16(bound(feeBps, 0, 1000));
        a = bound(a, 10e6, 500e6);
        _fuzzLaunch(18, 1e6, feeBps, 10e6);
        _toStart();
        _contribute(alice, a);
        _toEnd();
        pool.finalizeSale();
        assertEq(pool.platformFee() + pool.creatorProceeds(), a);
        assertEq(pool.platformFee(), (a * feeBps) / 10_000);
    }
}
