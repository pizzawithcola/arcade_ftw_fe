import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchEvents, loginAdmin, loginPlayer, type EventOption } from '../api'
import './LoginPage.css'

type Mode = 'player' | 'admin'

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('player')
  const [nickname, setNickname] = useState('')
  const [event, setEvent] = useState('')
  const [events, setEvents] = useState<EventOption[] | null>(null)
  const [eventsError, setEventsError] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // The list comes from the backend rather than living here, so the dropdown can
  // never offer an event the login endpoint would turn around and reject.
  useEffect(() => {
    let cancelled = false
    fetchEvents()
      .then((loaded) => {
        if (!cancelled) setEvents(loaded)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setEventsError(caught instanceof Error ? caught.message : String(caught))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filledIn =
    mode === 'player' ? nickname.trim() !== '' && event !== '' : username !== '' && password !== ''

  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!filledIn) return
    setBusy(true)
    setError('')
    try {
      if (mode === 'player') {
        await loginPlayer(nickname.trim(), event)
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

  const eventPlaceholder = eventsError
    ? 'Unavailable'
    : events === null
      ? 'Loading…'
      : 'Choose your event…'

  return (
    <main className="login">
      <form className="login__card" onSubmit={submit}>
        <h1>Arcade FTW</h1>
        <p className="login__hint">
          {mode === 'player' ? 'Pick a name and your event.' : 'Operator sign-in.'}
        </p>

        {mode === 'player' ? (
          <>
            <label className="login__field">
              <span>Nickname</span>
              <input
                value={nickname}
                onChange={(changeEvent) => setNickname(changeEvent.target.value)}
                placeholder="e.g. NeonFox"
                maxLength={64}
                autoFocus
              />
            </label>
            <label className="login__field">
              <span>Event</span>
              <select
                value={event}
                onChange={(changeEvent) => setEvent(changeEvent.target.value)}
                disabled={events === null}
                className={event === '' ? 'is-placeholder' : ''}
              >
                <option value="" disabled>
                  {eventPlaceholder}
                </option>
                {events?.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="login__field">
              <span>Username</span>
              <input
                value={username}
                onChange={(changeEvent) => setUsername(changeEvent.target.value)}
                autoComplete="username"
                autoFocus
              />
            </label>
            <label className="login__field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(changeEvent) => setPassword(changeEvent.target.value)}
                autoComplete="current-password"
              />
            </label>
          </>
        )}

        {eventsError && (
          <p className="login__error">Could not load the event list: {eventsError}</p>
        )}
        {error && <p className="login__error">{error}</p>}

        <button type="submit" disabled={busy || !filledIn}>
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
