/**
 * The big title that opens a game or a quiz.
 *
 * A countdown on its own never told the room a new game had started - people
 * were still reading the last verdict when the first question landed. This is
 * one loud card, the same on every iPad and on the wall, with the round's name
 * and a single line of what it is about.
 *
 * The name is the only red type on the card, and it is far past display size:
 * red at body size fails contrast on black, which is why the note underneath
 * stays white.
 */
import './TitleCard.css'

export default function TitleCard({
  title,
  kicker,
  note,
  countdown,
  size = 'device',
}: {
  title: string
  /** Small line above the name: which round, or what is next. */
  kicker: string
  /** One line about the game. Read once, at a glance. */
  note: string
  countdown: number
  size?: 'device' | 'display'
}) {
  return (
    <div className={`tcard tcard--${size}`} role="status" aria-live="polite">
      <span className="tcard__scan" aria-hidden="true" />
      <p className="tcard__kicker">
        <span className="tcard__dot" aria-hidden="true" />
        {kicker}
      </p>
      <p className="tcard__title" data-text={title}>
        {title}
      </p>
      <span className="tcard__rule" aria-hidden="true" />
      <p className="tcard__note">{note}</p>
      <p className="tcard__count">{countdown}s</p>
    </div>
  )
}
