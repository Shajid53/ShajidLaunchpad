import { useState, type ReactNode } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useModal } from 'connectkit'
import { AlertTriangle, ExternalLink, Loader2, Inbox } from 'lucide-react'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import { CHAIN_ID } from '@/lib/contracts'
import { shortAddress, STATE_LABEL, type LaunchState } from '@/lib/format'

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />
}

const STATE_STYLE: Record<LaunchState, string> = {
  live: 'bg-success/15 text-success border-success/30',
  upcoming: 'bg-accent/15 text-accent border-accent/30',
  succeeded: 'bg-success/15 text-success border-success/30',
  failed: 'bg-danger/15 text-danger border-danger/30',
  cancelled: 'bg-white/10 text-subtle border-line',
}

export function StatusBadge({ state }: { state: LaunchState }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        STATE_STYLE[state],
      )}
    >
      {state === 'live' && <span className="size-1.5 animate-pulse rounded-full bg-success" />}
      {STATE_LABEL[state]}
    </span>
  )
}

export function TokenAvatar({
  logoURL,
  symbol,
  size = 48,
}: {
  logoURL?: string
  symbol: string
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }
  if (logoURL && !failed) {
    return (
      <img
        src={logoURL}
        alt={`${symbol} logo`}
        style={style}
        className="shrink-0 rounded-2xl border border-line bg-surface-muted object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div
      style={style}
      className="display flex shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-muted font-bold text-accent"
      aria-label={`${symbol} placeholder logo`}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  )
}

export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="label">{label}</div>
      <div className="num mt-1 text-base font-semibold text-ink">{value}</div>
      {sub && <div className="num mt-0.5 text-xs text-subtle">{sub}</div>}
    </div>
  )
}

export function ExplorerLink({
  type,
  value,
  children,
}: {
  type: 'address' | 'tx'
  value: string
  children?: ReactNode
}) {
  const href = type === 'address' ? buildAddressExplorerUrl(CHAIN_ID, value) : buildTxExplorerUrl(CHAIN_ID, value)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mono inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover"
    >
      {children ?? shortAddress(value)}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-strong">
        <Inbox className="size-6 text-accent" aria-hidden />
      </div>
      <h3 className="display text-xl font-semibold">{title}</h3>
      <p className="max-w-md text-pretty text-sm text-muted">{body}</p>
      {action}
    </div>
  )
}

export function ErrorState({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-danger/15">
        <AlertTriangle className="size-6 text-danger" aria-hidden />
      </div>
      <h3 className="display text-xl font-semibold">{title}</h3>
      <p className="max-w-md text-pretty text-sm text-muted">{body}</p>
      {onRetry && (
        <button className="btn btn-ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string
  hint?: ReactNode
  error?: string
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-subtle">{hint}</p>
      )}
    </div>
  )
}

/**
 * Primary action that also handles the wallet states: connect, switch to Arc Testnet,
 * then the real label with a spinner while the wallet or the chain is busy.
 */
export function ActionButton({
  label,
  busyLabel,
  busy,
  disabled,
  onClick,
  variant = 'primary',
  className,
}: {
  label: string
  busyLabel?: string
  busy?: boolean
  disabled?: boolean
  onClick: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  className?: string
}) {
  const { isConnected, chainId } = useAccount()
  const { setOpen } = useModal()
  const { switchChain, isPending: switching } = useSwitchChain()
  const variantClass = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-ghost'

  if (!isConnected) {
    return (
      <button className={cx('btn btn-primary', className)} onClick={() => setOpen(true)}>
        Connect wallet
      </button>
    )
  }
  if (chainId !== CHAIN_ID) {
    return (
      <button
        className={cx('btn btn-primary', className)}
        disabled={switching}
        onClick={() => switchChain({ chainId: CHAIN_ID })}
      >
        {switching && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Switch to Arc Testnet
      </button>
    )
  }
  return (
    <button className={cx('btn', variantClass, className)} disabled={disabled || busy} onClick={onClick}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {busy ? (busyLabel ?? label) : label}
    </button>
  )
}
