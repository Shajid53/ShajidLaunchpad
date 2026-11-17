import { Link } from 'react-router-dom'
import { formatCompactToken, formatDateTime, formatUsd, formatUsdPrecise, deriveState } from '@/lib/format'
import type { LaunchSummary } from '@/hooks/useLaunches'
import { Countdown, FundingBar } from '@/components/Funding'
import { StatusBadge, TokenAvatar } from '@/components/ui'

export function LaunchCard({ launch, now }: { launch: LaunchSummary; now: number }) {
  const { info } = launch
  const state = deriveState(info, now)

  return (
    <Link
      to={`/launch/${launch.pool}`}
      className="card group flex flex-col gap-4 p-5 transition-transform duration-200 hover:-translate-y-0.5 hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div className="flex items-start gap-3">
        <TokenAvatar logoURL={launch.logoURL} symbol={launch.symbol} size={48} />
        <div className="min-w-0 flex-1">
          <h3 className="display truncate text-lg font-semibold text-ink">{launch.name}</h3>
          <p className="mono text-xs text-subtle">${launch.symbol}</p>
        </div>
        <StatusBadge state={state} />
      </div>

      <p className="line-clamp-2 min-h-[2.5rem] text-pretty text-sm text-muted">
        {launch.meta.description || 'No description provided.'}
      </p>

      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="label">Price</dt>
          <dd className="num mt-1 font-semibold">{formatUsdPrecise(info.price)}</dd>
        </div>
        <div>
          <dt className="label">Soft cap</dt>
          <dd className="num mt-1 font-semibold">{formatUsd(info.softCap, 0)}</dd>
        </div>
        <div>
          <dt className="label">Hard cap</dt>
          <dd className="num mt-1 font-semibold">{formatUsd(info.hardCap, 0)}</dd>
        </div>
      </dl>

      <FundingBar raised={info.totalRaised} softCap={info.softCap} hardCap={info.hardCap} compact />

      <div className="flex items-end justify-between gap-3 border-t border-line pt-4">
        {state === 'upcoming' && <Countdown label="Starts in" target={info.startTime} now={now} />}
        {state === 'live' && <Countdown label="Ends in" target={info.endTime} now={now} />}
        {(state === 'succeeded' || state === 'failed' || state === 'cancelled') && (
          <div>
            <div className="label">{state === 'cancelled' ? 'Cancelled' : 'Ended'}</div>
            <div className="mt-1 text-sm font-medium text-ink-2">{formatDateTime(info.endTime)}</div>
          </div>
        )}
        <div className="text-right">
          <div className="label">For sale</div>
          <div className="num mt-1 text-sm font-medium text-ink-2">
            {formatCompactToken(info.tokensForSale, launch.decimals)} {launch.symbol}
          </div>
        </div>
      </div>
    </Link>
  )
}

export function LaunchCardSkeleton() {
  return (
    <div className="card flex flex-col gap-4 p-5" aria-hidden>
      <div className="flex items-center gap-3">
        <div className="skeleton size-12" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-3 w-1/4" />
        </div>
      </div>
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-8 w-full" />
    </div>
  )
}
