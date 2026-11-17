import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Sparkles } from 'lucide-react'
import { useLaunches } from '@/hooks/useLaunches'
import { useChainNow } from '@/hooks/useChainNow'
import { deriveState, type LaunchState } from '@/lib/format'
import { LaunchCard, LaunchCardSkeleton } from '@/components/LaunchCard'
import { EmptyState, ErrorState, cx } from '@/components/ui'

type Filter = 'all' | 'live' | 'upcoming' | 'ended'

const TABS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'ended', label: 'Ended' },
]

const matches = (filter: Filter, state: LaunchState) =>
  filter === 'all' ||
  (filter === 'live' && state === 'live') ||
  (filter === 'upcoming' && state === 'upcoming') ||
  (filter === 'ended' && (state === 'succeeded' || state === 'failed' || state === 'cancelled'))

export default function Explore() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('filter')
  const filter: Filter = TABS.some((t) => t.id === raw) ? (raw as Filter) : 'all'

  const { data, isLoading, isError, refetch } = useLaunches()
  const now = useChainNow()

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, live: 0, upcoming: 0, ended: 0 }
    for (const l of data ?? []) {
      const state = deriveState(l.info, now)
      c.all += 1
      for (const tab of TABS) if (tab.id !== 'all' && matches(tab.id, state)) c[tab.id] += 1
    }
    return c
  }, [data, now])

  const visible = useMemo(
    () => (data ?? []).filter((l) => matches(filter, deriveState(l.info, now))),
    [data, filter, now],
  )

  const setFilter = (next: Filter) => {
    const nextParams = new URLSearchParams(params)
    if (next === 'all') nextParams.delete('filter')
    else nextParams.set('filter', next)
    setParams(nextParams, { replace: true })
  }

  return (
    <>
      <section className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label mb-2 flex items-center gap-1.5">
            <Sparkles className="size-3.5" aria-hidden /> Arc Testnet
          </p>
          <h1 className="display text-balance text-4xl font-bold sm:text-5xl">Fund the next token on Arc</h1>
          <p className="mt-3 max-w-xl text-pretty text-muted">
            Contribute USDC to fixed-price token sales. If a sale reaches its soft cap you claim tokens, otherwise you
            get every USDC back.
          </p>
        </div>
        <Link to="/create" className="btn btn-primary self-start sm:self-auto">
          <Plus className="size-4" aria-hidden /> Create launch
        </Link>
      </section>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter launches">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={filter === tab.id}
            onClick={() => setFilter(tab.id)}
            className={cx(
              'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors',
              filter === tab.id
                ? 'border-accent bg-accent text-canvas'
                : 'border-line bg-surface text-muted hover:text-ink',
            )}
          >
            {tab.label}
            {!isLoading && !isError && (
              <span
                className={cx(
                  'num rounded-full px-1.5 text-xs',
                  filter === tab.id ? 'bg-canvas/15' : 'bg-white/10 text-subtle',
                )}
              >
                {counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <LaunchCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          title="Could not load launches"
          body="The Arc Testnet RPC did not respond. Check your connection and try again."
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !isError && visible.length === 0 && (
        <EmptyState
          title={(data?.length ?? 0) === 0 ? 'No launches yet' : `No ${filter} launches`}
          body={
            (data?.length ?? 0) === 0
              ? 'Nothing has been launched through the factory yet. Be the first to create a token and open a sale.'
              : 'Try another filter to see the rest of the launches.'
          }
          action={
            (data?.length ?? 0) === 0 ? (
              <Link to="/create" className="btn btn-primary">
                <Plus className="size-4" aria-hidden /> Create the first launch
              </Link>
            ) : (
              <button className="btn btn-ghost" onClick={() => setFilter('all')}>
                Show all launches
              </button>
            )
          }
        />
      )}

      {!isLoading && !isError && visible.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((launch) => (
            <LaunchCard key={launch.pool} launch={launch} now={now} />
          ))}
        </div>
      )}
    </>
  )
}
