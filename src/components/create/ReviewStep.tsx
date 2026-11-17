import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReadContract } from 'wagmi'
import { erc20Abi, parseEventLogs, type Address } from 'viem'
import { CheckCircle2, Circle, Loader2, Rocket } from 'lucide-react'
import { CHAIN_ID, FACTORY_ADDRESS, USDC_ADDRESS, factoryAbi } from '@/lib/contracts'
import type { LaunchParams } from '@/lib/createForm'
import { formatDateTime, formatToken, formatUsd, formatUsdPrecise } from '@/lib/format'
import { useTx } from '@/hooks/useTx'
import { useUsdcAllowance, useUsdcBalance } from '@/hooks/useUsdc'
import { ActionButton, ExplorerLink, Skeleton, cx } from '@/components/ui'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-subtle">{label}</dt>
      <dd className="num text-right font-medium text-ink">{value}</dd>
    </div>
  )
}

function StepDot({ state }: { state: 'done' | 'active' | 'todo' }) {
  if (state === 'done') return <CheckCircle2 className="size-5 text-success" aria-label="Done" />
  if (state === 'active') return <Circle className="size-5 text-accent" aria-label="Current step" />
  return <Circle className="size-5 text-subtle/50" aria-label="Not started" />
}

export function ReviewStep({ params, now }: { params: LaunchParams; now: number }) {
  const navigate = useNavigate()
  const approveTx = useTx()
  const createTx = useTx()
  const [createdPool, setCreatedPool] = useState<Address | undefined>()

  const fee = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'creationFee',
    chainId: CHAIN_ID,
  })
  const saleFee = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'saleFeeBps',
    chainId: CHAIN_ID,
  })
  const paused = useReadContract({ address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'paused', chainId: CHAIN_ID })
  const balance = useUsdcBalance()
  const allowance = useUsdcAllowance(FACTORY_ADDRESS)

  const { t, s } = params
  const creationFee = fee.data
  const needsApproval = creationFee !== undefined && creationFee > 0n && (allowance.data ?? 0n) < creationFee
  const lowBalance = creationFee !== undefined && balance.data !== undefined && balance.data < creationFee
  const startPassed = Number(s.startTime) < now + 30
  const approved = creationFee !== undefined && !needsApproval

  const approve = async () => {
    if (creationFee === undefined) return
    await approveTx.run({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [FACTORY_ADDRESS, creationFee],
      label: 'Approve USDC',
    })
  }

  const create = async () => {
    const receipt = await createTx.run({
      address: FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: 'createLaunch',
      args: [t, s],
      label: 'Create launch',
    })
    if (!receipt) return
    const [event] = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: 'LaunchCreated' })
    if (event) setCreatedPool(event.args.pool)
  }

  if (createdPool) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center" role="status">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-success/15">
          <CheckCircle2 className="size-8 text-success" aria-hidden />
        </div>
        <h2 className="display text-2xl font-semibold">Your launch is live onchain</h2>
        <p className="max-w-md text-pretty text-sm text-muted">
          {t.name} was created and its sale pool now holds the tokens for sale. Investors can contribute once the sale
          starts.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button className="btn btn-primary" onClick={() => navigate(`/launch/${createdPool}`)}>
            <Rocket className="size-4" aria-hidden /> Open launch page
          </button>
          {createTx.hash && <ExplorerLink type="tx" value={createTx.hash}>View transaction</ExplorerLink>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <dl className="card-inner divide-y divide-line px-4 py-2">
          <Row label="Token" value={`${t.name} (${t.symbol})`} />
          <Row label="Total supply" value={`${formatToken(t.totalSupply, t.decimals)}`} />
          <Row label="Decimals" value={t.decimals} />
          <Row label="Tokens for sale" value={formatToken(s.tokensForSale, t.decimals)} />
          <Row label="Kept by you" value={formatToken(t.totalSupply - s.tokensForSale, t.decimals)} />
        </dl>
        <dl className="card-inner divide-y divide-line px-4 py-2">
          <Row label="Price" value={`${formatUsdPrecise(s.price)} USDC`} />
          <Row label="Soft cap / Hard cap" value={`${formatUsd(s.softCap, 0)} / ${formatUsd(s.hardCap, 0)} USDC`} />
          <Row label="Min / Max buy" value={`${formatUsd(s.minContribution)} / ${formatUsd(s.maxContribution)} USDC`} />
          <Row label="Starts" value={formatDateTime(Number(s.startTime))} />
          <Row label="Ends" value={formatDateTime(Number(s.endTime))} />
        </dl>
      </div>

      <div className="card-inner p-4">
        <h3 className="label mb-2">Fees</h3>
        <dl className="divide-y divide-line">
          <Row
            label="Creation fee (paid now)"
            value={fee.isLoading ? <Skeleton className="ml-auto h-4 w-16" /> : creationFee !== undefined ? `${formatUsd(creationFee)} USDC` : '--'}
          />
          <Row
            label="Platform fee (only if the sale succeeds)"
            value={saleFee.data !== undefined ? `${(saleFee.data / 100).toFixed(2)}% of USDC raised` : '--'}
          />
        </dl>
      </div>

      <ol className="flex flex-col gap-3">
        <li className="flex items-center gap-3 text-sm">
          <StepDot state={approved ? 'done' : 'active'} />
          <span className={cx(approved ? 'text-muted' : 'text-ink')}>
            {creationFee === 0n ? 'No approval needed (fee is zero)' : 'Approve the creation fee in USDC'}
          </span>
        </li>
        <li className="flex items-center gap-3 text-sm">
          <StepDot state={createTx.phase === 'success' ? 'done' : approved ? 'active' : 'todo'} />
          <span className={cx(approved ? 'text-ink' : 'text-muted')}>Deploy the token and sale pool</span>
        </li>
      </ol>

      {paused.data && (
        <p className="text-sm text-danger" role="alert">
          New launches are paused by the factory owner right now.
        </p>
      )}
      {lowBalance && (
        <p className="text-sm text-danger" role="alert">
          Your USDC balance is below the creation fee. Use Get test USDC in the top bar.
        </p>
      )}
      {startPassed && (
        <p className="text-sm text-danger" role="alert">
          The start time is too close or already passed. Go back and choose a later start.
        </p>
      )}
      {(approveTx.error || createTx.error) && (
        <p className="text-sm text-danger" role="alert">
          {createTx.error ?? approveTx.error}
        </p>
      )}

      {needsApproval ? (
        <ActionButton
          label={creationFee !== undefined ? `Approve ${formatUsd(creationFee)} USDC` : 'Approve USDC'}
          busyLabel={approveTx.phase === 'confirming' ? 'Confirming approval…' : 'Confirm in wallet…'}
          busy={approveTx.busy}
          disabled={lowBalance || creationFee === undefined || !!paused.data}
          onClick={() => void approve()}
          className="w-full"
        />
      ) : (
        <ActionButton
          label="Create token and open sale"
          busyLabel={createTx.phase === 'confirming' ? 'Deploying…' : 'Confirm in wallet…'}
          busy={createTx.busy}
          disabled={!approved || lowBalance || startPassed || !!paused.data || fee.isError}
          onClick={() => void create()}
          className="w-full"
        />
      )}

      {createTx.busy && (
        <p className="flex items-center gap-2 text-xs text-subtle" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {createTx.phase === 'confirming' ? 'Waiting for the transaction to confirm onchain.' : 'Waiting for your wallet.'}
        </p>
      )}
    </div>
  )
}
