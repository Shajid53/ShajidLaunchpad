import { useAccount } from 'wagmi'
import { poolAbi, PoolStatus } from '@/lib/contracts'
import { formatToken, formatUsd, tokensFor, type LaunchState } from '@/lib/format'
import type { LaunchDetail } from '@/hooks/useLaunch'
import { useTx } from '@/hooks/useTx'
import { ActionButton, ExplorerLink } from '@/components/ui'

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-subtle">{label}</dt>
      <dd className="num text-right font-medium text-ink">{value}</dd>
    </div>
  )
}

/** The connected wallet's position plus the claim or refund action that fits the pool state. */
export function PositionPanel({ detail, state, now }: { detail: LaunchDetail; state: LaunchState; now: number }) {
  const { isConnected } = useAccount()
  const claimTx = useTx()
  const refundTx = useTx()
  const { info, position, decimals, symbol } = detail

  if (isConnected && !position) {
    return (
      <section className="card p-5" aria-busy>
        <h2 className="display mb-3 text-lg font-semibold">Your position</h2>
        <div className="skeleton h-24 w-full" />
      </section>
    )
  }

  if (!isConnected || !position) {
    return (
      <section className="card p-5">
        <h2 className="display mb-2 text-lg font-semibold">Your position</h2>
        <p className="mb-4 text-sm text-muted">Connect a wallet to see what you contributed and what you can claim.</p>
        <ActionButton className="w-full" label="Connect wallet" onClick={() => undefined} />
      </section>
    )
  }

  const allocation = tokensFor(position.contributed, decimals, info.price)
  const ended = now >= info.endTime
  const canClaimTokens =
    ended && state === 'succeeded' && position.contributed > 0n && !position.claimed && allocation > 0n
  const canRefund = position.refundable > 0n

  const hint = (() => {
    if (position.contributed === 0n) return 'You have not contributed to this sale.'
    if (state === 'upcoming' || state === 'live') return 'Tokens unlock after the sale ends, if the soft cap is reached.'
    if (position.claimed) return 'You claimed your tokens.'
    if (position.refunded) return 'Your USDC was refunded.'
    if (state === 'succeeded') return ended ? 'The sale succeeded. Your tokens are ready to claim.' : 'The hard cap was reached. Tokens unlock when the sale end time passes.'
    return 'The soft cap was not met. Claim your full USDC refund.'
  })()

  const busyMsg = (tx: ReturnType<typeof useTx>) => (tx.phase === 'confirming' ? 'Confirming…' : 'Confirm in wallet…')

  return (
    <section className="card p-5">
      <h2 className="display mb-2 text-lg font-semibold">Your position</h2>
      <dl className="divide-y divide-line">
        <Line label="Contributed" value={`${formatUsd(position.contributed)} USDC`} />
        <Line label="Token allocation" value={`${formatToken(allocation, decimals)} ${symbol}`} />
        <Line
          label="Claimable now"
          value={`${formatToken(canClaimTokens ? position.tokensOwed : 0n, decimals)} ${symbol}`}
        />
        <Line label="Refundable" value={`${formatUsd(position.refundable)} USDC`} />
      </dl>
      <p className="mt-3 text-sm text-muted">{hint}</p>

      {(claimTx.error || refundTx.error) && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {claimTx.error ?? refundTx.error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {canClaimTokens && (
          <ActionButton
            className="w-full"
            label={`Claim ${formatToken(position.tokensOwed, decimals)} ${symbol}`}
            busy={claimTx.busy}
            busyLabel={busyMsg(claimTx)}
            onClick={() =>
              void claimTx.run({ address: detail.pool, abi: poolAbi, functionName: 'claimTokens', label: 'Claim tokens' })
            }
          />
        )}
        {canRefund && (
          <ActionButton
            className="w-full"
            label={`Claim refund of ${formatUsd(position.refundable)} USDC`}
            busy={refundTx.busy}
            busyLabel={busyMsg(refundTx)}
            onClick={() =>
              void refundTx.run({ address: detail.pool, abi: poolAbi, functionName: 'claimRefund', label: 'Claim refund' })
            }
          />
        )}
      </div>
    </section>
  )
}

/** Permissionless settlement steps and the creator's pre-start cancel. */
export function SettlementPanel({ detail, state, now }: { detail: LaunchDetail; state: LaunchState; now: number }) {
  const { address } = useAccount()
  const finalizeTx = useTx()
  const proceedsTx = useTx()
  const feeTx = useTx()
  const cancelTx = useTx()
  const { info } = detail

  const isCreator = !!address && address.toLowerCase() === detail.creator.toLowerCase()
  const cancelled = info.status === PoolStatus.Cancelled
  const closedForSettlement = !cancelled && (now >= info.endTime || info.totalRaised >= info.hardCap)
  const canCancel = isCreator && !cancelled && !info.finalized && now < info.startTime
  const canFinalize = closedForSettlement && !info.finalized
  const showFunds = info.finalized && detail.successful

  if (!canCancel && !canFinalize && !showFunds) return null
  const busyMsg = (tx: ReturnType<typeof useTx>) => (tx.phase === 'confirming' ? 'Confirming…' : 'Confirm in wallet…')

  return (
    <section className="card p-5">
      <h2 className="display mb-2 text-lg font-semibold">Settlement</h2>

      {canCancel && (
        <div className="mb-3">
          <p className="mb-3 text-sm text-muted">
            You created this sale. You can cancel it until it starts and the tokens return to you.
          </p>
          <ActionButton
            className="w-full"
            variant="danger"
            label="Cancel sale"
            busy={cancelTx.busy}
            busyLabel={busyMsg(cancelTx)}
            onClick={() => void cancelTx.run({ address: detail.pool, abi: poolAbi, functionName: 'cancelSale', label: 'Cancel sale' })}
          />
        </div>
      )}

      {canFinalize && (
        <div className="mb-3">
          <p className="mb-3 text-sm text-muted">
            {state === 'succeeded'
              ? 'The sale succeeded. Finalizing records the result and sends unsold tokens back to the creator. Anyone can do this.'
              : 'The sale missed its soft cap. Finalizing returns all escrowed tokens to the creator. Anyone can do this.'}
          </p>
          <ActionButton
            className="w-full"
            variant="ghost"
            label="Finalize sale"
            busy={finalizeTx.busy}
            busyLabel={busyMsg(finalizeTx)}
            onClick={() => void finalizeTx.run({ address: detail.pool, abi: poolAbi, functionName: 'finalizeSale', label: 'Finalize sale' })}
          />
        </div>
      )}

      {showFunds && (
        <dl className="divide-y divide-line">
          <div className="flex items-center justify-between gap-3 py-3 text-sm">
            <div>
              <dt className="text-subtle">Creator proceeds</dt>
              <dd className="num font-medium">{formatUsd(detail.creatorProceeds)} USDC</dd>
            </div>
            {detail.proceedsWithdrawn ? (
              <span className="text-xs font-semibold text-success">Paid</span>
            ) : (
              <ActionButton
                variant="ghost"
                label="Send to creator"
                busy={proceedsTx.busy}
                busyLabel={busyMsg(proceedsTx)}
                onClick={() =>
                  void proceedsTx.run({ address: detail.pool, abi: poolAbi, functionName: 'withdrawProceeds', label: 'Send proceeds' })
                }
              />
            )}
          </div>
          <div className="flex items-center justify-between gap-3 py-3 text-sm">
            <div>
              <dt className="text-subtle">Platform fee ({(detail.feeBps / 100).toFixed(2)}%)</dt>
              <dd className="num font-medium">{formatUsd(detail.platformFee)} USDC</dd>
            </div>
            {detail.feeWithdrawn ? (
              <span className="text-xs font-semibold text-success">Paid</span>
            ) : (
              <ActionButton
                variant="ghost"
                label="Send to treasury"
                busy={feeTx.busy}
                busyLabel={busyMsg(feeTx)}
                onClick={() =>
                  void feeTx.run({ address: detail.pool, abi: poolAbi, functionName: 'withdrawPlatformFee', label: 'Send fee' })
                }
              />
            )}
          </div>
          <div className="pt-3 text-xs text-subtle">
            Treasury <ExplorerLink type="address" value={detail.treasury} />
          </div>
        </dl>
      )}
    </section>
  )
}
