import type { CSSProperties } from 'react'
import type { Meter } from '../types'
import {
  clampPct,
  displayName,
  formatRemaining,
  formatResetWhen,
  isWeekly,
  paceFor,
  remainingMs,
  toneFor,
  windowHint,
} from '../lib/meters'

function UsageBar({
  used,
  tone,
  pace,
  thick,
}: {
  used: number
  tone: ReturnType<typeof toneFor>
  pace?: number | null
  thick?: boolean
}) {
  const pct = clampPct(used)
  const style = {
    '--used': `${pct}%`,
    '--pace': pace != null ? `${clampPct(pace)}%` : undefined,
  } as CSSProperties

  return (
    <div
      className={`usage-bar ${tone}${thick ? ' thick' : ''}${pace != null ? ' has-pace' : ''}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={style}
    >
      <span className="usage-bar-fill" />
      {pace != null && <span className="usage-pace" title={`Expected ${Math.round(pace)}% by now`} />}
    </div>
  )
}

function WeekTrack({ elapsed, days }: { elapsed: number; days: number }) {
  const filled = (elapsed / 100) * days
  return (
    <div className="week-track" aria-hidden>
      {Array.from({ length: days }).map((_, i) => {
        const cover = Math.min(1, Math.max(0, filled - i))
        const current = cover > 0 && cover < 1
        return (
          <span
            key={i}
            className={`week-tick${cover >= 1 ? ' done' : ''}${current ? ' now' : ''}`}
            style={{ '--tick': `${cover * 100}%` } as CSSProperties}
          />
        )
      })}
    </div>
  )
}

export function MeterRow({ meter, now }: { meter: Meter; now: number }) {
  const used = clampPct(meter.used)
  const tone = toneFor(used)
  const name = displayName(meter.label)
  const hint = windowHint(meter.label)
  const weekly = isWeekly(meter.label)
  const pace = paceFor(meter, now)
  const remain = remainingMs(meter, now)
  const reset = remain == null ? (meter.reset !== '—' ? meter.reset : '') : formatRemaining(remain)
  const when = meter.resetAt ? formatResetWhen(meter.resetAt, now) : meter.at !== '—' ? meter.at : ''
  const resetFull = when ? `reset ${when}${reset && reset !== 'now' ? ` · ${reset}` : ''}` : reset ? `reset ${reset}` : ''

  const title = pace
    ? `${name} ${Math.round(used)}% used, expected ${Math.round(pace.expected)}% at this point`
    : `${name} ${Math.round(used)}%`

  if (weekly) {
    return (
      <article className={`meter weekly ${tone}`} title={title}>
        <div className="meter-id">
          <span className="meter-name">{name}</span>
          {hint && <span className="meter-hint">{hint}</span>}
          <span className="meter-percent">{Math.round(used)}%</span>
        </div>
        <UsageBar used={used} tone={tone} pace={pace?.expected ?? null} thick />
        {reset && <span className="meter-reset meter-reset-inline">{reset}</span>}
        {pace && <WeekTrack elapsed={pace.elapsed} days={Math.min(7, pace.days)} />}
        <div className="meter-meta">
          {pace && <span className={`pace-status ${pace.status}`}>{pace.label}</span>}
          {pace && pace.status !== 'on' && pace.status !== 'limit' && (
            <span className="meter-expected">expected {Math.round(pace.expected)}%</span>
          )}
          {pace?.forecast && (
            <span className={`meter-forecast${pace.forecastWarn ? ' warn' : ''}`}>{pace.forecast}</span>
          )}
          {pace && (
            <span className="meter-day">
              day {pace.day}/{pace.days}
            </span>
          )}
          {resetFull && <span className="meter-reset">{resetFull}</span>}
        </div>
      </article>
    )
  }

  return (
    <article className={`meter inline ${tone}`} title={title}>
      <div className="meter-id">
        <span className="meter-name">{name}</span>
        <span className="meter-percent">{Math.round(used)}%</span>
      </div>
      <UsageBar used={used} tone={tone} />
      {reset && <span className="meter-reset">{reset}</span>}
    </article>
  )
}
