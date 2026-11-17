import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { CHAIN_ID, FACTORY_ADDRESS, factoryAbi, poolAbi, tokenAbi } from '@/lib/contracts'
import { decodeMeta, safeHttpUrl, type LaunchMeta } from '@/lib/metadata'

export interface PoolInfo {
  token: Address
  creator: Address
  price: bigint
  tokensForSale: bigint
  softCap: bigint
  hardCap: bigint
  minContribution: bigint
  maxContribution: bigint
  startTime: number
  endTime: number
  totalRaised: bigint
  status: number
  finalized: boolean
  totalAllocated: bigint
}

export interface LaunchSummary {
  id: number
  pool: Address
  token: Address
  creator: Address
  createdAt: number
  info: PoolInfo
  name: string
  symbol: string
  decimals: number
  totalSupply: bigint
  logoURL: string
  meta: LaunchMeta
}

type RawInfo = {
  token: Address
  creator: Address
  price: bigint
  tokensForSale: bigint
  softCap: bigint
  hardCap: bigint
  minContribution: bigint
  maxContribution: bigint
  startTime: bigint
  endTime: bigint
  totalRaised: bigint
  status: number
  finalized: boolean
  totalAllocated: bigint
}

export const toPoolInfo = (raw: RawInfo): PoolInfo => ({
  ...raw,
  startTime: Number(raw.startTime),
  endTime: Number(raw.endTime),
})

type PublicClientLike = NonNullable<ReturnType<typeof usePublicClient>>

const PAGE = 100n

async function fetchLaunches(client: PublicClientLike): Promise<LaunchSummary[]> {
  const count = await client.readContract({ address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'launchCount' })
  if (count === 0n) return []

  const offset = count > PAGE ? count - PAGE : 0n
  const page = await client.readContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: 'getLaunches',
    args: [offset, PAGE],
  })

  const infos = await client.multicall({
    allowFailure: true,
    contracts: page.map((l) => ({ address: l.pool, abi: poolAbi, functionName: 'getInfo' }) as const),
  })

  const [names, symbols, decimals, supplies, metas, logos] = await Promise.all([
    client.multicall({
      allowFailure: true,
      contracts: page.map((l) => ({ address: l.token, abi: tokenAbi, functionName: 'name' }) as const),
    }),
    client.multicall({
      allowFailure: true,
      contracts: page.map((l) => ({ address: l.token, abi: tokenAbi, functionName: 'symbol' }) as const),
    }),
    client.multicall({
      allowFailure: true,
      contracts: page.map((l) => ({ address: l.token, abi: tokenAbi, functionName: 'decimals' }) as const),
    }),
    client.multicall({
      allowFailure: true,
      contracts: page.map((l) => ({ address: l.token, abi: tokenAbi, functionName: 'totalSupply' }) as const),
    }),
    client.multicall({
      allowFailure: true,
      contracts: page.map((l) => ({ address: l.token, abi: tokenAbi, functionName: 'metadataURI' }) as const),
    }),
    client.multicall({
      allowFailure: true,
      contracts: page.map((l) => ({ address: l.token, abi: tokenAbi, functionName: 'logoURL' }) as const),
    }),
  ])

  const out: LaunchSummary[] = []
  page.forEach((l, i) => {
    const info = infos[i]
    if (info.status !== 'success') return
    const name = names[i].status === 'success' ? String(names[i].result) : 'Unknown token'
    const symbol = symbols[i].status === 'success' ? String(symbols[i].result) : '???'
    const tokenDecimals = decimals[i].status === 'success' ? Number(decimals[i].result) : 18
    const supply = supplies[i].status === 'success' ? BigInt(supplies[i].result) : 0n
    const metaRaw = metas[i].status === 'success' ? String(metas[i].result) : ''
    const logoRaw = logos[i].status === 'success' ? String(logos[i].result) : ''
    out.push({
      id: Number(offset) + i,
      pool: l.pool,
      token: l.token,
      creator: l.creator,
      createdAt: Number(l.createdAt),
      info: toPoolInfo(info.result),
      name,
      symbol,
      decimals: tokenDecimals,
      totalSupply: supply,
      logoURL: safeHttpUrl(logoRaw),
      meta: decodeMeta(metaRaw),
    })
  })
  return out.reverse()
}

/** Newest-first list of launches, refreshed every 15 seconds. */
export function useLaunches() {
  const client = usePublicClient({ chainId: CHAIN_ID })
  return useQuery({
    queryKey: ['launches'],
    enabled: !!client,
    refetchInterval: 15_000,
    queryFn: () => fetchLaunches(client!),
  })
}
