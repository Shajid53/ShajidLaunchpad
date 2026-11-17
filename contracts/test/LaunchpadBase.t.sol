// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LaunchpadToken} from "../LaunchpadToken.sol";
import {LaunchpadFactory} from "../LaunchpadFactory.sol";
import {TokenSalePool} from "../TokenSalePool.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Shared fixtures. Contains NO test functions.
/// Default sale: price 1 USDC / whole token, 1000 tokens for sale, soft 200, hard 1000,
/// min 10, max 500 USDC per wallet, starts in 1h, lasts 7 days, 2.5% fee, 10 USDC creation fee.
abstract contract LaunchpadBase is Test {
    MockUSDC internal usdc;
    LaunchpadFactory internal factory;
    LaunchpadToken internal token;
    TokenSalePool internal pool;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    uint256 internal constant CREATION_FEE = 10e6;
    uint16 internal constant FEE_BPS = 250;
    uint256 internal constant INVESTOR_FUNDS = 1_000_000e6;
    uint256 internal constant CREATOR_FUNDS = 1_000e6;

    uint64 internal start;
    uint64 internal end;

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        usdc = new MockUSDC();
        factory = new LaunchpadFactory(address(usdc), treasury, owner, CREATION_FEE, FEE_BPS);
        usdc.mint(creator, CREATOR_FUNDS);
        vm.prank(creator);
        usdc.approve(address(factory), type(uint256).max);
        usdc.mint(alice, INVESTOR_FUNDS);
        usdc.mint(bob, INVESTOR_FUNDS);
        usdc.mint(carol, INVESTOR_FUNDS);
        usdc.mint(dave, INVESTOR_FUNDS);
    }

    function _unit(uint8 dec) internal pure returns (uint256) {
        return 10 ** uint256(dec);
    }

    function _tokenParams(uint8 dec) internal pure returns (LaunchpadFactory.TokenParams memory t) {
        t = LaunchpadFactory.TokenParams({
            name: "Launch Token",
            symbol: "LCH",
            decimals: dec,
            totalSupply: 10_000 * _unit(dec),
            metadataURI: "ipfs://meta",
            logoURL: "https://logo.example/l.png"
        });
    }

    function _saleParams(uint8 dec) internal view returns (LaunchpadFactory.SaleParams memory s) {
        s = LaunchpadFactory.SaleParams({
            price: 1e6,
            tokensForSale: 1000 * _unit(dec),
            softCap: 200e6,
            hardCap: 1000e6,
            minContribution: 10e6,
            maxContribution: 500e6,
            startTime: uint64(block.timestamp + 1 hours),
            endTime: uint64(block.timestamp + 1 hours + 7 days)
        });
    }

    /// @dev Create a launch through the factory as `creator`; stores token/pool/start/end and
    /// approves the pool for every investor.
    function _launch(LaunchpadFactory.TokenParams memory t, LaunchpadFactory.SaleParams memory s) internal {
        vm.prank(creator);
        (address tk, address pl) = factory.createLaunch(t, s);
        token = LaunchpadToken(tk);
        pool = TokenSalePool(pl);
        start = s.startTime;
        end = s.endTime;
        address[4] memory investors = [alice, bob, carol, dave];
        for (uint256 i; i < 4; ++i) {
            vm.prank(investors[i]);
            usdc.approve(pl, type(uint256).max);
        }
    }

    function _deploy(uint8 dec) internal {
        _launch(_tokenParams(dec), _saleParams(dec));
    }

    function _toStart() internal {
        vm.warp(start);
    }

    function _toEnd() internal {
        vm.warp(end);
    }

    function _contribute(address who, uint256 amount) internal {
        vm.prank(who);
        pool.contribute(amount);
    }
}
