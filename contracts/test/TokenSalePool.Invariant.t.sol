// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LaunchpadBase} from "./LaunchpadBase.t.sol";
import {LaunchpadToken} from "../LaunchpadToken.sol";
import {TokenSalePool} from "../TokenSalePool.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// Bounded action surface for the invariant fuzzer; tracks ghost USDC / token flows.
contract SaleHandler is Test {
    TokenSalePool public pool;
    MockUSDC public usdc;
    LaunchpadToken public token;
    address[4] public actors;

    uint256 public ghostContributed;
    uint256 public ghostRefunded;
    uint256 public ghostProceeds;
    uint256 public ghostFee;
    uint256 public ghostClaimed;

    constructor(TokenSalePool pool_, MockUSDC usdc_, LaunchpadToken token_, address[4] memory actors_) {
        pool = pool_;
        usdc = usdc_;
        token = token_;
        actors = actors_;
    }

    function contribute(uint256 seed, uint256 amount) external {
        address a = actors[seed % 4];
        amount = bound(amount, 10e6, 150e6);
        vm.prank(a);
        try pool.contribute(amount) {
            ghostContributed += amount;
        } catch {}
    }

    function claimTokens(uint256 seed) external {
        address a = actors[seed % 4];
        uint256 before_ = token.balanceOf(a);
        vm.prank(a);
        try pool.claimTokens() {
            ghostClaimed += token.balanceOf(a) - before_;
        } catch {}
    }

    function claimRefund(uint256 seed) external {
        address a = actors[seed % 4];
        uint256 amt = pool.refundable(a);
        vm.prank(a);
        try pool.claimRefund() {
            ghostRefunded += amt;
        } catch {}
    }

    function finalize() external {
        try pool.finalizeSale() {} catch {}
    }

    function withdrawProceeds() external {
        uint256 amt = pool.creatorProceeds();
        try pool.withdrawProceeds() {
            ghostProceeds += amt;
        } catch {}
    }

    function withdrawFee() external {
        uint256 amt = pool.platformFee();
        try pool.withdrawPlatformFee() {
            ghostFee += amt;
        } catch {}
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 1, 2 days));
    }
}

contract TokenSalePoolInvariantTest is LaunchpadBase {
    SaleHandler internal handler;

    function setUp() public override {
        super.setUp();
        _deploy(18);
        _toStart();
        handler = new SaleHandler(pool, usdc, token, [alice, bob, carol, dave]);
        targetContract(address(handler));
    }

    /// Pool USDC always equals ghost in-minus-out and covers every outstanding obligation.
    function invariant_PoolUsdcCoversObligations() public view {
        uint256 bal = usdc.balanceOf(address(pool));
        assertEq(
            bal,
            handler.ghostContributed() - handler.ghostRefunded() - handler.ghostProceeds() - handler.ghostFee(),
            "usdc conservation"
        );
        assertEq(pool.totalRaised(), handler.ghostContributed(), "raised tracks accepted contributions");

        if (pool.status() == TokenSalePool.Status.Failed) {
            uint256 owedRefunds;
            address[4] memory actors = [alice, bob, carol, dave];
            for (uint256 i; i < 4; ++i) {
                if (!pool.refunded(actors[i])) owedRefunds += pool.contributions(actors[i]);
            }
            assertGe(bal, owedRefunds, "refund obligations");
        } else {
            uint256 owed = pool.totalRaised() - handler.ghostProceeds() - handler.ghostFee();
            assertGe(bal, owed, "proceeds+fee obligations");
            if (pool.finalized() && pool.successful()) {
                uint256 pending = (pool.proceedsWithdrawn() ? 0 : pool.creatorProceeds())
                    + (pool.feeWithdrawn() ? 0 : pool.platformFee());
                assertGe(bal, pending, "pending withdrawals");
            }
        }
    }

    function invariant_AllocationWithinSupplyAndCaps() public view {
        assertLe(pool.totalAllocated(), pool.tokensForSale());
        assertLe(pool.totalRaised(), pool.hardCap());
    }

    /// Pool always holds enough sale tokens to honour unclaimed allocations (unless the sale failed).
    function invariant_PoolTokensCoverUnclaimedAllocations() public view {
        if (pool.status() != TokenSalePool.Status.Failed) {
            assertGe(token.balanceOf(address(pool)), pool.totalAllocated() - handler.ghostClaimed());
        }
        assertLe(handler.ghostClaimed(), pool.totalAllocated());
    }
}
