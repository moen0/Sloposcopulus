import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalSize } from '@tauri-apps/api/dpi'
import {
  Activity,
  BellOff,
  BellRing,
  ChevronDown,
  ChevronRight,
  Loader2,
  Minus,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import type { Agent, Settings as SettingsType } from './types'
import { STORAGE_KEYS, applyRemote, connectAgent, defaultAgents, providerId, tickAgent } from './data/fixtures'
import { load, save } from './lib/storage'
import { MeterRow } from './components/MeterRow'
import { AddAgentModal } from './components/AddAgentModal'
import { SettingsModal } from './components/SettingsModal'
import { SpendChart, formatTokens } from './components/SpendChart'
import './styles.css'

const defaultSettings: SettingsType = { theme: 'dark', pollSeconds: 60, alerts: true, alwaysOnTop: true }

const NATIVE = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

type KeyMap = Record<string, { masked: string }>

function timeLabel(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function lightTint(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return 'rgb(240, 238, 232)'
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  const mix = (c: number) => Math.round(c + (255 - c) * 0.82)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

export function App() {
  const [agents, setAgents] = useState<Agent[]>(() => load(STORAGE_KEYS.agents, defaultAgents))
  const [settings, setSettings] = useState<SettingsType>(() => ({ ...defaultSettings, ...load(STORAGE_KEYS.settings, defaultSettings) }))
  const [active, setActive] = useState(() => load(STORAGE_KEYS.agents, defaultAgents)[0]?.name ?? defaultAgents[0].name)
  const [compact, setCompact] = useState(false)
  const [lastSync, setLastSync] = useState('')
  const [notice, setNotice] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPeak, setShowPeak] = useState(false)
  const [keys, setKeys] = useState<KeyMap>({})

  const agent = agents.find((a) => a.name === active) ?? agents[0]

  const agentsRef = useRef(agents)
  agentsRef.current = agents

  useEffect(() => save(STORAGE_KEYS.agents, agents), [agents])
  useEffect(() => save(STORAGE_KEYS.settings, settings), [settings])

  useEffect(() => {
    if (!NATIVE) return
    void invoke<{ provider: string; masked: string }[]>('list_api_keys')
      .then((arr) => {
        const map: KeyMap = {}
        arr.forEach((k) => (map[k.provider] = { masked: k.masked }))
        setKeys(map)
        setAgents((prev) =>
          prev.map((a) => {
            const info = map[providerId(a.name)]
            if (info) return { ...a, hasKey: true, keyMasked: info.masked }
            return a
          })
        )
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!NATIVE) return
    try {
      void getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop)
    } catch {
      /* browser preview */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function showNotice(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  async function hideWindow() {
    try {
      await getCurrentWindow().hide()
    } catch {
      setCompact(true)
    }
  }

  function onDragStart(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    if (NATIVE) {
      try {
        void getCurrentWindow().startDragging()
      } catch {
        /* browser preview */
      }
    }
  }

  function toggleCompact() {
    const next = !compact
    setCompact(next)
    if (NATIVE) {
      try {
        void getCurrentWindow().setSize(new LogicalSize(next ? 320 : 330, next ? 172 : 430))
      } catch {
        /* browser preview */
      }
    }
  }

  async function togglePin() {
    const next = !settings.alwaysOnTop
    setSettings((s) => ({ ...s, alwaysOnTop: next }))
    if (NATIVE) {
      try {
        await getCurrentWindow().setAlwaysOnTop(next)
      } catch {
        /* browser preview */
      }
    }
  }

  const sync = useCallback(async () => {
    setSyncing(true)
    const next = agentsRef.current
    for (const a of next) {
      if (!a.connected) continue
      if (a.hasKey) {
        try {
          const snap = await invoke<Parameters<typeof applyRemote>[1]>('fetch_usage', { provider: providerId(a.name) })
          const updated = agentsRef.current.map((ag) => (ag.name === a.name ? applyRemote(ag, snap) : ag))
          agentsRef.current = updated
          setAgents(updated)
        } catch (e) {
          showNotice(`${a.name}: ${String(e)}`)
          const updated = agentsRef.current.map((ag) => (ag.name === a.name ? tickAgent(ag) : ag))
          agentsRef.current = updated
          setAgents(updated)
        }
      } else {
        const updated = agentsRef.current.map((ag) => (ag.name === a.name ? tickAgent(ag) : ag))
        agentsRef.current = updated
        setAgents(updated)
      }
    }
    setLastSync(timeLabel(new Date()))
    setSyncing(false)
  }, [])

  useEffect(() => {
    if (settings.pollSeconds == null) return
    const id = window.setInterval(() => void sync(), settings.pollSeconds * 1000)
    return () => window.clearInterval(id)
  }, [settings.pollSeconds, sync])

  async function connectCurrentAgent() {
    const a = agent
    if (!a) return
    if (a.hasKey) {
      setBusy(a.name)
      try {
        const snap = await invoke<Parameters<typeof applyRemote>[1]>('fetch_usage', { provider: providerId(a.name) })
        setAgents((prev) => prev.map((ag) => (ag.name === a.name ? applyRemote(ag, snap) : ag)))
        showNotice(`${a.name} connected to live API`)
      } catch (e) {
        showNotice(`${a.name}: ${String(e)}`)
      } finally {
        setBusy(null)
      }
    } else {
      setAgents((prev) => prev.map((ag) => (ag.name === a.name ? connectAgent(ag) : ag)))
      showNotice(`${a.name} connected (simulated — add an API key for live data)`)
    }
  }

  function addAgent(a: Agent) {
    setAgents((prev) => [...prev, a])
    setActive(a.name)
    const info = keys[providerId(a.name)]
    if (info) {
      setAgents((prev) => prev.map((ag) => (ag.name === a.name ? { ...ag, hasKey: true, keyMasked: info.masked } : ag)))
    }
    showNotice(`Added ${a.name}`)
  }

  function removeAgent(name: string) {
    if (agents.length <= 1) return
    const idx = agents.findIndex((a) => a.name === name)
    const neighbor = agents[idx === 0 ? 1 : idx - 1].name
    setAgents((prev) => prev.filter((a) => a.name !== name))
    if (active === name) setActive(neighbor)
    showNotice(`Removed ${name}`)
  }

  function resetDemoData() {
    localStorage.removeItem(STORAGE_KEYS.agents)
    setAgents(defaultAgents)
    setActive(defaultAgents[0].name)
    showNotice('Demo data reset')
  }

  async function handleSaveKey(pid: string, key: string) {
    let masked = `${key.slice(0, 6)}…${key.slice(-4)}`
    if (NATIVE) {
      masked = await invoke<string>('save_api_key', { provider: pid, key })
    }
    setKeys((prev) => ({ ...prev, [pid]: { masked } }))
    setAgents((prev) => prev.map((ag) => (providerId(ag.name) === pid ? { ...ag, hasKey: true, keyMasked: masked } : ag)))
  }

  async function handleRemoveKey(pid: string) {
    if (NATIVE) {
      await invoke('remove_api_key', { provider: pid })
    }
    setKeys((prev) => {
      const next = { ...prev }
      delete next[pid]
      return next
    })
    setAgents((prev) => prev.map((ag) => (providerId(ag.name) === pid ? { ...ag, hasKey: false, keyMasked: undefined } : ag)))
  }

  const sourceLabel = agent?.source === 'official' ? 'LIVE' : agent?.source === 'estimated' ? 'ESTIMATED' : agent?.source === 'simulated' ? 'SIMULATED' : 'OFF'

  return (
    <main
      data-theme={settings.theme}
      className={compact ? 'app compact' : 'app'}
      style={{ ['--bg-tint' as string]: lightTint(agent?.color ?? '#d8d2c8') } as React.CSSProperties}
    >
      <header className="titlebar" data-tauri-drag-region onMouseDown={onDragStart}>
        <div className="brand" onMouseDown={onDragStart}>
          <div className="brand-text">
            <span className="brand-name">SLOPUSE</span>
            <span className="brand-sub">{agent ? `${agent.name} · ${sourceLabel}` : ''}</span>
          </div>
        </div>
        <div className="actions">
          <button aria-label="Settings" onClick={() => setShowSettings(true)}>
            <Settings size={20} />
          </button>
          <button aria-label="Refresh" className={syncing ? 'spin' : ''} onClick={() => void sync()}>
            {syncing ? <Loader2 size={20} /> : <RefreshCw size={20} />}
          </button>
          <button aria-label="Always on top" className={settings.alwaysOnTop ? 'active' : ''} onClick={() => void togglePin()}>
            {settings.alwaysOnTop ? <Pin size={18} /> : <PinOff size={18} />}
          </button>
          <button aria-label="Toggle compact" onClick={toggleCompact}>
            <Minus size={20} />
          </button>
          <button aria-label="Hide to menu bar" onClick={() => void hideWindow()}>
            <X size={20} />
          </button>
        </div>
      </header>

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      <nav className="agent-tabs" aria-label="Agents">
        {agents.map((item) => (
          <button
            key={item.name}
            className={`agent-tab${item.name === active ? ' selected' : ''}`}
            onClick={() => setActive(item.name)}
          >
            <span className="tab-tile" style={{ background: item.color }}>
              {item.mark}
            </span>
            <span className="tab-name">{item.name}</span>
            {item.hasKey ? <span className="tab-dot live" title="Live connector" /> : !item.connected && <span className="tab-dot" title="Not connected" />}
            {agents.length > 1 && (
              <span
                className="remove-agent"
                onClick={(e) => {
                  e.stopPropagation()
                  removeAgent(item.name)
                }}
                aria-label={`Remove ${item.name}`}
              >
                <Trash2 size={12} />
              </span>
            )}
          </button>
        ))}
        <button className="add-agent-tab" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add
        </button>
      </nav>

      <div className="scroll">
        {!agent?.connected ? (
          <section className="empty">
            <div className="empty-icon">
              <Settings size={26} />
            </div>
            <h2>Connect {agent?.name}</h2>
            <p>Add a local connector to stream usage into this meter. Credentials never leave your device.</p>
            <button className="primary" onClick={() => void connectCurrentAgent()}>
              {busy === agent?.name ? <Loader2 size={16} className="spin" /> : <ChevronRight size={16} />}
              {agent?.hasKey ? 'Connect live' : 'Connect provider'}
            </button>
            {!agent?.hasKey && <p className="empty-sub">No API key yet — this will run on simulated data.</p>}
          </section>
        ) : (
          <>
            <section className="token-card">
              <div className="token-head">
                <div className="token-summary">
                  <div>
                    <small>Total tokens</small>
                    <strong>{formatTokens(agent.tokens.total)}</strong>
                    <span>
                      in {formatTokens(agent.tokens.input)} · out {formatTokens(agent.tokens.output)}
                    </span>
                  </div>
                  <div>
                    <small>{agent.period.toUpperCase()}</small>
                    <strong className="spend">${agent.spend.toFixed(2)}</strong>
                    <span>spend</span>
                  </div>
                </div>
                <div className="source-note">{sourceLabel.toLowerCase()} data</div>
              </div>
              <div className="peak-toggle">
                <button className={showPeak ? 'active' : ''} onClick={() => setShowPeak((v) => !v)} aria-expanded={showPeak}>
                  <TrendingUp size={14} />
                  <span>Usage peak</span>
                  <ChevronDown size={14} className={showPeak ? 'chev open' : 'chev'} />
                </button>
                {showPeak && (
                  <div className="peak-body">
                    <SpendChart history={agent.history} color={agent.color} />
                  </div>
                )}
              </div>
            </section>

            <section className="meters">
              {agent.meters.length > 0 ? (
                <>
                  <div className="section-heading">
                    <span>Usage meters</span>
                  </div>
                  {agent.meters.map((meter) => (
                    <MeterRow key={meter.label} meter={meter} />
                  ))}
                </>
              ) : (
                <div className="meters-empty">
                  <Activity size={16} />
                  <span>No usage meters reported by {agent.name} yet.</span>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <footer>
        <button className="footer-alerts" onClick={() => setShowSettings(true)}>
          {settings.alerts ? <BellRing size={14} /> : <BellOff size={14} />} Alerts {settings.alerts ? 'on' : 'off'}
        </button>
        <span className="synced">synced {lastSync || 'just now'}</span>
        <span>
          Local-only mode <span className="green-dot" />
        </span>
      </footer>

      {showAdd && <AddAgentModal existing={agents.map((a) => a.name)} onAdd={addAgent} onClose={() => setShowAdd(false)} />}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onReset={resetDemoData}
          onClose={() => setShowSettings(false)}
          keys={keys}
          onSaveKey={handleSaveKey}
          onRemoveKey={handleRemoveKey}
        />
      )}
    </main>
  )
}