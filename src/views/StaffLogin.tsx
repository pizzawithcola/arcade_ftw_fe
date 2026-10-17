import { useState, type FormEvent } from 'react'
import { clearToken, loginAdmin, type Session } from '../api'
import './auth.css'

/**
 * Username and password for staff.
 *
 * `scope` decides what the resulting token can do: `display` is read-only, so
 * the big screen can be left logged in without handing the show to anyone who
 * walks past it.
 */
export default function StaffLogin({
  scope,
  title,
  onSignedIn,
}: {
  scope: 'full' | 'display'
  title: string
  onSignedIn: (session: Session) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const filledIn = username !== '' && password !== ''

  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!filledIn) return
    setBusy(true)
    setError('')
    try {
      onSignedIn(await loginAdmin(username, password, scope))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={submit}>
        <h1>{title}</h1>
        <p className="login__hint">
          {scope === 'display' ? 'Read-only screen sign-in.' : 'Operator sign-in.'}
        </p>

        <label className="login__field">
          <span>Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="login__field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <p className="login__error">{error}</p>}

        <button type="submit" disabled={busy || !filledIn}>
          {busy ? '…' : 'Sign in'}
        </button>

        <button
          type="button"
          className="login__admin-toggle"
          onClick={() => {
            clearToken()
            location.assign('/')
          }}
        >
          back
        </button>
      </form>
    </main>
  )
}
