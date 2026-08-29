import { useMemo } from 'react'
import type { HistoryPoint } from '../types'

type Props = {
  history: HistoryPoint[]
  color: string
}

function toPath(values: number[], w: number, h: number): string {
  if (values.length === 0) return ''
  const step = w / Math.max(values.length - 1, 1)
  return values
    .map((v, i) => `${(i * step).toFixed(2)},${(h - v * (h - 8) - 4).toFixed(2)}`)
    .join(' ')
}

export function SpendChart({ history, color }: Props) {
  const line = useMemo(() => {
    if (history.length < 2) return null
    const spend = history.map((p) => p.spend)
    const max = Math.max(...spend, 1)
    const W = 1000
    const H = 200
    return {
      W,
      H,
      path: toPath(spend.map((s) => s / max), W, H),
      first: history[0],
      last: history[history.length - 1],
    }
  }, [history])

  if (!line) {
    return <div className="chart chart-empty">History appears after the next refresh</div>
  }

  const area = `0,${line.H} ${line.path} ${line.W},${line.H}`

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${line.W} ${line.H}`} preserveAspectRatio="none" role="img" aria-label="Spend over time">
        <polygon points={area} fill={color} opacity={0.1} />
        <polyline points={line.path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chart-axis">
        <span>{dayLabel(line.first.t)}</span>
        <span>{dayLabel(line.last.t)}</span>
      </div>
    </div>
  )
}

function dayLabel(t: number) {
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function formatTokens(t: number): string {
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`
  if (t >= 1_000) return `${(t / 1_000).toFixed(1)}k`
  return `${t}`
}