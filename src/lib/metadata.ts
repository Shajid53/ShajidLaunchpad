import { CONTRACT_LIMITS } from '@/lib/contracts'

/**
 * The token contract stores one free-form string (max 256 bytes) as metadataURI.
 * We keep a compact JSON object in it: {"d": description, "w": website, "t": twitter handle}.
 */
export interface LaunchMeta {
  description: string
  website: string
  twitter: string
}

const encoder = new TextEncoder()

export const byteLength = (value: string) => encoder.encode(value).length

/** Returns the normalized URL only for http(s) links, otherwise an empty string. */
export function safeHttpUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''
  } catch {
    return ''
  }
}

/** Accepts @handle, handle, or an x.com / twitter.com URL. Returns the bare handle or ''. */
export function normalizeTwitter(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const fromUrl = /^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/i.exec(trimmed)
  const handle = (fromUrl ? fromUrl[1] : trimmed.replace(/^@/, '')).trim()
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : ''
}

export function encodeMeta(meta: LaunchMeta): string {
  const payload: Record<string, string> = {}
  const description = meta.description.trim()
  const website = safeHttpUrl(meta.website)
  const twitter = normalizeTwitter(meta.twitter)
  if (description) payload.d = description
  if (website) payload.w = website
  if (twitter) payload.t = twitter
  return Object.keys(payload).length ? JSON.stringify(payload) : ''
}

export function metaBytes(meta: LaunchMeta): number {
  return byteLength(encodeMeta(meta))
}

export const META_BUDGET = CONTRACT_LIMITS.uriBytes

export function decodeMeta(raw: string): LaunchMeta {
  const empty: LaunchMeta = { description: '', website: '', twitter: '' }
  if (!raw) return empty
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...empty, description: raw.slice(0, 280) }
    const obj = parsed as Record<string, unknown>
    return {
      description: typeof obj.d === 'string' ? obj.d : '',
      website: typeof obj.w === 'string' ? safeHttpUrl(obj.w) : '',
      twitter: typeof obj.t === 'string' ? normalizeTwitter(obj.t) : '',
    }
  } catch {
    // Not JSON: treat as a plain description written by another client.
    return { ...empty, description: raw.slice(0, 280) }
  }
}
