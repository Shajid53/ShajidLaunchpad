// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {LaunchpadToken} from "./LaunchpadToken.sol";
import {TokenSalePool} from "./TokenSalePool.sol";

/// @title LaunchpadFactory
/// @notice Deploy fixed-supply tokens and immutable sale escrows using ERC-20 USDC only.
contract LaunchpadFactory is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct TokenParams {
        string name;
        string symbol;
        uint8 decimals;
        uint256 totalSupply;
        string metadataURI;
        string logoURL;
    }

    struct SaleParams {
        uint256 price;
        uint256 tokensForSale;
        uint256 softCap;
        uint256 hardCap;
        uint256 minContribution;
        uint256 maxContribution;
        uint64 startTime;
        uint64 endTime;
    }

    struct Launch {
        address pool;
        address token;
        address creator;
        uint64 createdAt;
    }

    error ZeroAddress();
    error CreationFeeTooHigh();
    error SaleFeeTooHigh();
    error InvalidMetadata();
    error InvalidSupply();
    error InvalidTokenBalance();
    error OwnershipRenunciationDisabled();

    uint256 public constant MAX_CREATION_FEE = 100 * 1e6;
    uint16 public constant MAX_SALE_FEE_BPS = 1000;
    uint256 public constant MAX_PAGE_SIZE = 100;

    IERC20 public immutable usdc;
    address public treasury;
    uint256 public creationFee;
    uint16 public saleFeeBps;
    Launch[] private launches;
    mapping(address => uint256[]) public creatorLaunchIds;
    mapping(address => uint256) private poolIdPlusOne;

    /// @notice Emitted when the owner updates the creation fee in USDC base units.
    event CreationFeeUpdated(uint256 previousFee, uint256 newFee);
    /// @notice Emitted when the owner updates the fee for subsequently created sales.
    event SaleFeeBpsUpdated(uint16 previousFeeBps, uint16 newFeeBps);
    /// @notice Emitted when the owner updates the treasury for future launches.
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    /// @notice Emitted when a fully funded token sale is registered under a zero-based ID.
    event LaunchCreated(
        uint256 indexed id,
        address indexed creator,
        address indexed pool,
        address token,
        string name,
        string symbol,
        uint8 decimals,
        uint256 totalSupply,
        uint256 creationFeePaid
    );

    /// @notice Configure ERC-20 USDC, treasury, owner, and capped launch fees.
    /// @dev The supplied USDC must be the network's trusted six-decimal ERC-20 interface.
    constructor(
        address usdc_,
        address treasury_,
        address owner_,
        uint256 creationFee_,
        uint16 saleFeeBps_
    ) Ownable(owner_) {
        if (usdc_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (creationFee_ > MAX_CREATION_FEE) revert CreationFeeTooHigh();
        if (saleFeeBps_ > MAX_SALE_FEE_BPS) revert SaleFeeTooHigh();
        usdc = IERC20(usdc_);
        treasury = treasury_;
        creationFee = creationFee_;
        saleFeeBps = saleFeeBps_;
    }

    /// @notice Set the fee for new launches, capped at 100 USDC.
    function setCreationFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_CREATION_FEE) revert CreationFeeTooHigh();
        uint256 previous = creationFee;
        creationFee = newFee;
        emit CreationFeeUpdated(previous, newFee);
    }

    /// @notice Set the settlement fee for future pools, capped at ten percent.
    function setSaleFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_SALE_FEE_BPS) revert SaleFeeTooHigh();
        uint16 previous = saleFeeBps;
        saleFeeBps = newFeeBps;
        emit SaleFeeBpsUpdated(previous, newFeeBps);
    }

    /// @notice Set the nonzero treasury for new launches; existing pools are unchanged.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury);
    }

    /// @notice Ownership renunciation is disabled so pausing always remains reversible.
    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }

    /// @notice Pause new launch creation only; existing pool exits remain available.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume new launch creation.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Collect the creation fee, deploy a token and pool, fund escrow, and register.
    /// @param t Fixed-supply token metadata and supply in token base units.
    /// @param s Sale configuration; price and caps use six-decimal USDC base units.
    /// @return token Newly deployed token address.
    /// @return pool Newly deployed, fully funded escrow address.
    function createLaunch(TokenParams calldata t, SaleParams calldata s)
        external nonReentrant whenNotPaused returns (address token, address pool)
    {
        _validateToken(t, s.tokensForSale);
        // Snapshot together before the first external interaction.
        uint256 fee = creationFee;
        TokenSalePool.Config memory config = _poolConfig(s);
        if (fee != 0) usdc.safeTransferFrom(msg.sender, config.treasury, fee);
        token = _deployToken(t);
        config.token = token;
        pool = address(new TokenSalePool(config));

        IERC20 asset = IERC20(token);
        asset.safeTransfer(pool, s.tokensForSale);
        if (asset.balanceOf(pool) != s.tokensForSale) revert InvalidTokenBalance();
        uint256 remainder = t.totalSupply - s.tokensForSale;
        if (remainder != 0) asset.safeTransfer(msg.sender, remainder);
        if (asset.balanceOf(address(this)) != 0) revert InvalidTokenBalance();

        uint256 id = launches.length;
        launches.push(Launch(pool, token, msg.sender, uint64(block.timestamp)));
        creatorLaunchIds[msg.sender].push(id);
        poolIdPlusOne[pool] = id + 1;
        _emitLaunchCreated(id, t, fee);
    }

    /// @notice Return the number of registered launches.
    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    /// @notice Return a zero-based launch record; an invalid ID reverts.
    function getLaunch(uint256 id) external view returns (Launch memory) {
        return launches[id];
    }

    /// @notice Return at most MAX_PAGE_SIZE records; offsets at or beyond count return empty.
    function getLaunches(uint256 offset, uint256 limit) external view returns (Launch[] memory page) {
        uint256 count = launches.length;
        if (offset >= count || limit == 0) return new Launch[](0);
        if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;
        uint256 available = count - offset;
        if (limit > available) limit = available;
        page = new Launch[](limit);
        for (uint256 i; i < limit; ++i) page[i] = launches[offset + i];
    }

    /// @notice Return all launch records for a creator in creation order.
    /// @dev For large histories, use creatorLaunchIds with getLaunch for individual reads.
    function getLaunchesByCreator(address creator) external view returns (Launch[] memory result) {
        uint256[] storage ids = creatorLaunchIds[creator];
        result = new Launch[](ids.length);
        for (uint256 i; i < ids.length; ++i) result[i] = launches[ids[i]];
    }

    /// @notice Return whether an address is a registered pool deployed by this factory.
    function isFactoryPool(address account) external view returns (bool) {
        return poolIdPlusOne[account] != 0;
    }

    function _validateToken(TokenParams calldata t, uint256 saleSupply) private pure {
        if (bytes(t.name).length == 0 || bytes(t.name).length > 64
            || bytes(t.symbol).length == 0 || bytes(t.symbol).length > 16
            || bytes(t.metadataURI).length > 256 || bytes(t.logoURL).length > 256) {
            revert InvalidMetadata();
        }
        if (t.decimals > 18 || t.totalSupply == 0 || saleSupply == 0
            || saleSupply > t.totalSupply) revert InvalidSupply();
    }

    function _deployToken(TokenParams calldata t) private returns (address) {
        return address(new LaunchpadToken(
            t.name, t.symbol, t.decimals, t.totalSupply, address(this), t.metadataURI, t.logoURL
        ));
    }

    function _poolConfig(SaleParams calldata s) private view returns (TokenSalePool.Config memory c) {
        c.usdc = address(usdc);
        c.creator = msg.sender;
        c.treasury = treasury;
        c.feeBps = saleFeeBps;
        c.price = s.price;
        c.tokensForSale = s.tokensForSale;
        c.softCap = s.softCap;
        c.hardCap = s.hardCap;
        c.minContribution = s.minContribution;
        c.maxContribution = s.maxContribution;
        c.startTime = s.startTime;
        c.endTime = s.endTime;
    }

    function _emitLaunchCreated(uint256 id, TokenParams calldata t, uint256 fee) private {
        Launch storage launch = launches[id];
        emit LaunchCreated(
            id, launch.creator, launch.pool, launch.token,
            t.name, t.symbol, t.decimals, t.totalSupply, fee
        );
    }
}
