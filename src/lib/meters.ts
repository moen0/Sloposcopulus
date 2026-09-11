import type { Meter, Tone } from '../types'

export function clampPct(n: number) {
  return Math.min(100, Math.max(0, n))
}

export function toneFor(used: number): Tone {
  if (used >= 85) return 'hot'
  if (used >= 55) return 'amber'
  return 'blue'
}

export function displayName(label: string) {
  if (/session/i.test(label)) return 'Session'
  if (/week/i.test(label)) return 'Weekly'
  if (/daily|day/i.test(label) && !/week/i.test(label)) return 'Daily'
  if (/month/i.test(label)) return 'Monthly'
  return label
}

export function isWeekly(label: string) {
  return /week/i.test(label)
}

export function windowHint(label: string) {
  const l = label.toLowerCase()
  if (l.includes('week')) return '7d'
  if (l.includes('session') || l.includes('5h')) return '5h'
  if (l.includes('daily') || l.includes('day')) return '24h'
  if (l.includes('month')) return '30d'
  return ''
}

export function windowHoursFor(label: string): number {
  const l = label.toLowerCase()
  if (l.includes('week')) return 7 * 24
  if (l.includes('month')) return 30 * 24
  if (l.includes('session') || l.includes('5h') || l.includes('hour')) return 5
  if (l.includes('daily') || l.includes('day')) return 24
  return 24
}

export function parseRemainingHours(reset: string): number | null {
  const d = reset.match(/(\d+)\s*d/i)
  const h = reset.match(/(\d+)\s*h/i)
  const m = reset.match(/(\d+)\s*m/i)
  const parts = [d, h, m].filter(Boolean).length
  if (parts === 0) return null
  if (parts === 1 && !m) return null
  return (d ? Number(d[1]) * 24 : 0) + (h ? Number(h[1]) : 0) + (m ? Number(m[1]) / 60 : 0)
}

export function countdownToResetAt(reset: string, now = Date.now()): number | undefined {
  const hours = parseRemainingHours(reset)
  if (hours == null) return undefined
  return now + hours * 3_600_000
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'now'
  const totalMin = Math.max(1, Math.floor(ms / 60_000))
  if (totalMin < 60) return `${totalMin}m`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d}d`
}

export function formatResetWhen(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const n = new Date(now)
  const sameDay = d.toDateString() === n.toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return time
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  if (ts - now < 7 * 86_400_000) return `${date} ${time}`
  return date
}

export function remainingMs(meter: Meter, now: number): number | null {
  if (meter.resetAt && meter.resetAt > 0) return meter.resetAt - now
  const hours = parseRemainingHours(meter.reset)
  if (hours == null) return null
  return hours * 3_600_000
}

export type Pace = {
  elapsed: number
  expected: number
  remainingHours: number
  windowHours: number
  day: number
  days: number
  status: 'over' | 'slightly-over' | 'on' | 'under' | 'limit'
  label: string
  forecast: string | null
  forecastWarn: boolean
}

export function paceFor(meter: Meter, now: number): Pace | null {
  const remainMs = remainingMs(meter, now)
  if (remainMs == null) return null
  const windowHours = windowHoursFor(meter.label)
  if (windowHours <= 0) return null
  const remainingHours = Math.max(0, remainMs / 3_600_000)
  const elapsedHours = Math.max(0, windowHours - remainingHours)
  const elapsed = clampPct((elapsedHours / windowHours) * 100)
  const used = clampPct(meter.used)
  const days = Math.max(1, Math.round(windowHours / 24))
  const day = Math.min(days, Math.max(1, Math.floor((elapsed / 100) * days) + 1))
  const delta = used - elapsed
  let status: Pace['status'] = 'on'
  let label = 'on pace'
  if (used >= 99.5) {
    status = 'limit'
    label = 'limit reached'
  } else if (delta > 14) {
    status = 'over'
    label = 'over pace'
  } else if (delta > 5) {
    status = 'slightly-over'
    label = 'slightly over'
  } else if (delta < -14) {
    status = 'under'
    label = 'under pace'
  }

  let forecast: string | null = null
  let forecastWarn = false
  if (used < 99.5 && elapsedHours >= 0.35 && status !== 'on') {
    const burn = used / elapsedHours
    const projected = used + burn * remainingHours
    if (projected >= 100 && burn > 0) {
      const hoursToLimit = (100 - used) / burn
      forecast = `limit in ${formatRemaining(hoursToLimit * 3_600_000)}`
      forecastWarn = true
    } else if (remainingHours > 0.05) {
      forecast = `lands at ${Math.round(clampPct(projected))}%`
    }
  }

  return {
    elapsed,
    expected: elapsed,
    remainingHours,
    windowHours,
    day,
    days,
    status,
    label,
    forecast,
    forecastWarn,
  }
}

export function alertLevel(used: number): number {
  if (used >= 100) return 100
  if (used >= 90) return 90
  if (used >= 75) return 75
  return 0
}

export function hydrateMeter(meter: Meter, now = Date.now()): Meter {
  const label = meter.label === 'Daily' ? 'Session' : meter.label
  return {
    ...meter,
    label,
    used: clampPct(meter.used),
    tone: toneFor(meter.used),
    resetAt: meter.resetAt && meter.resetAt > 0 ? meter.resetAt : countdownToResetAt(meter.reset, now),
  }
}
