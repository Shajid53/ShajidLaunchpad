import { parseUnitsExact, parseUsdc } from '@/onchain-money'
import { CONTRACT_LIMITS } from '@/lib/contracts'
import { byteLength, encodeMeta, metaBytes, META_BUDGET, normalizeTwitter, safeHttpUrl } from '@/lib/metadata'

export interface CreateForm {
  mode: 'new' | 'existing'
  name: string
  symbol: string
  decimals: string
  supply: string
  logoURL: string
  description: string
  website: string
  twitter: string
  tokensForSale: string
  price: string
  softCap: string
  hardCap: string
  minBuy: string
  maxBuy: string
  start: string
  end: string
}

export type FormErrors = Partial<Record<keyof CreateForm | 'meta', string>>

/** Formats unix seconds as the value of an <input type="datetime-local"> in local time. */
export function toLocalInput(seconds: number): string {
  const d = new Date(seconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): number {
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0
}

export function defaultForm(nowSec: number): CreateForm {
  const start = Math.ceil((nowSec + 15 * 60) / 60) * 60
  return {
    mode: 'new',
    name: '',
    symbol: '',
    decimals: '18',
    supply: '',
    logoURL: '',
    description: '',
    website: '',
    twitter: '',
    tokensForSale: '',
    price: '',
    softCap: '',
    hardCap: '',
    minBuy: '',
    maxBuy: '',
    start: toLocalInput(start),
    end: toLocalInput(start + 7 * 24 * 3600),
  }
}

function tryParse(fn: () => bigint): bigint | undefined {
  try {
    return fn()
  } catch {
    return undefined
  }
}

const positive = (v: bigint | undefined): v is bigint => v !== undefined && v > 0n

export const parseDecimals = (f: CreateForm): number | undefined => {
  if (!/^\d{1,2}$/.test(f.decimals.trim())) return undefined
  const n = Number(f.decimals)
  return n >= 0 && n <= 18 ? n : undefined
}

export const parseSupply = (f: CreateForm): bigint | undefined => {
  const d = parseDecimals(f)
  return d === undefined ? undefined : tryParse(() => parseUnitsExact(f.supply, d))
}

export const parseTokensForSale = (f: CreateForm): bigint | undefined => {
  const d = parseDecimals(f)
  return d === undefined ? undefined : tryParse(() => parseUnitsExact(f.tokensForSale, d))
}

export const parsePrice = (f: CreateForm) => tryParse(() => parseUsdc(f.price))
const usdc = (v: string) => tryParse(() => parseUsdc(v))

/** Highest hard cap the escrowed tokens can cover (floor, matches the pool's coverage check). */
export function maxRaiseFor(tokensForSale: bigint, price: bigint, decimals: number): bigint {
  return (tokensForSale * price) / 10n ** BigInt(decimals)
}

export function validateToken(f: CreateForm): FormErrors {
  const e: FormErrors = {}
  const name = f.name.trim()
  const symbol = f.symbol.trim()
  if (!name) e.name = 'Enter a token name.'
  else if (byteLength(name) > CONTRACT_LIMITS.nameBytes) e.name = `Keep the name under ${CONTRACT_LIMITS.nameBytes} bytes.`
  if (!symbol) e.symbol = 'Enter a ticker.'
  else if (!/^[A-Za-z0-9]+$/.test(symbol)) e.symbol = 'Use letters and numbers only.'
  else if (byteLength(symbol) > CONTRACT_LIMITS.symbolBytes) e.symbol = `Keep the ticker under ${CONTRACT_LIMITS.symbolBytes} characters.`

  if (parseDecimals(f) === undefined) e.decimals = 'Decimals must be a whole number from 0 to 18.'
  const supply = parseSupply(f)
  if (!f.supply.trim()) e.supply = 'Enter the total supply.'
  else if (!positive(supply)) e.supply = 'Supply must be a positive number within the token decimals.'

  if (f.logoURL.trim()) {
    if (!safeHttpUrl(f.logoURL)) e.logoURL = 'Use a full http(s) image link.'
    else if (byteLength(f.logoURL.trim()) > CONTRACT_LIMITS.uriBytes) e.logoURL = 'Logo link is too long (max 256 bytes).'
  }
  if (f.website.trim() && !safeHttpUrl(f.website)) e.website = 'Use a full http(s) link.'
  if (f.twitter.trim() && !normalizeTwitter(f.twitter)) e.twitter = 'Use a handle like @arc or an x.com link.'

  const used = metaBytes(f)
  if (used > META_BUDGET) e.meta = `Description and links use ${used} of ${META_BUDGET} bytes. Shorten them.`
  return e
}

export function validateSale(f: CreateForm, nowSec: number): FormErrors {
  const e: FormErrors = {}
  const decimals = parseDecimals(f)
  const supply = parseSupply(f)
  const forSale = parseTokensForSale(f)
  const price = parsePrice(f)
  const softCap = usdc(f.softCap)
  const hardCap = usdc(f.hardCap)
  const min = usdc(f.minBuy)
  const max = usdc(f.maxBuy)

  if (!positive(forSale)) e.tokensForSale = 'Enter how many tokens are for sale.'
  else if (supply !== undefined && forSale > supply) e.tokensForSale = 'Cannot exceed the total supply.'

  if (!positive(price)) e.price = 'Enter a price in USDC (up to 6 decimals).'

  if (!positive(softCap)) e.softCap = 'Enter a soft cap above zero.'
  if (!positive(hardCap)) e.hardCap = 'Enter a hard cap above zero.'
  else if (positive(softCap) && softCap > hardCap) e.softCap = 'Soft cap cannot exceed the hard cap.'

  if (positive(forSale) && positive(price) && positive(hardCap) && decimals !== undefined) {
    // Same inequality the pool enforces: floor(hardCap * 10^decimals / price) <= tokensForSale.
    if ((hardCap * 10n ** BigInt(decimals)) / price > forSale) {
      e.hardCap = 'Tokens for sale do not cover this hard cap at this price. Lower the hard cap or add tokens.'
    }
  }

  if (!positive(min)) e.minBuy = 'Enter a minimum buy above zero.'
  if (!positive(max)) e.maxBuy = 'Enter a maximum buy above zero.'
  else if (positive(min) && min > max) e.minBuy = 'Minimum buy cannot exceed the maximum.'
  else if (positive(hardCap) && max > hardCap) e.maxBuy = 'Maximum buy cannot exceed the hard cap.'
  if (positive(min) && positive(price) && decimals !== undefined && (min * 10n ** BigInt(decimals)) / price === 0n) {
    e.minBuy = 'Minimum buy is too small to receive any tokens at this price.'
  }

  const start = fromLocalInput(f.start)
  const end = fromLocalInput(f.end)
  if (!start) e.start = 'Pick a start time.'
  else if (start < nowSec + CONTRACT_LIMITS.minStartLeadSec) {
    e.start = 'Start at least 2 minutes from now so the transaction can land before it.'
  }
  if (!end) e.end = 'Pick an end time.'
  else if (start && end <= start) e.end = 'End must be after the start.'
  else if (start && end - start < CONTRACT_LIMITS.minDurationSec) e.end = 'A sale must run for at least 10 minutes.'
  else if (start && end - start > CONTRACT_LIMITS.maxDurationSec) e.end = 'A sale can run for at most 90 days.'
  return e
}

export interface LaunchParams {
  t: {
    name: string
    symbol: string
    decimals: number
    totalSupply: bigint
    metadataURI: string
    logoURL: string
  }
  s: {
    price: bigint
    tokensForSale: bigint
    softCap: bigint
    hardCap: bigint
    minContribution: bigint
    maxContribution: bigint
    startTime: bigint
    endTime: bigint
  }
}

/** Builds the exact createLaunch arguments, or undefined when anything is invalid. */
export function buildLaunchParams(f: CreateForm, nowSec: number): LaunchParams | undefined {
  if (Object.keys(validateToken(f)).length || Object.keys(validateSale(f, nowSec)).length) return undefined
  const decimals = parseDecimals(f)
  const totalSupply = parseSupply(f)
  const tokensForSale = parseTokensForSale(f)
  const price = parsePrice(f)
  const softCap = usdc(f.softCap)
  const hardCap = usdc(f.hardCap)
  const min = usdc(f.minBuy)
  const max = usdc(f.maxBuy)
  if (
    decimals === undefined ||
    !positive(totalSupply) ||
    !positive(tokensForSale) ||
    !positive(price) ||
    !positive(softCap) ||
    !positive(hardCap) ||
    !positive(min) ||
    !positive(max)
  ) {
    return undefined
  }
  return {
    t: {
      name: f.name.trim(),
      symbol: f.symbol.trim(),
      decimals,
      totalSupply,
      metadataURI: encodeMeta(f),
      logoURL: safeHttpUrl(f.logoURL),
    },
    s: {
      price,
      tokensForSale,
      softCap,
      hardCap,
      minContribution: min,
      maxContribution: max,
      startTime: BigInt(fromLocalInput(f.start)),
      endTime: BigInt(fromLocalInput(f.end)),
    },
  }
}
