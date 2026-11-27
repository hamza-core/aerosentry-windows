import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { Button, ErrorText, Footnote, PasswordField, TextField } from '../components/ui'
import { useSession } from '../state/session'
import { useAction } from '../lib/hooks'
import { checkEmail, checkPassword } from '../lib/domain'

export default function Register() {
  const { register } = useSession()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [problem, setProblem] = useState(null)
  const { run, busy, error } = useAction()

  async function submit(e) {
    e.preventDefault()
    const issue = (!fullName.trim() && 'Enter your name.') || checkEmail(email) || checkPassword(password, confirm)
    setProblem(issue || null)
    if (issue) return
    const user = await run(() => register({ fullName: fullName.trim(), email: email.trim(), phoneNumber: phoneNumber.trim(), password }))
    if (user) navigate('/', { replace: true })
  }

  return (
    <AuthShell>
      <form className="stack" onSubmit={submit}>
        <div><h1>Create account</h1><p className="sub">A security administrator account</p></div>
        <TextField label="Full name" value={fullName} onChange={setFullName} autoComplete="name" autoFocus />
        <div className="form-grid">
          <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" />
          <TextField label="Phone (optional)" value={phoneNumber} onChange={setPhone} autoComplete="tel" />
          <PasswordField label="Password (at least 8 characters)" value={password} onChange={setPassword} autoComplete="new-password" />
          <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        <ErrorText message={problem || error} />
        <Button type="submit" block large busy={busy}>Create Account</Button>
        <Footnote>Guards do not create accounts here: an administrator adds them in Settings, then they sign in.</Footnote>
        <p className="muted" style={{ textAlign: 'center' }}>Already have an account? <Link to="/login"><strong>Sign in</strong></Link></p>
      </form>
    </AuthShell>
  )
}
