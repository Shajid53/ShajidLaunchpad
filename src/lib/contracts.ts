import { parseAbi, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc, requireChain } from '@/onchain-facts'

export const CHAIN_ID = arcTestnet.id
export const CHAIN = requireChain(CHAIN_ID)

const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error('USDC is not registered for Arc Testnet')

export const USDC_ADDRESS = usdcFact.address as Address
export const USDC_DECIMALS = usdcFact.decimals

/** LaunchpadFactory deployed on Arc Testnet. */
export const FACTORY_ADDRESS = '0xd709e8451f3ba754bea0c158f5ccb07b73c7a57c' as const satisfies Address

/** Public Circle faucet for Arc Testnet USDC. */
export const FAUCET_URL = 'https://faucet.circle.com'

/** Mirrors the enum in TokenSalePool. */
export const PoolStatus = {
  Upcoming: 0,
  Active: 1,
  Succeeded: 2,
  Failed: 3,
  Cancelled: 4,
  Ended: 5,
} as const

export const factoryAbi = parseAbi([
  'struct TokenParams { string name; string symbol; uint8 decimals; uint256 totalSupply; string metadataURI; string logoURL; }',
  'struct SaleParams { uint256 price; uint256 tokensForSale; uint256 softCap; uint256 hardCap; uint256 minContribution; uint256 maxContribution; uint64 startTime; uint64 endTime; }',
  'struct Launch { address pool; address token; address creator; uint64 createdAt; }',
  'function createLaunch(TokenParams t, SaleParams s) returns (address token, address pool)',
  'function launchCount() view returns (uint256)',
  'function getLaunches(uint256 offset, uint256 limit) view returns (Launch[] page)',
  'function isFactoryPool(address account) view returns (bool)',
  'function creationFee() view returns (uint256)',
  'function saleFeeBps() view returns (uint16)',
  'function treasury() view returns (address)',
  'function paused() view returns (bool)',
  'event LaunchCreated(uint256 indexed id, address indexed creator, address indexed pool, address token, string name, string symbol, uint8 decimals, uint256 totalSupply, uint256 creationFeePaid)',
  'error EnforcedPause()',
  'error InvalidMetadata()',
  'error InvalidSupply()',
  'error InvalidTokenBalance()',
  'error ZeroAddress()',
  'error SafeERC20FailedOperation(address token)',
  'error InvalidDecimals()',
  'error InvalidPriceOrSupply()',
  'error InvalidCaps()',
  'error InvalidContributionLimits()',
  'error InvalidTimes()',
  'error InvalidFee()',
  'error InsufficientTokenCoverage()',
  'error UnsupportedTransfer()',
])

export const poolAbi = parseAbi([
  'struct Info { address token; address creator; uint256 price; uint256 tokensForSale; uint256 softCap; uint256 hardCap; uint256 minContribution; uint256 maxContribution; uint64 startTime; uint64 endTime; uint256 totalRaised; uint8 status; bool finalized; uint256 totalAllocated; }',
  'function getInfo() view returns (Info info)',
  'function contribute(uint256 usdcAmount)',
  'function claimTokens()',
  'function claimRefund()',
  'function finalizeSale()',
  'function withdrawProceeds()',
  'function withdrawPlatformFee()',
  'function cancelSale()',
  'function contributions(address) view returns (uint256)',
  'function claimed(address) view returns (bool)',
  'function refunded(address) view returns (bool)',
  'function tokensOwed(address user) view returns (uint256)',
  'function refundable(address user) view returns (uint256)',
  'function remainingRoom() view returns (uint256)',
  'function tokenDecimals() view returns (uint8)',
  'function feeBps() view returns (uint16)',
  'function platformFee() view returns (uint256)',
  'function creatorProceeds() view returns (uint256)',
  'function proceedsWithdrawn() view returns (bool)',
  'function feeWithdrawn() view returns (bool)',
  'function successful() view returns (bool)',
  'function cancelled() view returns (bool)',
  'function treasury() view returns (address)',
  'error CannotCancel()',
  'error CannotClaim()',
  'error CannotFinalize()',
  'error CannotRefund()',
  'error CannotWithdraw()',
  'error ContributionLimitExceeded()',
  'error InvalidContribution()',
  'error NoTokenAllocation()',
  'error SaleNotActive()',
  'error ReentrancyGuardReentrantCall()',
  'error SafeERC20FailedOperation(address token)',
])

export const tokenAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function metadataURI() view returns (string)',
  'function logoURL() view returns (string)',
])

export const CONTRACT_LIMITS = {
  nameBytes: 64,
  symbolBytes: 16,
  uriBytes: 256,
  minDurationSec: 10 * 60,
  maxDurationSec: 90 * 24 * 60 * 60,
  /** Smallest lead time before a start so the tx can still land before it. */
  minStartLeadSec: 120,
} as const
