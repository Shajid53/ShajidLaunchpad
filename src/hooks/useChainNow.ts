import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { CHAIN_ID } from '@/lib/contracts'

let tick = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    timer = setInterval(() => {
      tick = Date.now()
      listeners.forEach((l) => l())
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const getSnapshot = () => tick

/**
 * Current time in unix seconds, aligned to the chain's latest block timestamp and
 * refreshed every second. One shared timer serves every component.
 */
export function useChainNow(): number {
  const client = usePublicClient({ chainId: CHAIN_ID })
  const { data: offsetMs } = useQuery({
    queryKey: ['chain-time-offset'],
    enabled: !!client,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const block = await client!.getBlock()
      return Number(block.timestamp) * 1000 - Date.now()
    },
  })
  const local = useSyncExternalStore(subscribe, getSnapshot)
  return Math.floor((local + (offsetMs ?? 0)) / 1000)
}
