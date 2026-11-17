import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchEvents, fetchSession, loginPlayer, type EventOption } from '../../api'
import '../auth.css'

/**
 * The show this build is running. The event is pinned rather than chosen: one
 * arcade, one festival, and a dropdown with three venues in it is a way to end
 * up in the wrong leaderboard on the night. Set this to `null` to bring the
 * picker back.
 */
const PINNED_EVENT: string | null = 'sg_fintech_week'

/**
 * Player entry: the homepage. A nickname, and the event the room is running.
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
  const [event, setEvent] = useState(PINNED_EVENT ?? '')
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
        if (cancelled) return
        setEvents(loaded)
        if (import.meta.env?.DEV && PINNED_EVENT && !loaded.some((one) => one.key === PINNED_EVENT)) {
          console.error(`[login] the pinned event ${PINNED_EVENT} is not in the list the server offers`)
        }
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

  // The label still comes from the server, so the pinned event reads the way the
  // backend spells it rather than as a second copy here.
  const pinnedLabel =
    events?.find((option) => option.key === PINNED_EVENT)?.label ?? 'Singapore Fintech Festival'
  const eventPlaceholder = eventsError
    ? 'Unavailable'
    : events === null
      ? 'Loading…'
      : 'Choose your event…'

  return (
    <main className="login">
      <div className="login__stack">
        <form className="login__card" onSubmit={submit}>
          <h1>AI Cyber Arcade</h1>

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
            {PINNED_EVENT ? (
              // Locked, not merely preselected: the room runs one festival, and
              // a player who never touches this field still has to sign in for
              // the right one.
              <select value={PINNED_EVENT} disabled className="is-locked">
                <option value={PINNED_EVENT}>{pinnedLabel}</option>
              </select>
            ) : (
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
            )}
          </label>

          {eventsError && <p className="login__error">Could not load the event list: {eventsError}</p>}
          {error && <p className="login__error">{error}</p>}

          <button type="submit" disabled={busy || !filledIn}>
            {busy ? '…' : 'Enter'}
          </button>
        </form>

        {/* No doors under the card any more: a player's thumb reaches that strip
            on the way to Enter, and /display and /admin are typed by staff who
            know the address. The leaderboard keeps its own link on the wall. */}
      </div>
    </main>
  )
}
