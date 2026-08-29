import type { Meter, Tone } from '../types'

const CELLS = 28

export function SegmentedBar({ value, tone }: { value: number; tone: Tone }) {
  const filled = Math.round(Math.min(100, Math.max(0, value)) / 100 * CELLS)
  return (
    <div className={`segbar ${tone}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: CELLS }).map((_, i) => (
        <span key={i} className={i < filled ? 'on' : ''} />
      ))}
    </div>
  )
}

export function MeterRow({ meter }: { meter: Meter }) {
  return (
    <div className="meter-row">
      <SegmentedBar value={meter.used} tone={meter.tone} />
      <div className="meter-percent">{Math.round(meter.used)}%</div>
    </div>
  )
}