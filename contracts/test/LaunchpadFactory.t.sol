// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LaunchpadBase} from "./LaunchpadBase.t.sol";
import {LaunchpadToken} from "../LaunchpadToken.sol";
import {LaunchpadFactory} from "../LaunchpadFactory.sol";
import {TokenSalePool} from "../TokenSalePool.sol";

/// Factory happy path, registry and constructor.
contract LaunchpadFactoryTest is LaunchpadBase {
    function test_Constructor_StoresConfig() public view {
        assertEq(address(factory.usdc()), address(usdc));
        assertEq(factory.treasury(), treasury);
        assertEq(factory.owner(), owner);
        assertEq(factory.creationFee(), CREATION_FEE);
        assertEq(factory.saleFeeBps(), FEE_BPS);
        assertEq(factory.launchCount(), 0);
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(LaunchpadFactory.ZeroAddress.selector);
        new LaunchpadFactory(address(0), treasury, owner, 0, 0);
    }

    function test_Constructor_RevertsOnZeroTreasury() public {
        vm.expectRevert(LaunchpadFactory.ZeroAddress.selector);
        new LaunchpadFactory(address(usdc), address(0), owner, 0, 0);
    }

    function test_Constructor_RevertsOnFeeTooHigh() public {
        vm.expectRevert(LaunchpadFactory.CreationFeeTooHigh.selector);
        new LaunchpadFactory(address(usdc), treasury, owner, 100e6 + 1, 0);
    }

    function test_Constructor_RevertsOnSaleFeeTooHigh() public {
        vm.expectRevert(LaunchpadFactory.SaleFeeTooHigh.selector);
        new LaunchpadFactory(address(usdc), treasury, owner, 0, 1001);
    }

    function test_Constructor_AcceptsMaxFees() public {
        LaunchpadFactory f = new LaunchpadFactory(address(usdc), treasury, owner, 100e6, 1000);
        assertEq(f.creationFee(), 100e6);
        assertEq(f.saleFeeBps(), 1000);
    }

    function test_CreateLaunch_HappyPath() public {
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 creatorBefore = usdc.balanceOf(creator);
        _deploy(18);

        // fee pulled from creator to treasury
        assertEq(usdc.balanceOf(treasury), treasuryBefore + CREATION_FEE);
        assertEq(usdc.balanceOf(creator), creatorBefore - CREATION_FEE);
        assertEq(usdc.balanceOf(address(factory)), 0);

        // supply split: sale tokens to pool, remainder to creator, nothing stranded
        assertEq(token.totalSupply(), 10_000e18);
        assertEq(token.balanceOf(address(pool)), 1000e18);
        assertEq(token.balanceOf(creator), 9000e18);
        assertEq(token.balanceOf(address(factory)), 0);

        // token metadata
        assertEq(token.name(), "Launch Token");
        assertEq(token.symbol(), "LCH");
        assertEq(token.decimals(), 18);
        assertEq(token.metadataURI(), "ipfs://meta");
        assertEq(token.logoURL(), "https://logo.example/l.png");

        // pool config wiring
        assertEq(address(pool.usdc()), address(usdc));
        assertEq(address(pool.token()), address(token));
        assertEq(pool.creator(), creator);
        assertEq(pool.treasury(), treasury);
        assertEq(pool.feeBps(), FEE_BPS);
        assertEq(pool.tokensForSale(), 1000e18);
        assertEq(pool.startTime(), start);
        assertEq(pool.endTime(), end);

        // registry
        assertEq(factory.launchCount(), 1);
        LaunchpadFactory.Launch memory l = factory.getLaunch(0);
        assertEq(l.pool, address(pool));
        assertEq(l.token, address(token));
        assertEq(l.creator, creator);
        assertEq(l.createdAt, uint64(block.timestamp));
        assertTrue(factory.isFactoryPool(address(pool)));
        assertFalse(factory.isFactoryPool(address(token)));
        assertFalse(factory.isFactoryPool(alice));
    }

    function test_CreateLaunch_EmitsLaunchCreated() public {
        uint64 nonce = vm.getNonce(address(factory));
        address expectedToken = vm.computeCreateAddress(address(factory), nonce);
        address expectedPool = vm.computeCreateAddress(address(factory), nonce + 1);
        vm.expectEmit(true, true, true, true, address(factory));
        emit LaunchpadFactory.LaunchCreated(
            0, creator, expectedPool, expectedToken, "Launch Token", "LCH", 6, 10_000e6, CREATION_FEE
        );
        LaunchpadFactory.TokenParams memory t = _tokenParams(6);
        LaunchpadFactory.SaleParams memory s = _saleParams(6);
        vm.prank(creator);
        (address tk, address pl) = factory.createLaunch(t, s);
        assertEq(tk, expectedToken);
        assertEq(pl, expectedPool);
    }

    function test_CreateLaunch_AllSupplyForSaleLeavesCreatorNoTokens() public {
        LaunchpadFactory.TokenParams memory t = _tokenParams(18);
        LaunchpadFactory.SaleParams memory s = _saleParams(18);
        t.totalSupply = s.tokensForSale;
        _launch(t, s);
        assertEq(token.balanceOf(address(pool)), s.tokensForSale);
        assertEq(token.balanceOf(creator), 0);
        assertEq(token.balanceOf(address(factory)), 0);
    }

    function test_CreateLaunch_ZeroFeeNeedsNoAllowanceAndPaysNothing() public {
        vm.prank(owner);
        factory.setCreationFee(0);
        address newCreator = makeAddr("newCreator");
        uint256 before_ = usdc.balanceOf(treasury);
        vm.prank(newCreator);
        factory.createLaunch(_tokenParams(18), _saleParams(18));
        assertEq(usdc.balanceOf(treasury), before_);
        assertEq(factory.launchCount(), 1);
    }

    function test_CreateLaunch_UsesCurrentFeeAndTreasuryForNewPoolsOnly() public {
        _deploy(18);
        TokenSalePool first = pool;
        address newTreasury = makeAddr("newTreasury");
        vm.startPrank(owner);
        factory.setSaleFeeBps(500);
        factory.setTreasury(newTreasury);
        vm.stopPrank();
        _deploy(18);
        assertEq(first.feeBps(), FEE_BPS);
        assertEq(first.treasury(), treasury);
        assertEq(pool.feeBps(), 500);
        assertEq(pool.treasury(), newTreasury);
        assertEq(usdc.balanceOf(newTreasury), CREATION_FEE);
    }

    function test_Registry_PagingAndCreatorIndex() public {
        address creator2 = makeAddr("creator2");
        usdc.mint(creator2, 100e6);
        vm.prank(creator2);
        usdc.approve(address(factory), type(uint256).max);

        address[5] memory pools;
        for (uint256 i; i < 5; ++i) {
            address by = (i % 2 == 0) ? creator : creator2; // 0,2,4 -> creator; 1,3 -> creator2
            vm.prank(by);
            (, address p) = factory.createLaunch(_tokenParams(18), _saleParams(18));
            pools[i] = p;
        }
        assertEq(factory.launchCount(), 5);

        LaunchpadFactory.Launch[] memory page = factory.getLaunches(0, 2);
        assertEq(page.length, 2);
        assertEq(page[0].pool, pools[0]);
        assertEq(page[1].pool, pools[1]);

        page = factory.getLaunches(2, 2);
        assertEq(page.length, 2);
        assertEq(page[0].pool, pools[2]);
        assertEq(page[1].pool, pools[3]);

        page = factory.getLaunches(4, 10); // clamps to remaining
        assertEq(page.length, 1);
        assertEq(page[0].pool, pools[4]);

        assertEq(factory.getLaunches(5, 1).length, 0); // offset == count
        assertEq(factory.getLaunches(99, 1).length, 0); // offset beyond count
        assertEq(factory.getLaunches(0, 0).length, 0); // limit zero

        LaunchpadFactory.Launch[] memory mine = factory.getLaunchesByCreator(creator);
        assertEq(mine.length, 3);
        assertEq(mine[0].pool, pools[0]);
        assertEq(mine[1].pool, pools[2]);
        assertEq(mine[2].pool, pools[4]);
        LaunchpadFactory.Launch[] memory theirs = factory.getLaunchesByCreator(creator2);
        assertEq(theirs.length, 2);
        assertEq(theirs[0].pool, pools[1]);
        assertEq(theirs[1].pool, pools[3]);
        assertEq(factory.getLaunchesByCreator(alice).length, 0);
        assertEq(factory.creatorLaunchIds(creator, 2), 4);
        for (uint256 i; i < 5; ++i) assertTrue(factory.isFactoryPool(pools[i]));
    }

    function test_Registry_PageSizeCappedAt100() public {
        vm.prank(owner);
        factory.setCreationFee(0);
        vm.startPrank(creator);
        for (uint256 i; i < 101; ++i) factory.createLaunch(_tokenParams(18), _saleParams(18));
        vm.stopPrank();
        assertEq(factory.launchCount(), 101);
        assertEq(factory.getLaunches(0, 1000).length, 100);
        assertEq(factory.getLaunches(100, 1000).length, 1);
    }

    function test_GetLaunch_InvalidIdReverts() public {
        vm.expectRevert();
        factory.getLaunch(0);
    }
}
