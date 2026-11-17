import type { CreateForm, FormErrors } from '@/lib/createForm'
import { maxRaiseFor, parseDecimals, parsePrice, parseSupply, parseTokensForSale } from '@/lib/createForm'
import { formatUnitsExact } from '@/onchain-money'
import { formatUsd } from '@/lib/format'
import { Field } from '@/components/ui'

interface Props {
  form: CreateForm
  errors: FormErrors
  onChange: (patch: Partial<CreateForm>) => void
}

const money = (value: string) => value.replace(/[^0-9.]/g, '')

function UsdcInput({
  id,
  value,
  error,
  placeholder,
  onChange,
}: {
  id: string
  value: string
  error?: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <input
        id={id}
        className="field num pr-16"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        aria-invalid={!!error}
        onChange={(e) => onChange(money(e.target.value))}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-subtle">
        USDC
      </span>
    </div>
  )
}

export function SaleStep({ form, errors, onChange }: Props) {
  const decimals = parseDecimals(form)
  const supply = parseSupply(form)
  const forSale = parseTokensForSale(form)
  const price = parsePrice(form)
  const maxRaise =
    decimals !== undefined && forSale && forSale > 0n && price && price > 0n
      ? maxRaiseFor(forSale, price, decimals)
      : undefined

  const setPercent = (pct: bigint) => {
    if (supply === undefined || decimals === undefined) return
    onChange({ tokensForSale: formatUnitsExact((supply * pct) / 100n, decimals) })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Tokens for sale"
          htmlFor="forSale"
          error={errors.tokensForSale}
          hint={form.symbol ? `Whole ${form.symbol.toUpperCase()} tokens sent into the sale pool.` : 'Whole tokens sent into the sale pool.'}
        >
          <input
            id="forSale"
            className="field num"
            inputMode="decimal"
            placeholder="500000"
            value={form.tokensForSale}
            aria-invalid={!!errors.tokensForSale}
            onChange={(e) => onChange({ tokensForSale: money(e.target.value) })}
          />
          <div className="mt-1 flex gap-2">
            {[25n, 50n, 75n, 100n].map((pct) => (
              <button
                key={pct.toString()}
                type="button"
                className="btn btn-ghost !min-h-8 !px-3 !text-xs"
                disabled={supply === undefined}
                onClick={() => setPercent(pct)}
              >
                {pct.toString()}% of supply
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Sale rate (price per token)"
          htmlFor="price"
          error={errors.price}
          hint="USDC an investor pays for one whole token."
        >
          <UsdcInput id="price" placeholder="0.05" value={form.price} error={errors.price} onChange={(price) => onChange({ price })} />
        </Field>
      </div>

      {maxRaise !== undefined && (
        <div className="card-inner flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span className="text-muted">
            Tokens for sale can raise at most <strong className="num text-ink">{formatUsd(maxRaise)} USDC</strong>
          </span>
          <button className="btn btn-ghost !min-h-8 !px-3 !text-xs" onClick={() => onChange({ hardCap: formatUnitsExact(maxRaise, 6) })}>
            Use as hard cap
          </button>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Soft cap" htmlFor="softCap" error={errors.softCap} hint="Minimum to raise. Below this, everyone is refunded.">
          <UsdcInput id="softCap" placeholder="5000" value={form.softCap} error={errors.softCap} onChange={(softCap) => onChange({ softCap })} />
        </Field>
        <Field label="Hard cap" htmlFor="hardCap" error={errors.hardCap} hint="Maximum to raise. The sale closes when it is reached.">
          <UsdcInput id="hardCap" placeholder="25000" value={form.hardCap} error={errors.hardCap} onChange={(hardCap) => onChange({ hardCap })} />
        </Field>
        <Field label="Min buy per contribution" htmlFor="minBuy" error={errors.minBuy}>
          <UsdcInput id="minBuy" placeholder="10" value={form.minBuy} error={errors.minBuy} onChange={(minBuy) => onChange({ minBuy })} />
        </Field>
        <Field label="Max buy per wallet" htmlFor="maxBuy" error={errors.maxBuy}>
          <UsdcInput id="maxBuy" placeholder="1000" value={form.maxBuy} error={errors.maxBuy} onChange={(maxBuy) => onChange({ maxBuy })} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Start time" htmlFor="start" error={errors.start} hint="Your local time. At least 2 minutes from now.">
          <input
            id="start"
            type="datetime-local"
            className="field"
            value={form.start}
            aria-invalid={!!errors.start}
            onChange={(e) => onChange({ start: e.target.value })}
          />
        </Field>
        <Field label="End time" htmlFor="end" error={errors.end} hint="Sales run from 10 minutes up to 90 days.">
          <input
            id="end"
            type="datetime-local"
            className="field"
            value={form.end}
            aria-invalid={!!errors.end}
            onChange={(e) => onChange({ end: e.target.value })}
          />
        </Field>
      </div>
    </div>
  )
}
