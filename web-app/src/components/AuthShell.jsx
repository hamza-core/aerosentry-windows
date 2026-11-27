import Logo from './Logo'
import Icon from './icons'

const POINTS = [
  { icon: 'video', title: 'Cameras and walls', text: 'Mark a wall on a live camera picture and the system watches it for you.' },
  { icon: 'bell', title: 'Alerts the moment they happen', text: 'Every guard sees an incident as soon as a person climbs a watched wall.' },
  { icon: 'lock', title: 'Runs on your own network', text: 'No cloud and no internet needed. Your cameras and faces stay with you.' },
]

// The frame of the sign-in, register and first-property screens: a brand panel and the form.
export default function AuthShell({ children }) {
  return (
    <div className="auth-split">
      <aside className="auth-hero">
        <div className="brand"><span className="logo"><Logo /></span><span className="brand-name">AeroSentry</span></div>
        <div>
          <h2>Protect every wall.<br />Respond in seconds.</h2>
          <p className="lead">Drone-based house wall monitoring: cameras watch the walls, the system finds where an intruder is, and your guards know at once.</p>
          <ul className="auth-points">
            {POINTS.map((p) => <li key={p.title}><span className="ic"><Icon name={p.icon} /></span><span><strong>{p.title}</strong>{p.text}</span></li>)}
          </ul>
        </div>
        <small>AeroSentry · Final Year Project</small>
      </aside>
      <main className="auth-panel">
        <div className="auth-box">
          <div className="logo-top"><span style={{ width: 34, height: 34, display: 'inline-block' }}><Logo /></span> AeroSentry</div>
          {children}
        </div>
      </main>
    </div>
  )
}
