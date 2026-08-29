import type { Agent, ConnectorSource, HistoryPoint, Meter, TokenCount } from '../types'

export const STORAGE_KEYS = {
  agents: 'slopuse.agents.v1',
  settings: 'slopuse.settings.v1',
} as const

export const DEFAULT_AGENT_KEYS: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'ChatGPT',
  copilot: 'GitHub Copilot',
  gemini: 'Gemini',
}

export function providerId(name: string): string {
  for (const [id, label] of Object.entries(DEFAULT_AGENT_KEYS)) {
    if (label.toLowerCase() === name.toLowerCase()) return id
  }
  return 'custom'
}

const emptyTokens: TokenCount = { input: 0, output: 0, total: 0 }

function seedHistory(spendScale: number, tokenScale: number, days = 14): HistoryPoint[] {
  const out: HistoryPoint[] = []
  const now = Date.now()
  for (let i = days - 1; i >= 0; i--) {
    const jitter = Math.round(Math.random() * 0.35 * 100) / 100
    const spend = ((i + 1) / days) * spendScale + jitter
    const tokens = Math.round(((i + 1) / days) * tokenScale + jitter * 40_000)
    out.push({ t: now - i * 86_400_000, spend: Math.round(spend * 100) / 100, tokens })
  }
  return out
}

export const defaultAgents: Agent[] = [
  {
    name: 'Claude',
    mark: 'C',
    color: '#e8745d',
    connected: true,
    hasKey: false,
    source: 'simulated',
    spend: 18.42,
    period: 'This month',
    tokens: { input: 2_410_000, output: 86_000, total: 2_496_000 },
    history: seedHistory(18.42, 2_400_000),
    meters: [
      { label: 'Daily', used: 100, tone: 'hot', reset: '2h 6m', at: '4:29 PM' },
      { label: 'Weekly', used: 26, tone: 'blue', reset: '5d 10h', at: 'Aug 25' },
    ],
  },
  {
    name: 'ChatGPT',
    mark: '✦',
    color: '#3dc07a',
    connected: true,
    hasKey: false,
    source: 'simulated',
    spend: 20.0,
    period: 'This month',
    tokens: { input: 3_050_000, output: 120_000, total: 3_170_000 },
    history: seedHistory(20.0, 3_000_000),
    meters: [
      { label: 'Daily', used: 42, tone: 'blue', reset: '3h 18m', at: '5:41 PM' },
      { label: 'Weekly', used: 18, tone: 'amber', reset: '4d 2h', at: 'Aug 22' },
    ],
  },
  {
    name: 'Gemini',
    mark: '✦',
    color: '#4c8dff',
    connected: false,
    hasKey: false,
    source: 'none',
    spend: 0,
    period: 'This month',
    tokens: { ...emptyTokens },
    history: [],
    meters: [],
  },
  {
    name: 'GitHub Copilot',
    mark: '●',
    color: '#9890f3',
    connected: false,
    hasKey: false,
    source: 'none',
    spend: 0,
    period: 'This month',
    tokens: { ...emptyTokens },
    history: [],
    meters: [],
  },
]

export function blankAgent(name: string, mark: string, color: string): Agent {
  return {
    name,
    mark,
    color,
    connected: false,
    hasKey: false,
    source: 'none',
    spend: 0,
    period: 'This month',
    tokens: { ...emptyTokens },
    history: [],
    meters: [],
  }
}

const meterSeeds: [string, Meter['tone']][] = [
  ['Daily', 'hot'],
  ['Weekly', 'blue'],
  ['Monthly', 'amber'],
]

function seedMeters(): Meter[] {
  return meterSeeds.map(([label, tone], i) => {
    const used = Math.min(96, Math.max(8, Math.round(42 + i * -9 + (Math.random() - 0.5) * 34)))
    return {
      label,
      used,
      tone,
      reset: `${1 + Math.floor(Math.random() * 23)}h ${Math.floor(Math.random() * 59)}m`,
      at: '—',
    }
  })
}

export function connectAgent(agent: Agent): Agent {
  if (agent.connected) return agent
  const meters = seedMeters()
  const peak = Math.max(...meters.map((m) => m.used))
  const tokens: TokenCount = {
    input: Math.round(peak * 30_000),
    output: Math.round(peak * 1_200),
    total: 0,
  }
  tokens.total = tokens.input + tokens.output
  return {
    ...agent,
    connected: true,
    period: 'This month',
    source: agent.hasKey ? 'estimated' : 'simulated',
    spend: Math.round((peak / 100) * 30 * 100) / 100,
    tokens,
    history: seedHistory(Math.round(peak * 3) / 10, tokens.total),
    meters: meters.map((m) => ({ ...m, at: m.at === '—' ? '8:00 PM' : m.at })),
  }
}

function pushHistory(history: HistoryPoint[], spend: number, tokens: TokenCount): HistoryPoint[] {
  const next = [...history, { t: Date.now(), spend, tokens: tokens.total }]
  return next.length > 200 ? next.slice(next.length - 200) : next
}

export function tickAgent(agent: Agent): Agent {
  if (!agent.connected) return agent
  const meters = agent.meters.map((m) => {
    if (m.used >= 100) return m
    const drift = Math.round((Math.random() - 0.35) * 5)
    const used = Math.min(100, Math.max(3, m.used + drift))
    return { ...m, used }
  })
  const spend = Math.round((agent.spend + Math.random() * 0.3) * 100) / 100
  const tokens: TokenCount = {
    input: agent.tokens.input + Math.round(Math.random() * 400),
    output: agent.tokens.output + Math.round(Math.random() * 60),
    total: 0,
  }
  tokens.total = tokens.input + tokens.output
  return { ...agent, meters, spend, tokens, history: pushHistory(agent.history, spend, tokens) }
}

export function applyRemote(
  agent: Agent,
  remote: {
    source: string
    spend: number
    period: string
    tokens: TokenCount
    meters: { label: string; used: number; tone: string; reset: string; at: string }[]
  }
): Agent {
  const meters: Meter[] = remote.meters.map((m) => ({
    label: m.label,
    used: Math.round(m.used),
    tone: (m.tone as Meter['tone']) || 'blue',
    reset: m.reset,
    at: m.at,
  }))
  const source = (remote.source as Agent['source']) || 'estimated'
  return {
    ...agent,
    connected: true,
    source,
    spend: Math.round(remote.spend * 100) / 100,
    period: remote.period,
    tokens: remote.tokens,
    meters: meters.length > 0 ? meters : agent.meters,
    history: pushHistory(agent.history, remote.spend, remote.tokens),
  }
}

export const CONNECTOR_SOURCE: Record<'simulated', ConnectorSource> = { simulated: 'simulated' }