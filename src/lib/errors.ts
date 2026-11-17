import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

const REVERT_MESSAGES: Record<string, string> = {
  EnforcedPause: 'New launches are paused right now.',
  InvalidMetadata: 'Name, symbol, description or links are too long.',
  InvalidSupply: 'Token supply or sale allocation is invalid.',
  InvalidTokenBalance: 'The sale pool did not receive the expected tokens.',
  InvalidDecimals: 'Decimals must be between 0 and 18.',
  InvalidPriceOrSupply: 'Price or tokens for sale are invalid.',
  InvalidCaps: 'Soft cap and hard cap are invalid (soft cap must be above zero and not exceed the hard cap).',
  InvalidContributionLimits: 'Min and max buy must satisfy 0 < min <= max <= hard cap.',
  InvalidTimes: 'Start and end times are invalid (check the start is in the future and the duration is allowed).',
  InvalidFee: 'Platform fee is invalid.',
  InsufficientTokenCoverage: 'Tokens for sale do not cover the hard cap at this price.',
  SaleNotActive: 'This sale is not accepting contributions right now.',
  InvalidContribution: 'Amount is below the minimum buy or exceeds the room left in the sale.',
  ContributionLimitExceeded: 'This would exceed the maximum you can contribute.',
  NoTokenAllocation: 'This amount is too small to receive any tokens.',
  CannotClaim: 'Tokens are not claimable for this wallet right now.',
  CannotRefund: 'No refund is available for this wallet right now.',
  CannotFinalize: 'The sale cannot be finalized yet.',
  CannotWithdraw: 'Nothing to withdraw right now.',
  CannotCancel: 'Only the creator can cancel, and only before the sale starts.',
  UnsupportedTransfer: 'The payment token transfer did not behave as expected.',
  SafeERC20FailedOperation: 'USDC transfer failed. Check your balance and approval.',
  ReentrancyGuardReentrantCall: 'Please wait for the previous action to finish.',
}

export function isUserRejection(error: unknown): boolean {
  if (error instanceof BaseError && error.walk((e) => e instanceof UserRejectedRequestError)) return true
  const e = error as { code?: number; message?: string } | null
  const message = e?.message?.toLowerCase() ?? ''
  return e?.code === 4001 || message.includes('user rejected') || message.includes('user denied')
}

/** Turns any wallet, RPC or revert error into one short sentence for the user. */
export function parseTxError(error: unknown): string {
  if (isUserRejection(error)) return 'Transaction cancelled.'

  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name]
      if (reverted.reason) return `Transaction would fail: ${reverted.reason}`
    }
  }

  const message = (error as { message?: string } | null)?.message?.toLowerCase() ?? ''
  if (message.includes('insufficient funds') || message.includes('exceeds the balance')) {
    return 'Not enough USDC to cover gas. Get test USDC from the faucet.'
  }
  if (message.includes('transfer amount exceeds balance') || message.includes('insufficient balance')) {
    return 'Your USDC balance is too low for this amount.'
  }
  if (message.includes('allowance')) return 'USDC approval is missing or too low.'
  if (message.includes('timeout') || message.includes('network') || message.includes('fetch failed')) {
    return 'Network issue. Check your connection and try again.'
  }
  if (message.includes('reverted')) return 'The transaction would fail. Check the values and try again.'
  return 'Something went wrong. Please try again.'
}
