import './WrapUp.css'

/**
 * The last screen of the show.
 *
 * It used to fall through to the placeholder, so the room's final impression was
 * the words "Placeholder screen". This is the sign-off instead: one paragraph,
 * typed out, ending on the one line the whole show has been about.
 *
 * Typed from the caller's clock rather than by CSS, for the same reason the
 * welcome screen is: the operator can pause the show, and a paused sign-off has
 * to stop mid-sentence rather than finish off-screen.
 */

/** The line the show has been building to, and the only red text on the screen. */
const CALL = 'Remember to keep a human in the loop.'

const LEAD =
  'Thank you for your participation. AI is evolving fast, and the AI Cyber Arcade brings to life how we can use it safely. Embrace the change and '

const SCRIPT = LEAD + CALL

/** 30ms a character types the whole thing in about six seconds of a ten second
 *  node, which leaves four to read it back. */
const MS_PER_CHAR = 30

export default function WrapUp({
  elapsedMs,
  size = 'device',
}: {
  elapsedMs: number
  size?: 'device' | 'display'
}) {
  const shown = Math.min(SCRIPT.length, Math.floor(Math.max(0, elapsedMs) / MS_PER_CHAR))
  const visible = SCRIPT.slice(0, shown)
  const head = visible.slice(0, Math.min(visible.length, LEAD.length))
  const call = visible.length > LEAD.length ? visible.slice(LEAD.length) : ''
  const typing = shown < SCRIPT.length

  return (
    <div className={`wrapup wrapup--${size}`}>
      <p className="wrapup__text">
        {head}
        {call && <strong className="wrapup__call">{call}</strong>}
        {/* The caret is the reason this reads as being typed rather than as
            text that happened to arrive in pieces. */}
        <span className={`wrapup__caret${typing ? '' : ' is-done'}`} aria-hidden="true" />
      </p>
    </div>
  )
}
