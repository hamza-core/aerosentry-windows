import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { Button, ErrorText, Footnote, Notice, PasswordField, Segmented, TextField } from '../components/ui'
import { useSession } from '../state/session'
import { useAction } from '../lib/hooks'
import { checkEmail } from '../lib/domain'

export default function Login() {
  const { signIn, notice } = useSession()
  const navigate = useNavigate()
  const [role, setRole] = useState('Admin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState(null)
  const { run, busy, error } = useAction()

  async function submit(e) {
    e.preventDefault()
    const issue = checkEmail(email) || (!password && 'Enter your password.')
    setProblem(issue || null)
    if (issue) return
    const user = await run(() => signIn(email, password, role))
    if (user) navigate('/', { replace: true })
  }

  return (
    <AuthShell>
      <form className="stack" onSubmit={submit}>
        <div><h1>Welcome back</h1><p className="sub">Sign in to protect your property</p></div>
        {notice ? <Notice title="Signed out" tone="warn">{notice}</Notice> : null}
        <Segmented block value={role} onChange={setRole} options={[{ value: 'Admin', label: 'Security Admin' }, { value: 'Guard', label: 'Guard' }]} />
        <Footnote>{role === 'Admin' ? 'Configure cameras, walls, laser grids and drones.' : 'Monitor incidents and respond when an alert comes in.'}</Footnote>
        <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" autoFocus placeholder="you@example.com" />
        <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
        <ErrorText message={problem || error} />
        <Button type="submit" block large busy={busy}>Sign In</Button>
        <Footnote>Forgot your password? Ask your administrator. Password reset by code is not available on the server yet.</Footnote>
        <p className="muted" style={{ textAlign: 'center' }}>New to Aerosentry? <Link to="/register"><strong>Create account</strong></Link></p>
      </form>
    </AuthShell>
  )
}
