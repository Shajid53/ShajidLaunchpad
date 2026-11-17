import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Abi, Address, Hash, TransactionReceipt } from 'viem'
import { CHAIN_ID } from '@/lib/contracts'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { isUserRejection, parseTxError } from '@/lib/errors'

export type TxPhase = 'idle' | 'wallet' | 'confirming' | 'success' | 'error'

export interface TxRequest {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
  /** Short label used in toasts, e.g. "Approve USDC". */
  label: string
}

/**
 * One write transaction with honest state: simulate, ask the wallet, wait for the real receipt.
 * Switches to Arc Testnet first when the wallet is on another chain.
 */
export function useTx() {
  const { address: account, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()

  const [phase, setPhase] = useState<TxPhase>('idle')
  const [hash, setHash] = useState<Hash | undefined>()
  const [error, setError] = useState<string | undefined>()

  const reset = useCallback(() => {
    setPhase('idle')
    setHash(undefined)
    setError(undefined)
  }, [])

  const run = useCallback(
    async (req: TxRequest): Promise<TransactionReceipt | undefined> => {
      if (!account || !client) {
        setError('Connect your wallet to continue.')
        setPhase('error')
        return undefined
      }
      const toastId = toast.loading(`${req.label}: confirm in your wallet`)
      setError(undefined)
      setHash(undefined)
      setPhase('wallet')
      try {
        if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })

        // Simulating first surfaces the real revert reason before the wallet opens.
        await client.simulateContract({
          account,
          address: req.address,
          abi: req.abi,
          functionName: req.functionName,
          args: req.args,
        })

        const txHash = await writeContractAsync({
          address: req.address,
          abi: req.abi,
          functionName: req.functionName,
          args: req.args,
          chainId: CHAIN_ID,
        })
        setHash(txHash)
        setPhase('confirming')
        toast.loading(`${req.label}: waiting for confirmation`, { id: toastId })

        const receipt = await client.waitForTransactionReceipt({ hash: txHash })
        if (receipt.status !== 'success') throw new Error('reverted')

        setPhase('success')
        toast.success(`${req.label}: confirmed`, {
          id: toastId,
          action: {
            label: 'View',
            onClick: () => window.open(buildTxExplorerUrl(CHAIN_ID, txHash), '_blank', 'noopener,noreferrer'),
          },
        })
        // Everything onchain-derived on screen may have changed.
        await queryClient.invalidateQueries()
        return receipt
      } catch (e) {
        if (isUserRejection(e)) {
          toast.dismiss(toastId)
          setPhase('idle')
          return undefined
        }
        const message = parseTxError(e)
        setError(message)
        setPhase('error')
        toast.error(`${req.label} failed`, { id: toastId, description: message })
        return undefined
      }
    },
    [account, chainId, client, queryClient, switchChainAsync, writeContractAsync],
  )

  return { run, phase, hash, error, reset, busy: phase === 'wallet' || phase === 'confirming' }
}
