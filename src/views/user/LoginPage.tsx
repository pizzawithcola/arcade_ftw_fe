import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchEvents, fetchSession, loginPlayer, type EventOption } from '../../api'
import '../auth.css'

/**
 * Player entry: the homepage. A nickname and an event, nothing else.
 *
 * One device per person, so this is a once-per-event sign-in; the session then
 * lasts the whole show.
 */
export default function LoginPage() {
  const navigate = useNavigate()
  // A QR code may point at /?room=xyz (pinned); with no room the device follows
  // whichever round is current.
  const [params] = useSearchParams()
  const room = params.get('room')
  const [nickname, setNickname] = useState('')
  const [event, setEvent] = useState('')
  const [events, setEvents] = useState<EventOption[] | null>(null)
  const [eventsError, setEventsError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Already signed in as a player? Go straight back to the show.
  useEffect(() => {
    void fetchSession().then((session) => {
      if (session && !session.isAdmin) {
        navigate(room ? `/r/${room}` : '/play', { replace: true })
      }
    })
  }, [navigate, room])

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

  const filledIn = nickname.trim() !== '' && event !== ''

  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!filledIn) return
    setBusy(true)
    setError('')
    try {
      await loginPlayer(nickname.trim(), event)
      navigate(room ? `/r/${room}` : '/play', { replace: true })
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
        <p className="login__hint">Pick a name and your event.</p>

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

        {eventsError && <p className="login__error">Could not load the event list: {eventsError}</p>}
        {error && <p className="login__error">{error}</p>}

        <button type="submit" disabled={busy || !filledIn}>
          {busy ? '…' : 'Enter'}
        </button>

        {/* Staff entrances, deliberately quiet: the audience never needs them. */}
        <div className="login__staff">
          <Link to="/display">display</Link>
          <Link to="/admin">admin</Link>
        </div>
      </form>
    </main>
  )
}
