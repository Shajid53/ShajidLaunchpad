import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { CHAIN_ID, FACTORY_ADDRESS, USDC_ADDRESS, factoryAbi, poolAbi, tokenAbi } from '@/lib/contracts'
import { decodeMeta, safeHttpUrl, type LaunchMeta } from '@/lib/metadata'
import { toPoolInfo, type PoolInfo } from '@/hooks/useLaunches'

export interface UserPosition {
  contributed: bigint
  claimed: boolean
  refunded: boolean
  tokensOwed: bigint
  refundable: bigint
  usdcBalance: bigint
  usdcAllowance: bigint
}

export interface LaunchDetail {
  pool: Address
  token: Address
  creator: Address
  info: PoolInfo
  name: string
  symbol: string
  decimals: number
  totalSupply: bigint
  logoURL: string
  meta: LaunchMeta
  feeBps: number
  platformFee: bigint
  creatorProceeds: bigint
  proceedsWithdrawn: boolean
  feeWithdrawn: boolean
  successful: boolean
  treasury: Address
  remainingRoom: bigint
  position?: UserPosition
}

export const NOT_FOUND = 'LAUNCH_NOT_FOUND'

/** Everything the detail page needs for one pool, plus the connected wallet's position. */
export function useLaunch(pool: Address | undefined, user: Address | undefined) {
  const client = usePublicClient({ chainId: CHAIN_ID })
  return useQuery({
    queryKey: ['launch', pool, user],
    enabled: !!client && !!pool,
    refetchInterval: 8_000,
    retry: (count, error) => error.message !== NOT_FOUND && count < 2,
    queryFn: async (): Promise<LaunchDetail> => {
      if (!client || !pool) throw new Error(NOT_FOUND)

      const isPool = await client.readContract({
        address: FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: 'isFactoryPool',
        args: [pool],
      })
      if (!isPool) throw new Error(NOT_FOUND)

      const rawInfo = await client.readContract({ address: pool, abi: poolAbi, functionName: 'getInfo' })
      const info = toPoolInfo(rawInfo)
      const p = { address: pool, abi: poolAbi } as const
      const t = { address: info.token, abi: tokenAbi } as const

      const [
        name,
        symbol,
        decimals,
        totalSupply,
        metaRaw,
        logoRaw,
        feeBps,
        platformFee,
        creatorProceeds,
        proceedsWithdrawn,
        feeWithdrawn,
        successful,
        treasury,
        remainingRoom,
      ] = await Promise.all([
        client.readContract({ ...t, functionName: 'name' }),
        client.readContract({ ...t, functionName: 'symbol' }),
        client.readContract({ ...t, functionName: 'decimals' }),
        client.readContract({ ...t, functionName: 'totalSupply' }),
        client.readContract({ ...t, functionName: 'metadataURI' }),
        client.readContract({ ...t, functionName: 'logoURL' }),
        client.readContract({ ...p, functionName: 'feeBps' }),
        client.readContract({ ...p, functionName: 'platformFee' }),
        client.readContract({ ...p, functionName: 'creatorProceeds' }),
        client.readContract({ ...p, functionName: 'proceedsWithdrawn' }),
        client.readContract({ ...p, functionName: 'feeWithdrawn' }),
        client.readContract({ ...p, functionName: 'successful' }),
        client.readContract({ ...p, functionName: 'treasury' }),
        client.readContract({ ...p, functionName: 'remainingRoom' }),
      ])

      let position: UserPosition | undefined
      if (user) {
        const [contributed, claimed, refunded, tokensOwed, refundable, usdcBalance, usdcAllowance] = await Promise.all([
          client.readContract({ ...p, functionName: 'contributions', args: [user] }),
          client.readContract({ ...p, functionName: 'claimed', args: [user] }),
          client.readContract({ ...p, functionName: 'refunded', args: [user] }),
          client.readContract({ ...p, functionName: 'tokensOwed', args: [user] }),
          client.readContract({ ...p, functionName: 'refundable', args: [user] }),
          client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [user] }),
          client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [user, pool] }),
        ])
        position = { contributed, claimed, refunded, tokensOwed, refundable, usdcBalance, usdcAllowance }
      }

      return {
        pool,
        token: info.token,
        creator: info.creator,
        info,
        name,
        symbol,
        decimals,
        totalSupply,
        logoURL: safeHttpUrl(logoRaw),
        meta: decodeMeta(metaRaw),
        feeBps,
        platformFee,
        creatorProceeds,
        proceedsWithdrawn,
        feeWithdrawn,
        successful,
        treasury,
        remainingRoom,
        position,
      }
    },
  })
}
