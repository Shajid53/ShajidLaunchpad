import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { isAddress, type Address } from 'viem'
import { ArrowLeft, Check, Copy, Globe, Twitter } from 'lucide-react'
import { toast } from 'sonner'
import { FACTORY_ADDRESS } from '@/lib/contracts'
import { buildShareLink } from '@/lib/share'
import { deriveState, formatDateTime, formatToken, formatUsd, formatUsdPrecise } from '@/lib/format'
import { NOT_FOUND, useLaunch, type LaunchDetail as Detail } from '@/hooks/useLaunch'
import { useChainNow } from '@/hooks/useChainNow'
import { Countdown, FundingBar } from '@/components/Funding'
import { BuyBox } from '@/components/detail/BuyBox'
import { PositionPanel, SettlementPanel } from '@/components/detail/PositionPanel'
import { EmptyState, ErrorState, ExplorerLink, Skeleton, Stat, StatusBadge, TokenAvatar } from '@/components/ui'

function CopyLink({ pool }: { pool: Address }) {
  const [link, setLink] = useState<string>()
  const [copied, setCopied] = useState(false)

  // Resolve once on mount so the click handler can copy synchronously.
  useEffect(() => {
    let alive = true
    void buildShareLink(`/launch/${pool}`).then((url) => alive && setLink(url))
    return () => {
      alive = false
    }
  }, [pool])

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy the link', { description: 'Copy it from the address bar instead.' })
    }
  }

  return (
    <button className="btn btn-ghost !min-h-9 !px-3 !text-xs" onClick={() => void copy()} disabled={!link}>
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy aria-label="Loading launch">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/5" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}

function Tokenomics({ detail }: { detail: Detail }) {
  const { info, decimals, symbol } = detail
  const sold = info.totalAllocated
  return (
    <section className="card p-5">
      <h2 className="display mb-4 text-lg font-semibold">Tokenomics and sale terms</h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Stat label="Price" value={`${formatUsdPrecise(info.price)} USDC`} />
        <Stat label="Total supply" value={`${formatToken(detail.totalSupply, decimals)} ${symbol}`} />
        <Stat label="Tokens for sale" value={`${formatToken(info.tokensForSale, decimals)} ${symbol}`} />
        <Stat label="Allocated so far" value={`${formatToken(sold, decimals)} ${symbol}`} />
        <Stat label="Soft cap" value={`${formatUsd(info.softCap)} USDC`} />
        <Stat label="Hard cap" value={`${formatUsd(info.hardCap)} USDC`} />
        <Stat label="Min buy" value={`${formatUsd(info.minContribution)} USDC`} />
        <Stat label="Max per wallet" value={`${formatUsd(info.maxContribution)} USDC`} />
        <Stat label="Decimals" value={decimals} />
        <Stat label="Starts" value={formatDateTime(info.startTime)} />
        <Stat label="Ends" value={formatDateTime(info.endTime)} />
        <Stat label="Platform fee" value={`${(detail.feeBps / 100).toFixed(2)}% of raised`} sub="Only if the sale succeeds" />
      </div>

      <h3 className="label mb-3 mt-7">Contracts</h3>
      <dl className="divide-y divide-line text-sm">
        {(
          [
            ['Sale pool', detail.pool],
            [`${symbol} token`, detail.token],
            ['Creator', detail.creator],
            ['Launch factory', FACTORY_ADDRESS],
          ] as const
        ).map(([label, address]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-subtle">{label}</dt>
            <dd>
              <ExplorerLink type="address" value={address} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default function LaunchDetail() {
  const { pool } = useParams()
  const valid = !!pool && isAddress(pool)
  const { address } = useAccount()
  const now = useChainNow()
  const { data, isLoading, isError, error, refetch } = useLaunch(valid ? (pool) : undefined, address)

  const notFound = !valid || (isError && error.message === NOT_FOUND)

  return (
    <div>
      <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All launches
      </Link>

      {notFound && (
        <EmptyState
          title="Launch not found"
          body="This address is not a sale pool created by the Arc Launchpad factory."
          action={
            <Link to="/" className="btn btn-primary">
              Browse launches
            </Link>
          }
        />
      )}

      {!notFound && isLoading && <DetailSkeleton />}

      {!notFound && isError && (
        <ErrorState
          title="Could not load this launch"
          body="The Arc Testnet RPC did not respond. Check your connection and try again."
          onRetry={() => void refetch()}
        />
      )}

      {data && <DetailBody detail={data} now={now} />}
    </div>
  )
}

function DetailBody({ detail, now }: { detail: Detail; now: number }) {
  const { info } = detail
  const state = deriveState(info, now)

  return (
    <div className="flex flex-col gap-5">
      <header className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
        <TokenAvatar logoURL={detail.logoURL} symbol={detail.symbol} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-balance text-3xl font-bold">{detail.name}</h1>
            <StatusBadge state={state} />
          </div>
          <p className="mono mt-1 text-sm text-subtle">${detail.symbol}</p>
          {detail.meta.description && (
            <p className="mt-3 max-w-2xl text-pretty text-sm text-muted">{detail.meta.description}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {detail.meta.website && (
              <a
                href={detail.meta.website}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost !min-h-9 !px-3 !text-xs"
              >
                <Globe className="size-4" aria-hidden /> Website
              </a>
            )}
            {detail.meta.twitter && (
              <a
                href={`https://x.com/${detail.meta.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost !min-h-9 !px-3 !text-xs"
              >
                <Twitter className="size-4" aria-hidden /> @{detail.meta.twitter}
              </a>
            )}
            <CopyLink pool={detail.pool} />
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5 lg:col-start-1 lg:row-start-1">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="label">Raised</div>
              <div className="display num mt-1 text-4xl font-bold">
                {formatUsd(info.totalRaised)} <span className="text-lg font-medium text-subtle">USDC</span>
              </div>
            </div>
            {state === 'upcoming' && <Countdown label="Starts in" target={info.startTime} now={now} size="lg" />}
            {state === 'live' && <Countdown label="Ends in" target={info.endTime} now={now} size="lg" />}
          </div>
          <FundingBar raised={info.totalRaised} softCap={info.softCap} hardCap={info.hardCap} />
          <p className="mt-4 text-xs text-subtle">
            Funding progress updates from the sale pool onchain every few seconds.
          </p>
        </section>

        <aside className="flex flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:sticky lg:top-24">
          <BuyBox detail={detail} state={state} now={now} />
          <PositionPanel detail={detail} state={state} now={now} />
          <SettlementPanel detail={detail} state={state} now={now} />
        </aside>

        <div className="lg:col-start-1 lg:row-start-2">
          <Tokenomics detail={detail} />
        </div>
      </div>
    </div>
  )
}
