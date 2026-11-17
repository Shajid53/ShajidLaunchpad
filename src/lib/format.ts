import { formatUnitsExact, formatUnitsFixed } from '@/onchain-money'
import { USDC_DECIMALS, PoolStatus } from '@/lib/contracts'

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

function group(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** "1234567.5" -> "1,234,567.5" */
export function groupNumber(value: string): string {
  const negative = value.startsWith('-')
  const [whole, fraction] = (negative ? value.slice(1) : value).split('.')
  return `${negative ? '-' : ''}${group(whole)}${fraction ? `.${fraction}` : ''}`
}

/** USDC amount with a fixed number of fraction digits, grouped. */
export function formatUsd(raw: bigint, fractionDigits = 2): string {
  return groupNumber(formatUnitsFixed(raw, USDC_DECIMALS, fractionDigits))
}

/** USDC price or amount, trimmed but never below 2 fraction digits. */
export function formatUsdPrecise(raw: bigint): string {
  const exact = formatUnitsExact(raw, USDC_DECIMALS)
  const [whole, fraction = ''] = exact.split('.')
  return groupNumber(`${whole}.${fraction.padEnd(2, '0')}`)
}

/** Token amount, grouped, with at most `maxFraction` fraction digits (truncated, not rounded). */
export function formatToken(raw: bigint, decimals: number, maxFraction = 4): string {
  const exact = formatUnitsExact(raw, decimals)
  const [whole, fraction = ''] = exact.split('.')
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, '')
  return groupNumber(trimmed ? `${whole}.${trimmed}` : whole)
}

/** Compact notation for dense cards, e.g. 12.5M. */
export function formatCompactToken(raw: bigint, decimals: number): string {
  const whole = Number(raw / 10n ** BigInt(decimals))
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(whole)
}

export function formatDateTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function splitDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}

/** Basis-point percentage (0..10000) of value / total, clamped. */
export function percentBps(value: bigint, total: bigint): number {
  if (total <= 0n) return 0
  const bps = (value * 10000n) / total
  return Number(bps > 10000n ? 10000n : bps)
}

export type LaunchState = 'upcoming' | 'live' | 'succeeded' | 'failed' | 'cancelled'

export interface StateInput {
  status: number
  startTime: number
  endTime: number
  totalRaised: bigint
  softCap: bigint
  hardCap: bigint
}

/** Derives the lifecycle from live chain time so it stays correct between refetches. */
export function deriveState(info: StateInput, nowSec: number): LaunchState {
  if (info.status === PoolStatus.Cancelled) return 'cancelled'
  if (nowSec < info.startTime) return 'upcoming'
  if (nowSec < info.endTime && info.totalRaised < info.hardCap) return 'live'
  return info.totalRaised >= info.softCap ? 'succeeded' : 'failed'
}

export const STATE_LABEL: Record<LaunchState, string> = {
  upcoming: 'Upcoming',
  live: 'Live',
  succeeded: 'Succeeded',
  failed: 'Soft cap missed',
  cancelled: 'Cancelled',
}

/** Tokens a cumulative contribution is entitled to, floor-rounded exactly like the pool. */
export function tokensFor(contribution: bigint, tokenDecimals: number, price: bigint): bigint {
  if (price <= 0n) return 0n
  return (contribution * 10n ** BigInt(tokenDecimals)) / price
}
