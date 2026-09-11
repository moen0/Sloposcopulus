export type Tone = 'hot' | 'blue' | 'amber'

export type Meter = {
  label: string
  used: number
  tone: Tone
  reset: string
  at: string
  resetAt?: number
}

export type TokenCount = {
  input: number
  output: number
  total: number
}

export type HistoryPoint = {
  t: number
  spend: number
  tokens: number
}

export type Source = 'official' | 'estimated' | 'simulated' | 'none'

export type Agent = {
  name: string
  mark: string
  color: string
  connected: boolean
  hasKey: boolean
  keyMasked?: string
  source: Source
  meters: Meter[]
  spend: number
  period: string
  tokens: TokenCount
  history: HistoryPoint[]
}

export type Theme = 'light' | 'dark'

export type RefreshMode = number | null

export type Settings = {
  theme: Theme
  pollSeconds: RefreshMode
  alerts: boolean
  alwaysOnTop: boolean
  compact: boolean
}

export type ConnectorSource = 'official' | 'simulated'