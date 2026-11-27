import { useState } from 'react'
import { useTitle } from '../components/Layout'
import { Card } from '../components/ui'
import { getAppearance, setAppearance } from '../lib/theme'

const OPTIONS = [
  { value: 'system', label: 'System', text: 'Follows the computer’s light or dark setting' },
  { value: 'light', label: 'Light', text: 'Bright, for well-lit rooms' },
  { value: 'dark', label: 'Dark', text: 'Easy on the eyes in a control room' },
]

const Mini = ({ tone }) => <div className={`preview ${tone}`}><i className="side" /><div className="body"><b /><b /><b /></div></div>

export default function Appearance() {
  useTitle('Appearance', [{ label: 'Settings', to: '/settings' }])
  const [value, setValue] = useState(getAppearance())
  return (
    <Card title="Appearance" sub="Remembered in this browser">
      <div className="theme-tiles">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" className={`theme-tile ${value === o.value ? 'on' : ''}`} aria-pressed={value === o.value} onClick={() => { setValue(o.value); setAppearance(o.value) }}>
            {o.value === 'system'
              ? <div className="preview system"><div><i className="side" /><div className="body" style={{ background: '#f4f6f9' }}><b style={{ background: '#cbd5e1' }} /><b style={{ background: '#cbd5e1' }} /></div></div><div><i className="side" /><div className="body" style={{ background: '#111826' }}><b style={{ background: '#2c3a52' }} /><b style={{ background: '#2c3a52' }} /></div></div></div>
              : <Mini tone={o.value} />}
            <span>{o.label}</span><span className="footnote" style={{ fontWeight: 400 }}>{o.text}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}
