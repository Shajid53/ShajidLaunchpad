import { Info } from 'lucide-react'
import type { CreateForm, FormErrors } from '@/lib/createForm'
import { META_BUDGET, metaBytes } from '@/lib/metadata'
import { Field, cx } from '@/components/ui'

interface Props {
  form: CreateForm
  errors: FormErrors
  onChange: (patch: Partial<CreateForm>) => void
}

export function TokenStep({ form, errors, onChange }: Props) {
  const used = metaBytes(form)
  const isNew = form.mode === 'new'

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1" role="tablist" aria-label="Token source">
        {(
          [
            ['new', 'Create a new token'],
            ['existing', 'Use an existing ERC-20'],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            role="tab"
            aria-selected={form.mode === mode}
            onClick={() => onChange({ mode })}
            className={cx(
              'min-h-11 rounded-xl px-3 text-sm font-semibold transition-colors',
              form.mode === mode ? 'bg-accent text-canvas' : 'text-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {!isNew && (
        <div className="card-inner flex gap-3 p-4 text-sm text-muted" role="status">
          <Info className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
          <p className="text-pretty">
            The deployed factory always mints a brand new token for each launch, so selling an existing ERC-20 is not
            available yet. Switch back to <strong className="text-ink">Create a new token</strong> to continue.
          </p>
        </div>
      )}

      <fieldset disabled={!isNew} className="flex flex-col gap-5 disabled:opacity-40">
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <Field label="Token name" htmlFor="name" error={errors.name}>
            <input
              id="name"
              className="field"
              placeholder="Arc Rocket"
              value={form.name}
              maxLength={64}
              aria-invalid={!!errors.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </Field>
          <Field label="Ticker" htmlFor="symbol" error={errors.symbol}>
            <input
              id="symbol"
              className="field mono uppercase"
              placeholder="ROCKET"
              value={form.symbol}
              maxLength={16}
              aria-invalid={!!errors.symbol}
              onChange={(e) => onChange({ symbol: e.target.value.toUpperCase() })}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <Field
            label="Total supply"
            htmlFor="supply"
            error={errors.supply}
            hint="Whole tokens. The entire supply is minted once and cannot be increased."
          >
            <input
              id="supply"
              className="field num"
              inputMode="decimal"
              placeholder="1000000"
              value={form.supply}
              aria-invalid={!!errors.supply}
              onChange={(e) => onChange({ supply: e.target.value.replace(/[^0-9.]/g, '') })}
            />
          </Field>
          <Field label="Decimals" htmlFor="decimals" error={errors.decimals} hint="0 to 18. Most tokens use 18.">
            <input
              id="decimals"
              className="field num"
              inputMode="numeric"
              value={form.decimals}
              aria-invalid={!!errors.decimals}
              onChange={(e) => onChange({ decimals: e.target.value.replace(/\D/g, '').slice(0, 2) })}
            />
          </Field>
        </div>

        <Field
          label="Logo URL (optional)"
          htmlFor="logo"
          error={errors.logoURL}
          hint="A direct https link to a square image."
        >
          <input
            id="logo"
            className="field"
            placeholder="https://example.com/logo.png"
            value={form.logoURL}
            aria-invalid={!!errors.logoURL}
            onChange={(e) => onChange({ logoURL: e.target.value })}
          />
        </Field>

        <Field label="Short description (optional)" htmlFor="description" error={errors.meta}>
          <textarea
            id="description"
            className="field min-h-24 resize-y"
            placeholder="What is this project about?"
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Website (optional)" htmlFor="website" error={errors.website}>
            <input
              id="website"
              className="field"
              placeholder="https://example.com"
              value={form.website}
              aria-invalid={!!errors.website}
              onChange={(e) => onChange({ website: e.target.value })}
            />
          </Field>
          <Field label="X / Twitter (optional)" htmlFor="twitter" error={errors.twitter}>
            <input
              id="twitter"
              className="field"
              placeholder="@arcnetwork"
              value={form.twitter}
              aria-invalid={!!errors.twitter}
              onChange={(e) => onChange({ twitter: e.target.value })}
            />
          </Field>
        </div>

        <p className={cx('num text-xs', used > META_BUDGET ? 'text-danger' : 'text-subtle')}>
          Description and links are stored onchain and share a {META_BUDGET}-byte budget: {used} used.
        </p>
      </fieldset>
    </div>
  )
}
