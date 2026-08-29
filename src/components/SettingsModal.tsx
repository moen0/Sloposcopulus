import { useState } from 'react'
import { BellOff, BellRing, Check, Eye, EyeOff, KeyRound, Loader2, Plus, RotateCcw, ShieldCheck, Sun, Timer, X } from 'lucide-react'
import type { Settings } from '../types'

type KeyRow = { id: string; label: string; hint: string; masked?: string }

type Props = {
  settings: Settings
  onChange: (settings: Settings) => void
  onReset: () => void
  onClose: () => void
  keys: Record<string, { masked: string }>
  onSaveKey: (providerId: string, key: string) => Promise<void>
  onRemoveKey: (providerId: string) => Promise<void>
}

const pollOptions: { label: string; value: Settings['pollSeconds'] }[] = [
  { label: 'Live', value: 10 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
  { label: 'Paused', value: null },
]

const keyRows: KeyRow[] = [
  { id: 'anthropic', label: 'Claude', hint: 'Anthropic API key with usage access' },
  { id: 'openai', label: 'ChatGPT', hint: 'OpenAI API key (usage + billing)' },
  { id: 'copilot', label: 'GitHub Copilot', hint: 'Copilot SSO token' },
]

export function SettingsModal({ settings, onChange, onReset, onClose, keys, onSaveKey, onRemoveKey }: Props) {
  const [tab, setTab] = useState<'general' | 'keys'>('general')
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [seen, setSeen] = useState<Record<string, boolean>>({})
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function save(id: string) {
    const value = inputs[id]?.trim()
    if (!value) return
    setWorking(id)
    setError('')
    try {
      await onSaveKey(id, value)
      setInputs((p) => ({ ...p, [id]: '' }))
    } catch (e) {
      setError(String(e))
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'general'} className={tab === 'general' ? 'selected' : ''} onClick={() => setTab('general')}>
            General
          </button>
          <button role="tab" aria-selected={tab === 'keys'} className={tab === 'keys' ? 'selected' : ''} onClick={() => setTab('keys')}>
            API keys
          </button>
        </div>

        {tab === 'general' ? (
          <div className="settings-body">
            <div className="settings-row">
              <div className="settings-title">
                <Sun size={16} />
                <span>Appearance</span>
              </div>
              <div className="option-list">
                <button className={settings.theme === 'light' ? 'option-row selected' : 'option-row'} onClick={() => onChange({ ...settings, theme: 'light' })}>
                  <span>Light</span>
                  {settings.theme === 'light' && <Check size={15} className="check" />}
                </button>
                <button className={settings.theme === 'dark' ? 'option-row selected' : 'option-row'} onClick={() => onChange({ ...settings, theme: 'dark' })}>
                  <span>Dark</span>
                  {settings.theme === 'dark' && <Check size={15} className="check" />}
                </button>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-title">
                <Timer size={16} />
                <span>Refresh rate</span>
              </div>
              <div className="option-list">
                {pollOptions.map((o) => (
                  <button key={o.label} className={settings.pollSeconds === o.value ? 'option-row selected' : 'option-row'} onClick={() => onChange({ ...settings, pollSeconds: o.value })}>
                    <span>{o.label}</span>
                    {settings.pollSeconds === o.value && <Check size={15} className="check" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-title">
                {settings.alerts ? <BellRing size={16} /> : <BellOff size={16} />}
                <span>Limit alerts</span>
              </div>
              <button className={`switch ${settings.alerts ? 'on' : ''}`} role="switch" aria-checked={settings.alerts} onClick={() => onChange({ ...settings, alerts: !settings.alerts })}>
                <span className="switch-thumb" />
              </button>
            </div>

            <div className="settings-note">
              <ShieldCheck size={15} />
              <span>Everything stays on this device — agents, keys, usage history, and settings never leave your machine.</span>
            </div>

            <button className="settings-reset" onClick={onReset}>
              <RotateCcw size={14} /> Reset demo data
            </button>
          </div>
        ) : (
          <div className="settings-body">
            <p className="keys-note">
              <KeyRound size={15} />
              <span>Keys are stored locally (0600 perms) and only sent to the provider you configured them for, when fetching real usage.</span>
            </p>
            {keyRows.map((row) => {
              const has = keys[row.id]
              const busy = working === row.id
              return (
                <div className="key-row" key={row.id}>
                  <div className="key-head">
                    <span className="key-label">{row.label}</span>
                    {has ? (
                      <span className="key-badge">linked</span>
                    ) : (
                      <span className="key-badge empty">no key</span>
                    )}
                  </div>
                  <span className="key-hint">{row.hint}</span>
                  {has && <span className="key-masked">{has.masked}</span>}
                  <div className="key-actions">
                    <div className="key-input">
                      <input
                        type={seen[row.id] ? 'text' : 'password'}
                        placeholder={has ? 'Replace key…' : 'Paste API key…'}
                        value={inputs[row.id] ?? ''}
                        onChange={(e) => setInputs((p) => ({ ...p, [row.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && save(row.id)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="key-eye"
                        aria-label={seen[row.id] ? 'Hide key' : 'Show key'}
                        onClick={() => setSeen((p) => ({ ...p, [row.id]: !p[row.id] }))}
                      >
                        {seen[row.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    <button
                      className="key-save"
                      disabled={!inputs[row.id]?.trim() || busy}
                      onClick={() => save(row.id)}
                    >
                      {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Save
                    </button>
                    {has && (
                      <button className="key-remove" onClick={() => void onRemoveKey(row.id)}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {error && <p className="keys-error">{error}</p>}
            <div className="settings-note">
              <ShieldCheck size={15} />
              <span>Providers without a public usage API (e.g. Gemini AI Studio) stay in simulated mode.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}