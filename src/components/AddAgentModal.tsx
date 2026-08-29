import { useState } from 'react'
import { Plus, Save, X } from 'lucide-react'
import type { Agent } from '../types'
import { availableProviders } from '../data/providers'
import { blankAgent } from '../data/fixtures'

type Props = {
  existing: string[]
  onAdd: (agent: Agent) => void
  onClose: () => void
}

export function AddAgentModal({ existing, onAdd, onClose }: Props) {
  const [tab, setTab] = useState<'preset' | 'custom'>('preset')
  const [name, setName] = useState('')
  const [mark, setMark] = useState('')
  const [color, setColor] = useState('#5f93d4')
  const presets = availableProviders.filter((p) => !existing.includes(p.name))

  function addPreset(provider: { name: string; mark: string; color: string }) {
    onAdd(blankAgent(provider.name, provider.mark, provider.color))
    onClose()
  }

  function addCustom() {
    const trimmed = name.trim()
    if (!trimmed || existing.includes(trimmed)) return
    onAdd(blankAgent(trimmed, mark.trim() || trimmed[0].toUpperCase(), color))
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add agent">
        <div className="modal-header">
          <h2>Add agent</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'preset'} className={tab === 'preset' ? 'selected' : ''} onClick={() => setTab('preset')}>
            From provider
          </button>
          <button role="tab" aria-selected={tab === 'custom'} className={tab === 'custom' ? 'selected' : ''} onClick={() => setTab('custom')}>
            Custom
          </button>
        </div>
        {tab === 'preset' ? (
          <div className="preset-grid">
            {presets.length === 0 && <p className="preset-empty">All providers are already added.</p>}
            {presets.map((p) => (
              <button key={p.name} className="preset-card" onClick={() => addPreset(p)}>
                <span className="preset-mark" style={{ background: p.color }}>
                  {p.mark}
                </span>
                <span className="preset-name">{p.name}</span>
                <Plus size={14} className="preset-add" />
              </button>
            ))}
          </div>
        ) : (
          <div className="custom-form">
            <label>
              Name
              <input type="text" placeholder="e.g. Llama, Qwen..." value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
            </label>
            <label>
              Mark <span className="label-hint">(single character)</span>
              <input type="text" maxLength={2} placeholder="L" value={mark} onChange={(e) => setMark(e.target.value)} />
            </label>
            <label>
              Color
              <div className="color-row">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                <span className="color-preview" style={{ background: color }} />
                <span className="color-hex">{color}</span>
              </div>
            </label>
            <button className="primary modal-add" disabled={!name.trim()} onClick={addCustom}>
              <Save size={15} /> Add agent
            </button>
          </div>
        )}
      </div>
    </div>
  )
}