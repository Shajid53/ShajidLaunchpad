import { formatUsd, percentBps, splitDuration } from '@/lib/format'
import { cx } from '@/components/ui'

/** Real funding progress: raised vs hard cap, with a marker at the soft cap. */
export function FundingBar({
  raised,
  softCap,
  hardCap,
  compact = false,
}: {
  raised: bigint
  softCap: bigint
  hardCap: bigint
  compact?: boolean
}) {
  const fillBps = percentBps(raised, hardCap)
  const softBps = percentBps(softCap, hardCap)
  const reachedSoft = raised >= softCap
  const pct = (fillBps / 100).toFixed(fillBps < 1000 && fillBps > 0 ? 1 : 0)

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="num text-sm font-semibold text-ink">
          {formatUsd(raised, compact ? 0 : 2)} <span className="font-normal text-subtle">USDC raised</span>
        </span>
        <span className="num text-sm font-semibold text-accent">{pct}%</span>
      </div>
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fillBps / 100)}
        aria-label="Funding progress"
      >
        <div
          className={cx(
            'absolute inset-y-0 left-0 w-full origin-left rounded-full transition-transform duration-700',
            reachedSoft ? 'bg-success' : 'bg-accent',
          )}
          style={{ transform: `scaleX(${fillBps / 10000})` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-ink/70"
          style={{ left: `${softBps / 100}%` }}
          title="Soft cap"
          aria-hidden
        />
      </div>
      <div className="num mt-2 flex justify-between text-xs text-subtle">
        <span>Soft cap {formatUsd(softCap, 0)}</span>
        <span>Hard cap {formatUsd(hardCap, 0)}</span>
      </div>
    </div>
  )
}

/** Live countdown driven by chain time. */
export function Countdown({
  target,
  now,
  label,
  size = 'sm',
}: {
  target: number
  now: number
  label: string
  size?: 'sm' | 'lg'
}) {
  const { days, hours, minutes, seconds } = splitDuration(target - now)
  const pad = (n: number) => String(n).padStart(2, '0')
  const parts: Array<[string, string]> = [
    [String(days), 'd'],
    [pad(hours), 'h'],
    [pad(minutes), 'm'],
    [pad(seconds), 's'],
  ]
  return (
    <div>
      <div className="label">{label}</div>
      <div
        className={cx('display num mt-1 flex items-baseline gap-2 font-semibold text-ink', size === 'lg' ? 'text-3xl' : 'text-lg')}
        role="timer"
        aria-label={`${label}: ${days} days ${hours} hours ${minutes} minutes`}
      >
        {parts.map(([value, unit]) => (
          <span key={unit}>
            {value}
            <span className={cx('ml-0.5 font-normal text-subtle', size === 'lg' ? 'text-base' : 'text-xs')}>{unit}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
