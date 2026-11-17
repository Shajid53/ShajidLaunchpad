// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title TokenSalePool
/// @notice Immutable, unpausable per-sale ERC-20 escrow. No native payments are accepted.
contract TokenSalePool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Config {
        address usdc;
        address token;
        address creator;
        address treasury;
        uint16 feeBps;
        uint256 price;
        uint256 tokensForSale;
        uint256 softCap;
        uint256 hardCap;
        uint256 minContribution;
        uint256 maxContribution;
        uint64 startTime;
        uint64 endTime;
    }

    enum Status { Upcoming, Active, Succeeded, Failed, Cancelled, Ended }

    struct Info {
        address token;
        address creator;
        uint256 price;
        uint256 tokensForSale;
        uint256 softCap;
        uint256 hardCap;
        uint256 minContribution;
        uint256 maxContribution;
        uint64 startTime;
        uint64 endTime;
        uint256 totalRaised;
        Status status;
        bool finalized;
        uint256 totalAllocated;
    }

    error ZeroAddress();
    error InvalidFee();
    error InvalidPriceOrSupply();
    error InvalidCaps();
    error InvalidContributionLimits();
    error InvalidTimes();
    error InvalidDecimals();
    error InsufficientTokenCoverage();
    error SaleNotActive();
    error InvalidContribution();
    error NoTokenAllocation();
    error ContributionLimitExceeded();
    error UnsupportedTransfer();
    error CannotFinalize();
    error CannotWithdraw();
    error CannotClaim();
    error CannotRefund();
    error CannotCancel();

    uint256 public constant MIN_DURATION = 10 minutes;
    uint256 public constant MAX_DURATION = 90 days;
    IERC20 public immutable usdc;
    IERC20 public immutable token;
    address public immutable creator;
    address public immutable treasury;
    uint16 public immutable feeBps;
    uint8 public immutable tokenDecimals;
    uint256 private immutable _tokenUnit;
    uint256 public immutable price;
    uint256 public immutable tokensForSale;
    uint256 public immutable softCap;
    uint256 public immutable hardCap;
    uint256 public immutable minContribution;
    uint256 public immutable maxContribution;
    uint64 public immutable startTime;
    uint64 public immutable endTime;

    uint256 public totalRaised;
    /// @notice Sum of per-wallet floor-rounded entitlements; claims do not decrement it.
    uint256 public totalAllocated;
    /// @notice Treasury's USDC entitlement stored on successful finalization.
    uint256 public platformFee;
    /// @notice Creator's USDC entitlement stored on successful finalization.
    uint256 public creatorProceeds;
    /// @notice Whether the creator's independent proceeds withdrawal has completed.
    bool public proceedsWithdrawn;
    /// @notice Whether the treasury's independent fee withdrawal has completed.
    bool public feeWithdrawn;
    mapping(address => uint256) public contributions;
    bool public finalized;
    bool public cancelled;
    bool public successful;
    mapping(address => bool) public claimed;
    mapping(address => bool) public refunded;

    /// @notice Emitted after an exact USDC contribution is received.
    event Contributed(address indexed user, uint256 amount, uint256 totalRaised);
    /// @notice Emitted after finalization records USDC entitlements without transferring USDC.
    /// @dev unsoldTokens is returned to the creator; on failure it is the full sale supply.
    event Finalized(bool successful, uint256 totalRaised, uint256 platformFee, uint256 creatorProceeds, uint256 unsoldTokens);
    /// @notice Emitted when the creator's proceeds withdrawal completes, including a zero amount.
    event ProceedsWithdrawn(address indexed creator, uint256 amount);
    /// @notice Emitted when the treasury's fee withdrawal completes, including a zero amount.
    event PlatformFeeWithdrawn(address indexed treasury, uint256 amount);
    /// @notice Emitted when a contributor receives their token allocation.
    event TokensClaimed(address indexed user, uint256 amount);
    /// @notice Emitted when a contributor receives their full USDC refund.
    event Refunded(address indexed user, uint256 amount);
    /// @notice Emitted when the creator cancels before the sale starts.
    event SaleCancelled();

    /// @notice Validate and snapshot the full configuration; the factory funds escrow atomically.
    constructor(Config memory c) {
        if (c.usdc == address(0) || c.token == address(0) || c.creator == address(0)
            || c.treasury == address(0)) revert ZeroAddress();
        if (c.feeBps > 1000) revert InvalidFee();
        if (c.price == 0 || c.tokensForSale == 0) revert InvalidPriceOrSupply();
        if (c.softCap == 0 || c.softCap > c.hardCap) revert InvalidCaps();
        if (c.minContribution == 0 || c.minContribution > c.maxContribution
            || c.maxContribution > c.hardCap) revert InvalidContributionLimits();
        if (c.startTime < block.timestamp || c.endTime <= c.startTime) revert InvalidTimes();
        uint256 duration = uint256(c.endTime) - c.startTime;
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert InvalidTimes();
        uint8 precision = IERC20Metadata(c.token).decimals();
        if (precision > 18) revert InvalidDecimals();
        uint256 unit = 10 ** uint256(precision);
        if (Math.mulDiv(c.hardCap, unit, c.price) > c.tokensForSale) {
            revert InsufficientTokenCoverage();
        }
        usdc = IERC20(c.usdc);
        token = IERC20(c.token);
        creator = c.creator;
        treasury = c.treasury;
        feeBps = c.feeBps;
        tokenDecimals = precision;
        _tokenUnit = unit;
        price = c.price;
        tokensForSale = c.tokensForSale;
        softCap = c.softCap;
        hardCap = c.hardCap;
        minContribution = c.minContribution;
        maxContribution = c.maxContribution;
        startTime = c.startTime;
        endTime = c.endTime;
    }

    /// @notice Contribute exact USDC base units, without clamping to the hard cap.
    /// @dev Each contribution must increase the caller's floor-rounded token entitlement.
    function contribute(uint256 usdcAmount) external nonReentrant {
        if (cancelled || finalized || block.timestamp < startTime || block.timestamp >= endTime
            || totalRaised == hardCap) revert SaleNotActive();
        uint256 room = remainingRoom();
        if (usdcAmount == 0 || (usdcAmount < minContribution && usdcAmount != room)) {
            revert InvalidContribution();
        }
        if (usdcAmount > room || usdcAmount > maxContribution - contributions[msg.sender]) {
            revert ContributionLimitExceeded();
        }
        uint256 oldAlloc = _tokensFor(contributions[msg.sender]);
        uint256 newContribution = contributions[msg.sender] + usdcAmount;
        uint256 newAlloc = _tokensFor(newContribution);
        uint256 delta = newAlloc - oldAlloc;
        if (delta == 0) revert NoTokenAllocation();
        contributions[msg.sender] = newContribution;
        totalAllocated += delta;
        totalRaised += usdcAmount;
        uint256 beforeBalance = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        uint256 afterBalance = usdc.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != usdcAmount) {
            revert UnsupportedTransfer();
        }
        emit Contributed(msg.sender, usdcAmount, totalRaised);
    }

    /// @notice Anyone may finalize once the sale ends or the hard cap is reached, without transferring USDC.
    /// @dev Success records independent USDC entitlements and returns tokensForSale minus totalAllocated;
    /// failure returns all sale tokens. Investor claims and refunds do not require finalization.
    function finalizeSale() external nonReentrant {
        if (cancelled || finalized || (block.timestamp < endTime && totalRaised != hardCap)) {
            revert CannotFinalize();
        }
        finalized = true;
        successful = _saleSucceeded();
        uint256 unsoldTokens = tokensForSale;
        if (successful) {
            platformFee = Math.mulDiv(totalRaised, feeBps, 10_000);
            creatorProceeds = totalRaised - platformFee;
            unsoldTokens -= totalAllocated;
        }
        if (unsoldTokens != 0) token.safeTransfer(creator, unsoldTokens);
        emit Finalized(successful, totalRaised, platformFee, creatorProceeds, unsoldTokens);
    }

    /// @notice Anyone may withdraw the recorded proceeds to the creator once after successful finalization.
    /// @dev Independent of fee withdrawal and investor claims; zero proceeds still mark withdrawal complete.
    function withdrawProceeds() external nonReentrant {
        if (!finalized || !successful || proceedsWithdrawn) revert CannotWithdraw();
        proceedsWithdrawn = true;
        uint256 amount = creatorProceeds;
        if (amount != 0) usdc.safeTransfer(creator, amount);
        emit ProceedsWithdrawn(creator, amount);
    }

    /// @notice Anyone may withdraw the recorded fee to the treasury once after successful finalization.
    /// @dev Independent of proceeds withdrawal and investor claims; a zero fee still marks withdrawal complete.
    function withdrawPlatformFee() external nonReentrant {
        if (!finalized || !successful || feeWithdrawn) revert CannotWithdraw();
        feeWithdrawn = true;
        uint256 amount = platformFee;
        if (amount != 0) usdc.safeTransfer(treasury, amount);
        emit PlatformFeeWithdrawn(treasury, amount);
    }

    /// @notice Claim the caller's floor-rounded token allocation after the sale has ended and the soft cap was met.
    /// @dev Finalization is not required. Claims open only at or after endTime, even if the hard cap filled earlier.
    function claimTokens() external nonReentrant {
        if (block.timestamp < endTime || !_saleSucceeded() || contributions[msg.sender] == 0
            || claimed[msg.sender]) {
            revert CannotClaim();
        }
        uint256 amount = _tokensFor(contributions[msg.sender]);
        claimed[msg.sender] = true;
        if (amount != 0) token.safeTransfer(msg.sender, amount);
        emit TokensClaimed(msg.sender, amount);
    }

    /// @notice Refund the full contribution on cancellation or an ended, unsuccessful sale.
    /// @dev Finalization is not required and historical totalRaised is not decremented.
    function claimRefund() external nonReentrant {
        if ((!cancelled && !(block.timestamp >= endTime && totalRaised < softCap))
            || contributions[msg.sender] == 0 || refunded[msg.sender]) revert CannotRefund();
        uint256 amount = contributions[msg.sender];
        refunded[msg.sender] = true;
        usdc.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    /// @notice Only the creator may cancel, strictly before the start time.
    function cancelSale() external nonReentrant {
        if (msg.sender != creator || block.timestamp >= startTime || finalized || cancelled) {
            revert CannotCancel();
        }
        cancelled = true;
        finalized = true;
        successful = false;
        token.safeTransfer(creator, tokensForSale);
        emit SaleCancelled();
    }

    /// @notice Derive the lifecycle independently of settlement; Ended is reserved and unused.
    function status() public view returns (Status) {
        if (cancelled) return Status.Cancelled;
        if (block.timestamp < startTime) return Status.Upcoming;
        if (block.timestamp < endTime && totalRaised < hardCap) return Status.Active;
        return _saleSucceeded() ? Status.Succeeded : Status.Failed;
    }

    /// @notice Return the unclaimed floor-rounded allocation, including before settlement.
    /// @dev Failed or cancelled sales and already-claimed positions return zero.
    function tokensOwed(address user) public view returns (uint256) {
        if (claimed[user] || cancelled || status() == Status.Failed) return 0;
        return _tokensFor(contributions[user]);
    }

    /// @notice Return the USDC amount refundable right now, or zero if ineligible.
    function refundable(address user) external view returns (uint256) {
        if (refunded[user]) return 0;
        if (cancelled || (block.timestamp >= endTime && totalRaised < softCap)) {
            return contributions[user];
        }
        return 0;
    }

    /// @notice Return the hard cap minus historical accepted contributions.
    function remainingRoom() public view returns (uint256) {
        return hardCap - totalRaised;
    }

    /// @notice Return the frontend's sale summary, including total floor-rounded entitlements, in one call.
    function getInfo() external view returns (Info memory info) {
        info.token = address(token);
        info.creator = creator;
        info.price = price;
        info.tokensForSale = tokensForSale;
        info.softCap = softCap;
        info.hardCap = hardCap;
        info.minContribution = minContribution;
        info.maxContribution = maxContribution;
        info.startTime = startTime;
        info.endTime = endTime;
        info.totalRaised = totalRaised;
        info.status = status();
        info.finalized = finalized;
        info.totalAllocated = totalAllocated;
    }

    function _saleSucceeded() internal view returns (bool) {
        return !cancelled && (block.timestamp >= endTime || totalRaised == hardCap)
            && totalRaised >= softCap;
    }

    /// @dev Shared per-wallet floor formula for contribution accounting and token claims.
    function _tokensFor(uint256 amount) private view returns (uint256) {
        return Math.mulDiv(amount, _tokenUnit, price);
    }
}
