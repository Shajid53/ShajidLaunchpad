import { useState } from 'react'
import { erc20Abi } from 'viem'
import { TokenUSDC } from '@web3icons/react'
import { USDC_ADDRESS, poolAbi } from '@/lib/contracts'
import { formatToken, formatUsd, tokensFor, type LaunchState } from '@/lib/format'
import { formatUnitsExact, parseUsdc } from '@/onchain-money'
import type { LaunchDetail } from '@/hooks/useLaunch'
import { useTx } from '@/hooks/useTx'
import { Countdown } from '@/components/Funding'
import { ActionButton } from '@/components/ui'

const minBig = (...values: bigint[]) => values.reduce((a, b) => (b < a ? b : a))

function parseAmount(value: string): bigint | undefined {
  if (!value || value === '.') return undefined
  try {
    return parseUsdc(value)
  } catch {
    return undefined
  }
}

export function BuyBox({ detail, state, now }: { detail: LaunchDetail; state: LaunchState; now: number }) {
  const { info, position, decimals, symbol } = detail
  const [amount, setAmount] = useState('')
  const approveTx = useTx()
  const buyTx = useTx()

  if (state === 'upcoming') {
    return (
      <section className="card p-5">
        <h2 className="display mb-4 text-lg font-semibold">Buy {symbol}</h2>
        <Countdown label="Sale opens in" target={info.startTime} now={now} size="lg" />
        <p className="mt-4 text-sm text-muted">Contributions open when the sale starts. You will need USDC on Arc Testnet.</p>
      </section>
    )
  }

  if (state !== 'live') {
    const text =
      state === 'cancelled'
        ? 'The creator cancelled this sale before it started.'
        : state === 'succeeded'
          ? 'This sale reached its soft cap and is closed. Claim your tokens from the panel below once the sale has ended.'
          : 'This sale ended below its soft cap. Contributors can claim a full USDC refund below.'
    return (
      <section className="card p-5">
        <h2 className="display mb-2 text-lg font-semibold">Sale closed</h2>
        <p className="text-pretty text-sm text-muted">{text}</p>
      </section>
    )
  }

  const parsed = parseAmount(amount)
  const contributed = position?.contributed ?? 0n
  const balance = position?.usdcBalance
  const allowance = position?.usdcAllowance ?? 0n
  const walletRoom = info.maxContribution > contributed ? info.maxContribution - contributed : 0n
  const poolRoom = detail.remainingRoom
  const maxAllowed = minBig(walletRoom, poolRoom, balance ?? walletRoom)

  const estimate =
    parsed !== undefined && parsed > 0n
      ? tokensFor(contributed + parsed, decimals, info.price) - tokensFor(contributed, decimals, info.price)
      : 0n

  let error: string | undefined
  if (amount && parsed === undefined) error = 'Enter a valid USDC amount (up to 6 decimals).'
  else if (parsed !== undefined && parsed > 0n) {
    if (parsed < info.minContribution && parsed !== poolRoom) error = `Minimum buy is ${formatUsd(info.minContribution)} USDC.`
    else if (parsed > walletRoom) error = `You can contribute at most ${formatUsd(walletRoom)} USDC more to this sale.`
    else if (parsed > poolRoom) error = `Only ${formatUsd(poolRoom)} USDC of room is left in this sale.`
    else if (balance !== undefined && parsed > balance) error = `Your USDC balance is ${formatUsd(balance)}.`
    else if (estimate === 0n) error = 'This amount is too small to receive any tokens.'
  }

  const valid = parsed !== undefined && parsed > 0n && !error
  const needsApproval = valid && allowance < parsed
  const busyMsg = (tx: ReturnType<typeof useTx>) => (tx.phase === 'confirming' ? 'Confirming…' : 'Confirm in wallet…')

  const approve = async () => {
    if (!valid) return
    await approveTx.run({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [detail.pool, parsed],
      label: 'Approve USDC',
    })
  }

  const contribute = async () => {
    if (!valid) return
    const receipt = await buyTx.run({
      address: detail.pool,
      abi: poolAbi,
      functionName: 'contribute',
      args: [parsed],
      label: 'Contribute USDC',
    })
    if (receipt) setAmount('')
  }

  return (
    <section className="card p-5">
      <h2 className="display mb-4 text-lg font-semibold">Buy {symbol}</h2>

      <div className="card-inner p-4">
        <div className="flex items-center gap-3">
          <input
            inputMode="decimal"
            placeholder="0.00"
            aria-label="USDC amount"
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (/^\d*\.?\d*$/.test(v)) setAmount(v)
            }}
            className="display num w-full min-w-0 bg-transparent text-3xl font-bold text-ink outline-none placeholder:text-subtle/60"
          />
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold">
            <TokenUSDC variant="branded" size={18} /> USDC
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-subtle">
          <span className="num">
            {balance !== undefined ? `Balance ${formatUsd(balance)} USDC` : 'Connect a wallet to see your balance'}
          </span>
          <span className="flex gap-2">
            <button
              className="font-semibold text-accent hover:text-accent-hover"
              onClick={() => setAmount(formatUnitsExact(minBig(info.minContribution, poolRoom), 6))}
            >
              Min
            </button>
            <button
              className="font-semibold text-accent hover:text-accent-hover disabled:opacity-40"
              disabled={maxAllowed <= 0n}
              onClick={() => setAmount(formatUnitsExact(maxAllowed, 6))}
            >
              Max
            </button>
          </span>
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-subtle">You receive (estimate)</dt>
          <dd className="num font-semibold text-ink">
            {formatToken(estimate, decimals)} {symbol}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-subtle">Limits per wallet</dt>
          <dd className="num text-ink-2">
            {formatUsd(info.minContribution)} to {formatUsd(info.maxContribution)} USDC
          </dd>
        </div>
        {contributed > 0n && (
          <div className="flex justify-between gap-4">
            <dt className="text-subtle">Already contributed</dt>
            <dd className="num text-ink-2">{formatUsd(contributed)} USDC</dd>
          </div>
        )}
      </dl>

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {(approveTx.error || buyTx.error) && !error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {buyTx.error ?? approveTx.error}
        </p>
      )}

      <div className="mt-4">
        {needsApproval ? (
          <ActionButton
            className="w-full"
            label={`Approve ${formatUsd(parsed)} USDC`}
            busy={approveTx.busy}
            busyLabel={busyMsg(approveTx)}
            onClick={() => void approve()}
          />
        ) : (
          <ActionButton
            className="w-full"
            label={valid ? `Contribute ${formatUsd(parsed)} USDC` : 'Enter an amount'}
            busy={buyTx.busy}
            busyLabel={busyMsg(buyTx)}
            disabled={!valid}
            onClick={() => void contribute()}
          />
        )}
      </div>
      <p className="mt-3 text-xs text-subtle">
        Step 1 approves exactly this amount of USDC for the sale pool. Step 2 contributes it. If the soft cap is not
        met you can claim every USDC back.
      </p>
    </section>
  )
}
