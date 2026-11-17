// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {LaunchpadBase} from "./LaunchpadBase.t.sol";
import {LaunchpadFactory} from "../LaunchpadFactory.sol";
import {TokenSalePool} from "../TokenSalePool.sol";

/// Factory validation reverts, owner setters, pause and ownership.
contract LaunchpadFactoryValidationTest is LaunchpadBase {
    LaunchpadFactory.TokenParams internal t;
    LaunchpadFactory.SaleParams internal s;

    function setUp() public override {
        super.setUp();
        t = _tokenParams(18);
        s = _saleParams(18);
    }

    function _create() internal {
        vm.prank(creator);
        factory.createLaunch(t, s);
    }

    function _str(uint256 len) internal pure returns (string memory) {
        return string(new bytes(len)); // zero bytes are fine for length checks
    }

    // ---- metadata validation ----
    function test_RevertWhen_EmptyName() public {
        t.name = "";
        vm.expectRevert(LaunchpadFactory.InvalidMetadata.selector);
        _create();
    }

    function test_RevertWhen_EmptySymbol() public {
        t.symbol = "";
        vm.expectRevert(LaunchpadFactory.InvalidMetadata.selector);
        _create();
    }

    function test_RevertWhen_NameTooLong() public {
        t.name = _str(65);
        vm.expectRevert(LaunchpadFactory.InvalidMetadata.selector);
        _create();
    }

    function test_RevertWhen_SymbolTooLong() public {
        t.symbol = _str(17);
        vm.expectRevert(LaunchpadFactory.InvalidMetadata.selector);
        _create();
    }

    function test_RevertWhen_MetadataURITooLong() public {
        t.metadataURI = _str(257);
        vm.expectRevert(LaunchpadFactory.InvalidMetadata.selector);
        _create();
    }

    function test_RevertWhen_LogoURLTooLong() public {
        t.logoURL = _str(257);
        vm.expectRevert(LaunchpadFactory.InvalidMetadata.selector);
        _create();
    }

    function test_MaxLengthStringsAccepted() public {
        t.name = _str(64);
        t.symbol = _str(16);
        t.metadataURI = _str(256);
        t.logoURL = _str(256);
        _create();
        assertEq(factory.launchCount(), 1);
    }

    function test_EmptyUrisAccepted() public {
        t.metadataURI = "";
        t.logoURL = "";
        _create();
        assertEq(factory.launchCount(), 1);
    }

    // ---- supply validation ----
    function test_RevertWhen_DecimalsAbove18() public {
        t.decimals = 19;
        vm.expectRevert(LaunchpadFactory.InvalidSupply.selector);
        _create();
    }

    function test_RevertWhen_ZeroTotalSupply() public {
        t.totalSupply = 0;
        vm.expectRevert(LaunchpadFactory.InvalidSupply.selector);
        _create();
    }

    function test_RevertWhen_ZeroTokensForSale() public {
        s.tokensForSale = 0;
        vm.expectRevert(LaunchpadFactory.InvalidSupply.selector);
        _create();
    }

    function test_RevertWhen_TokensForSaleExceedsTotalSupply() public {
        s.tokensForSale = t.totalSupply + 1;
        vm.expectRevert(LaunchpadFactory.InvalidSupply.selector);
        _create();
    }

    // ---- fee collection ----
    function test_RevertWhen_NoUsdcAllowance() public {
        address broke = makeAddr("broke");
        usdc.mint(broke, 100e6); // funds but no approval
        vm.prank(broke);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(factory), 0, CREATION_FEE
            )
        );
        factory.createLaunch(t, s);
        assertEq(factory.launchCount(), 0);
    }

    function test_RevertWhen_InsufficientUsdcBalance() public {
        address poor = makeAddr("poor");
        vm.startPrank(poor);
        usdc.approve(address(factory), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, poor, 0, CREATION_FEE)
        );
        factory.createLaunch(t, s);
        vm.stopPrank();
    }

    function test_RevertWhen_AllowanceBelowFee() public {
        address c2 = makeAddr("c2");
        usdc.mint(c2, 100e6);
        vm.startPrank(c2);
        usdc.approve(address(factory), CREATION_FEE - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(factory), CREATION_FEE - 1, CREATION_FEE
            )
        );
        factory.createLaunch(t, s);
        vm.stopPrank();
    }

    // ---- bad sale params bubble up from the pool constructor ----
    function test_RevertWhen_ZeroPrice() public {
        s.price = 0;
        vm.expectRevert(TokenSalePool.InvalidPriceOrSupply.selector);
        _create();
    }

    function test_RevertWhen_SoftCapAboveHardCap() public {
        s.softCap = s.hardCap + 1;
        vm.expectRevert(TokenSalePool.InvalidCaps.selector);
        _create();
    }

    function test_RevertWhen_MinAboveMax() public {
        s.minContribution = s.maxContribution + 1;
        vm.expectRevert(TokenSalePool.InvalidContributionLimits.selector);
        _create();
    }

    function test_RevertWhen_StartInPast() public {
        s.startTime = uint64(block.timestamp - 1);
        vm.expectRevert(TokenSalePool.InvalidTimes.selector);
        _create();
    }

    function test_RevertWhen_DurationTooShort() public {
        s.endTime = s.startTime + 10 minutes - 1;
        vm.expectRevert(TokenSalePool.InvalidTimes.selector);
        _create();
    }

    function test_RevertWhen_HardCapNotCoveredByTokensForSale() public {
        s.hardCap = 1001e6; // needs 1001 tokens, only 1000 for sale
        s.maxContribution = 500e6;
        vm.expectRevert(TokenSalePool.InsufficientTokenCoverage.selector);
        _create();
    }

    function test_HardCapCoverageExactBoundaryAccepted() public {
        // 100 tokens at 2 USDC each supports exactly a 200 USDC hard cap
        s.price = 2e6;
        s.tokensForSale = 100e18;
        s.hardCap = 200e6;
        s.softCap = 50e6;
        s.maxContribution = 200e6;
        _create();
        assertEq(factory.launchCount(), 1);
    }

    // ---- owner setters ----
    function test_SetCreationFee() public {
        vm.expectEmit(false, false, false, true, address(factory));
        emit LaunchpadFactory.CreationFeeUpdated(CREATION_FEE, 100e6);
        vm.prank(owner);
        factory.setCreationFee(100e6);
        assertEq(factory.creationFee(), 100e6);
    }

    function test_SetCreationFee_RevertsAboveCap() public {
        vm.prank(owner);
        vm.expectRevert(LaunchpadFactory.CreationFeeTooHigh.selector);
        factory.setCreationFee(100e6 + 1);
    }

    function test_SetSaleFeeBps() public {
        vm.expectEmit(false, false, false, true, address(factory));
        emit LaunchpadFactory.SaleFeeBpsUpdated(FEE_BPS, 1000);
        vm.prank(owner);
        factory.setSaleFeeBps(1000);
        assertEq(factory.saleFeeBps(), 1000);
    }

    function test_SetSaleFeeBps_RevertsAboveCap() public {
        vm.prank(owner);
        vm.expectRevert(LaunchpadFactory.SaleFeeTooHigh.selector);
        factory.setSaleFeeBps(1001);
    }

    function test_SetTreasury() public {
        address nt = makeAddr("nt");
        vm.expectEmit(true, true, false, false, address(factory));
        emit LaunchpadFactory.TreasuryUpdated(treasury, nt);
        vm.prank(owner);
        factory.setTreasury(nt);
        assertEq(factory.treasury(), nt);
    }

    function test_SetTreasury_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(LaunchpadFactory.ZeroAddress.selector);
        factory.setTreasury(address(0));
    }

    function test_NonOwnerCannotCallAdminFunctions() public {
        bytes memory err = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice);
        vm.startPrank(alice);
        vm.expectRevert(err);
        factory.setCreationFee(1);
        vm.expectRevert(err);
        factory.setSaleFeeBps(1);
        vm.expectRevert(err);
        factory.setTreasury(alice);
        vm.expectRevert(err);
        factory.pause();
        vm.expectRevert(err);
        factory.unpause();
        vm.expectRevert(err);
        factory.transferOwnership(alice);
        vm.stopPrank();
    }

    // ---- pause ----
    function test_PauseBlocksCreateLaunch_UnpauseRestores() public {
        vm.prank(owner);
        factory.pause();
        assertTrue(factory.paused());
        vm.expectRevert(Pausable.EnforcedPause.selector);
        _create();
        vm.prank(owner);
        factory.unpause();
        _create();
        assertEq(factory.launchCount(), 1);
    }

    function test_PauseDoesNotBlockExistingPoolContributionsOrClaims() public {
        _deploy(18);
        vm.prank(owner);
        factory.pause();
        _toStart();
        _contribute(alice, 250e6);
        _toEnd();
        vm.prank(alice);
        pool.claimTokens();
        assertEq(token.balanceOf(alice), 250e18);
    }

    function test_Unpause_RevertsWhenNotPaused() public {
        vm.prank(owner);
        vm.expectRevert(Pausable.ExpectedPause.selector);
        factory.unpause();
    }

    // ---- ownership ----
    function test_RenounceOwnershipReverts() public {
        vm.prank(owner);
        vm.expectRevert(LaunchpadFactory.OwnershipRenunciationDisabled.selector);
        factory.renounceOwnership();
        assertEq(factory.owner(), owner);
    }

    function test_RenounceOwnershipRevertsForNonOwnerToo() public {
        vm.prank(alice);
        vm.expectRevert(LaunchpadFactory.OwnershipRenunciationDisabled.selector);
        factory.renounceOwnership();
    }

    function test_TransferOwnership() public {
        vm.prank(owner);
        factory.transferOwnership(alice);
        assertEq(factory.owner(), alice);
    }

    function test_Constructor_RevertsOnZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new LaunchpadFactory(address(usdc), treasury, address(0), 0, 0);
    }
}
