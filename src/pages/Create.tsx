import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useChainNow } from '@/hooks/useChainNow'
import {
  buildLaunchParams,
  defaultForm,
  validateSale,
  validateToken,
  type CreateForm,
  type FormErrors,
} from '@/lib/createForm'
import { TokenStep } from '@/components/create/TokenStep'
import { SaleStep } from '@/components/create/SaleStep'
import { ReviewStep } from '@/components/create/ReviewStep'
import { cx } from '@/components/ui'

const STEPS = ['Create token', 'Configure sale', 'Review and deploy'] as const

export default function Create() {
  const now = useChainNow()
  const [form, setForm] = useState<CreateForm>(() => defaultForm(Math.floor(Date.now() / 1000)))
  const [step, setStep] = useState(0)
  const [showErrors, setShowErrors] = useState(false)

  const errors: FormErrors = useMemo(() => {
    if (step === 0) return validateToken(form)
    if (step === 1) return validateSale(form, now)
    return {}
  }, [form, step, now])
  const visibleErrors: FormErrors = showErrors ? errors : {}

  const params = useMemo(() => buildLaunchParams(form, now), [form, now])

  const patch = (next: Partial<CreateForm>) => setForm((prev) => ({ ...prev, ...next }))

  const goNext = () => {
    if (form.mode === 'existing') return
    if (Object.keys(errors).length > 0) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    setStep((s) => Math.min(2, s + 1))
  }

  const goBack = () => {
    setShowErrors(false)
    setStep((s) => Math.max(0, s - 1))
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="display text-balance text-3xl font-bold sm:text-4xl">Create a launch</h1>
      <p className="mt-2 text-pretty text-muted">
        Deploy your token and open a fixed-price USDC sale in one transaction.
      </p>

      <ol className="mt-8 grid grid-cols-3 gap-2" aria-label="Progress">
        {STEPS.map((label, index) => {
          const done = index < step
          const active = index === step
          return (
            <li key={label} className="flex flex-col gap-2" aria-current={active ? 'step' : undefined}>
              <div className={cx('h-1 rounded-full', done || active ? 'bg-accent' : 'bg-white/10')} />
              <div className="flex items-center gap-2 text-xs font-semibold sm:text-sm">
                <span
                  className={cx(
                    'num flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]',
                    done ? 'bg-success text-canvas' : active ? 'bg-accent text-canvas' : 'bg-white/10 text-subtle',
                  )}
                >
                  {done ? <Check className="size-3" aria-hidden /> : index + 1}
                </span>
                <span className={active ? 'text-ink' : 'text-subtle'}>{label}</span>
              </div>
            </li>
          )
        })}
      </ol>

      <section className="card mt-6 p-5 sm:p-7">
        {step === 0 && <TokenStep form={form} errors={visibleErrors} onChange={patch} />}
        {step === 1 && <SaleStep form={form} errors={visibleErrors} onChange={patch} />}
        {step === 2 &&
          (params ? (
            <ReviewStep params={params} now={now} />
          ) : (
            <div className="flex flex-col items-start gap-3" role="alert">
              <p className="text-sm text-danger">
                Some details are no longer valid, usually because the start time is too close. Go back and review the
                sale settings.
              </p>
              <button className="btn btn-ghost" onClick={goBack}>
                <ArrowLeft className="size-4" aria-hidden /> Back to sale settings
              </button>
            </div>
          ))}

        {step < 2 && (
          <div className="mt-8 flex items-center justify-between gap-3">
            <button className="btn btn-ghost" onClick={goBack} disabled={step === 0}>
              <ArrowLeft className="size-4" aria-hidden /> Back
            </button>
            <button className="btn btn-primary" onClick={goNext} disabled={form.mode === 'existing'}>
              {step === 0 ? 'Configure sale' : 'Review'} <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        )}
        {step === 2 && params && (
          <div className="mt-6">
            <button className="btn btn-ghost" onClick={goBack}>
              <ArrowLeft className="size-4" aria-hidden /> Edit sale settings
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
