import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/contracts'

/** USDC balance through the ERC-20 view (6 decimals). This is the same pool that pays gas on Arc. */
export function useUsdcBalance(address?: Address) {
  const { address: connected } = useAccount()
  const owner = address ?? connected
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: owner ? [owner] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!owner, refetchInterval: 10_000 },
  })
}

export function useUsdcAllowance(spender: Address) {
  const { address } = useAccount()
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, spender] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 10_000 },
  })
}
