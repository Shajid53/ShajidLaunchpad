import { Link, NavLink } from 'react-router-dom'
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import { Droplets, Rocket, Wallet } from 'lucide-react'
import { CHAIN, CHAIN_ID, FAUCET_URL } from '@/lib/contracts'
import { formatUsd, shortAddress } from '@/lib/format'
import { useUsdcBalance } from '@/hooks/useUsdc'
import { Skeleton, cx } from '@/components/ui'

function NetworkPill() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (isConnected && chainId !== CHAIN_ID) {
    return (
      <button
        className="btn btn-danger !min-h-9 !px-3 !text-xs"
        disabled={isPending}
        onClick={() => switchChain({ chainId: CHAIN_ID })}
      >
        Wrong network. Switch to {CHAIN.name}
      </button>
    )
  }
  return (
    <span
      className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 sm:inline-flex"
      title={isConnected ? 'Connected to Arc Testnet' : 'Target network'}
    >
      <span className={cx('size-2 rounded-full', isConnected ? 'bg-success' : 'bg-subtle')} aria-hidden />
      {CHAIN.name}
    </span>
  )
}

function BalanceChip() {
  const { isConnected } = useAccount()
  const { data, isLoading, isError } = useUsdcBalance()
  if (!isConnected) return null
  return (
    <span
      className="num inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-semibold"
      title="USDC balance (also used for gas on Arc)"
    >
      <TokenUSDC variant="branded" size={18} />
      {isLoading ? (
        <Skeleton className="h-4 w-14" />
      ) : isError || data === undefined ? (
        <span className="text-subtle">--</span>
      ) : (
        <>
          {formatUsd(data)} <span className="hidden font-normal text-subtle sm:inline">USDC</span>
        </>
      )}
    </span>
  )
}

export function Navbar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-surface-strong text-ink' : 'text-muted hover:text-ink',
    )

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="display flex items-center gap-2 text-lg font-bold">
          <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-canvas">
            <Rocket className="size-4" aria-hidden />
          </span>
          Arc Launchpad
        </Link>

        <nav className="order-last flex w-full gap-1 sm:order-none sm:w-auto" aria-label="Primary">
          <NavLink to="/" end className={linkClass}>
            Explore
          </NavLink>
          <NavLink to="/create" className={linkClass}>
            Create launch
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <NetworkPill />
          <BalanceChip />
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost !min-h-9 !px-3 !text-xs"
            title="Get test USDC for Arc Testnet"
          >
            <Droplets className="size-4" aria-hidden />
            <span className="hidden sm:inline">Get test USDC</span>
          </a>
          <ConnectKitButton.Custom>
            {({ isConnected, show, address, isConnecting }) => (
              <button className="btn btn-primary !min-h-9 !px-3 !text-xs" onClick={show} disabled={isConnecting}>
                <Wallet className="size-4" aria-hidden />
                {isConnected && address ? <span className="mono">{shortAddress(address)}</span> : 'Connect wallet'}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </div>
    </header>
  )
}
