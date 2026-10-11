import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginAdmin, loginPlayer } from '../api'
import './LoginPage.css'

type Mode = 'player' | 'admin'

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('player')
  const [nickname, setNickname] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'player') {
        await loginPlayer(nickname.trim())
      } else {
        await loginAdmin(username, password)
      }
      navigate('/', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={submit}>
        <h1>Arcade FTW</h1>
        <p className="login__hint">
          {mode === 'player' ? 'Pick a name and you are in.' : 'Operator sign-in.'}
        </p>

        {mode === 'player' ? (
          <label className="login__field">
            <span>Nickname</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="e.g. NeonFox"
              maxLength={64}
              autoFocus
            />
          </label>
        ) : (
          <>
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
          </>
        )}

        {error && <p className="login__error">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy ? '…' : mode === 'player' ? 'Enter' : 'Sign in as operator'}
        </button>

        {mode === 'player' && (
          <button
            type="button"
            className="login__admin-toggle"
            onClick={() => {
              setMode('admin')
              setError('')
            }}
          >
            operator
          </button>
        )}
      </form>
    </main>
  )
}
