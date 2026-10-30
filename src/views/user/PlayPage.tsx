import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  clearToken,
  currentRoom,
  fetchEvents,
  fetchSession,
  joinRoom,
  type PlayerSession,
} from '../../api'
import DataShadowGame from '../../games/dataShadow/DataShadowGame'
import HallucinationGame from '../../games/hallucination/HallucinationGame'
import QuizGame from '../../games/quiz/QuizGame'
import SabotageGame from '../../games/sabotage/SabotageGame'
import { findBrief } from '../../games/briefs'
import TitleCard from '../../games/TitleCard'
import Welcome from '../../games/Welcome'
import { findTitle, GAME_COUNT, gameNumber } from '../../games/titles'
import '../hud.css'
import RoomLeaderboard from '../../components/RoomLeaderboard'
import { useGameSocket } from '../../hooks/useGameSocket'
import { useNodeElapsed } from '../../hooks/useNodeElapsed'
import { useGameStore, type FlowNode } from '../../store/gameStore'
import './PlayPage.css'

/**
 * The player's waiting room. Three things, in this order: what this is, who they
 * are, and that nothing is expected of them yet. No roster, no clock, no chrome -
 * the screen is held for a minute at most.
 */
function WaitingRoom({ nickname, eventName }: { nickname: string; eventName: string }) {
  return (
    <div className="hud">
      {/* Dot matrix behind everything: reads as a projection surface rather than
          a web page, which is what the room is. */}
      <div className="hud__matrix" aria-hidden="true" />

      <div className="hud__frame">
        <div className="hud__inner">
          <span className="hud__corner hud__corner--tl" aria-hidden="true" />
          <span className="hud__corner hud__corner--tr" aria-hidden="true" />
          <span className="hud__corner hud__corner--bl" aria-hidden="true" />
          <span className="hud__corner hud__corner--br" aria-hidden="true" />

          <div className="hud__tab">Waiting Room</div>

          <div className="hud__bar">
            <span className="hud__chevrons" aria-hidden="true" />
            <span className="hud__event">{eventName || 'AI Cyber Arcade'}</span>
            <span className="hud__status">
              <span className="hud__dot" aria-hidden="true" />
              get ready
            </span>
            <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
          </div>

          <div className="hud__stage">
            <div className="hud__rings" aria-hidden="true">
              <span className="hud__ring hud__ring--outer" />
              <span className="hud__ring hud__ring--mid" />
              <span className="hud__ring hud__ring--inner" />
              <span className="hud__avatar">
                <span className="hud__avatar-head" />
                <span className="hud__avatar-body" />
              </span>
            </div>

            <p className="hud__label">You are in as</p>
            <p className="hud__name">{nickname}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function NodeStage({
  node,
  nodeIndex,
  room,
  team,
}: {
  node: FlowNode | null
  nodeIndex: number
  room: string
  team?: string
}) {
  // Unconditional, so it sits above every branch below: the title card needs the
  // node clock, and a hook cannot hide behind an `if`.
  const elapsed = useNodeElapsed()

  if (!node) {
    return (
      <div className="stage stage--waiting">
        <p>Syncing…</p>
      </div>
    )
  }

  // The opening: what tonight is, and the four games it is made of. The reveal
  // runs off the node clock, so pausing the show freezes it mid-build.
  if (node.type === 'intro') {
    return (
      <div className="hud hud--game" key={nodeIndex}>
        <div className="hud__matrix" aria-hidden="true" />
        <div className="hud__frame">
          <div className="hud__inner">
            <span className="hud__corner hud__corner--tl" aria-hidden="true" />
            <span className="hud__corner hud__corner--tr" aria-hidden="true" />
            <span className="hud__corner hud__corner--bl" aria-hidden="true" />
            <span className="hud__corner hud__corner--br" aria-hidden="true" />
            <div className="hud__tab">Welcome</div>
            <div className="hud__bar">
              <span className="hud__chevrons" aria-hidden="true" />
              <span className="hud__event">Tonight's line-up</span>
              <span className="hud__status">
                <span className="hud__dot" aria-hidden="true" />
                starting soon
              </span>
              <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
            </div>
            <div className="hud__stage">
              <Welcome elapsedMs={elapsed} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // The five seconds before each game: its name, and one line about it.
  if (node.type === 'title') {
    const entry = findTitle(node.title)
    if (!entry) return null
    const at = gameNumber(node.title, node.section)
    return (
      <div className="hud hud--game" key={nodeIndex}>
        <div className="hud__matrix" aria-hidden="true" />
        <div className="hud__frame">
          <div className="hud__inner">
            <span className="hud__corner hud__corner--tl" aria-hidden="true" />
            <span className="hud__corner hud__corner--tr" aria-hidden="true" />
            <span className="hud__corner hud__corner--bl" aria-hidden="true" />
            <span className="hud__corner hud__corner--br" aria-hidden="true" />
            <div className="hud__tab">Up next</div>
            <div className="hud__bar">
              <span className="hud__chevrons" aria-hidden="true" />
              <span className="hud__event">
                {at ? `Round ${at} of ${GAME_COUNT}` : 'Next game'}
              </span>
              <span className="hud__status">
                <span className="hud__dot" aria-hidden="true" />
                starting
              </span>
              <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
            </div>
            <div className="hud__stage">
              <TitleCard
                title={entry.name}
                kicker={at ? `game ${at} of ${GAME_COUNT}` : 'next up'}
                note={entry.note}
                countdown={Math.max(0, Math.ceil(((node.duration_sec ?? 0) * 1000 - elapsed) / 1000))}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // The nine seconds before a game: what it is and what to press. Rendered
  // before the game branches so a brief never falls through to a game screen.
  if (node.type === 'brief') {
    const brief = findBrief(node.brief)
    return (
      <div className="hud hud--brief" key={nodeIndex}>
        <div className="hud__matrix" aria-hidden="true" />
        <div className="hud__frame">
          <div className="hud__inner">
            <span className="hud__corner hud__corner--tl" aria-hidden="true" />
            <span className="hud__corner hud__corner--tr" aria-hidden="true" />
            <span className="hud__corner hud__corner--bl" aria-hidden="true" />
            <span className="hud__corner hud__corner--br" aria-hidden="true" />

            <div className="hud__tab">How to play</div>

            <div className="hud__bar">
              <span className="hud__chevrons" aria-hidden="true" />
              <span className="hud__event">{brief?.title ?? node.title ?? 'Up next'}</span>
              <span className="hud__status">
                <span className="hud__dot" aria-hidden="true" />
                briefing
              </span>
              <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
            </div>

            <div className="hud__stage hud__stage--brief">
              {brief && (
                <>
                  <p className="brief__lead">{brief.lead}</p>
                  <ul className="brief__rules">
                    {brief.rules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // The key remounts per node, so answers never carry into the next round.
  if (node.game === 'hallucination') {
    return <HallucinationGame key={nodeIndex} room={room} nodeIndex={nodeIndex} />
  }
  if (node.game === 'data_shadow') {
    return <DataShadowGame key={nodeIndex} room={room} nodeIndex={nodeIndex} />
  }
  if (node.game === 'sabotage') {
    return <SabotageGame key={nodeIndex} room={room} team={team} />
  }
  if (node.type === 'leaderboard') {
    return (
      <div className="stage stage--leaderboard" key={nodeIndex}>
        <span className="stage__kind">leaderboard</span>
        <h2>{node.title ?? 'Standings'}</h2>
        <RoomLeaderboard code={room} section={node.section} />
      </div>
    )
  }
  if (node.type === 'quiz') {
    return (
      <QuizGame key={nodeIndex} room={room} nodeIndex={nodeIndex} />
    )
  }

  const kind = node.game ?? node.type
  const stageClass = node.game ? `stage--${node.type} stage--${node.game}` : `stage--${node.type}`
  return (
    <div className={`stage ${stageClass}`}>
      <span className="stage__kind">{kind}</span>
      <h2>{node.title ?? node.game ?? 'Untitled node'}</h2>
      <p className="stage__note">
        {node.type === 'game'
          ? `Placeholder for the ${node.game} game.`
          : node.type === 'quiz'
            ? 'Placeholder for a quiz round.'
            : 'Placeholder screen.'}
      </p>
    </div>
  )
}

/** How long a finished round keeps its closing screen before signing out. */
const WRAP_UP_MS = 8000

/** The four scored games, in the order the show runs them. */
const GAME_STAGES = ['hallucination', 'data', 'sabotage', 'ultimate'] as const

/**
 * Which game the show is on, 1-4, or null outside the games (welcome, briefs,
 * the activity board, the wrap-up). Briefs name their section, so a rules card
 * already counts as being in its game.
 */
function gameStage(node: FlowNode | null): number | null {
  const section = node?.section ?? node?.score
  const at = GAME_STAGES.indexOf((section ?? '') as (typeof GAME_STAGES)[number])
  return at === -1 ? null : at + 1
}

/**
 * What the operator console's player preview runs as.
 *
 * It has no player row (`playerId: 0` is falsy on purpose), so the preview never
 * joins the room, never picks up a team and can never report a score - it only
 * mirrors what the socket says a player's device is showing.
 */
const PREVIEW_SESSION: PlayerSession = {
  subject: 'preview',
  isAdmin: false,
  canControl: false,
  scope: 'preview',
  playerId: 0,
  nickname: 'player device',
  event: '',
}

export default function PlayPage() {
  // A QR-scanned URL pins a device to a room; `/play` follows the current round.
  const { code: pinned } = useParams()
  const navigate = useNavigate()
  // `?preview=1` is the console's mirror of this screen: same layout, no player.
  const [query] = useSearchParams()
  const preview = query.get('preview') === '1'
  const [session, setSession] = useState<PlayerSession | null>(null)
  const [checked, setChecked] = useState(preview)
  const [resolved, setResolved] = useState<string | null>(null)
  const [eventName, setEventName] = useState('')

  const code = pinned ?? resolved ?? ''

  useGameSocket(code)

  const phase = useGameStore((state) => state.phase)
  const node = useGameStore((state) => state.node)
  const index = useGameStore((state) => state.index)
  const sawPlaying = useGameStore((state) => state.sawPlaying)

  useEffect(() => {
    if (preview) return
    void fetchSession().then((found) => {
      setSession(found && !found.isAdmin && found.nickname ? (found as PlayerSession) : null)
      setChecked(true)
    })
  }, [preview])

  // The event name for the heading comes from the backend's own list, so it can
  // never disagree with the label they picked at sign-in.
  useEffect(() => {
    if (!session) return
    let live = true
    void fetchEvents()
      .then((events) => {
        const match = events.find((option) => option.key === session.event)
        if (live) setEventName(match?.label ?? '')
      })
      .catch(() => {
        // The heading degrades to the brand alone rather than blocking the screen.
      })
    return () => {
      live = false
    }
  }, [session])

  // Nobody scans anything: the device asks which round is current, and keeps
  // asking, so a new round picks everyone up where they are.
  useEffect(() => {
    if (!session || pinned) return
    let live = true
    const pull = () =>
      currentRoom()
        .then((found) => {
          if (live) setResolved(found.code)
        })
        .catch(() => {
          // No round exists yet; the connection dot already says so.
        })
    void pull()
    const id = window.setInterval(() => void pull(), 3000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [session, pinned])

  // Membership is stored server-side, so the roster knows this device is in the
  // room before it has answered anything.
  useEffect(() => {
    if (!session?.playerId || !code) return
    void joinRoom(code).catch(() => {
      // A missing room is not fatal here: the socket reports the same problem.
    })
    // Depends on the player's identity, not the whole session: the team sync
    // below updates `session.team` every second, and that must not re-join -
    // rejoining clears the side server-side.
  }, [session?.playerId, code])

  // Sabotage teams are assigned the moment the main flow reaches that node,
  // which is after this device logged in - so the team is not in the session
  // yet. Re-read it as soon as the game is on screen, and keep asking through
  // the reveal so the side lands before the first card is due.
  const inSabotage = node?.game === 'sabotage'
  useEffect(() => {
    if (!session?.playerId || !inSabotage) return
    let live = true
    const refresh = () => {
      fetchSession()
        .then((found) => {
          if (!live || !found || found.isAdmin || !found.nickname) return
          setSession((prev) =>
            prev && prev.team === found.team
              ? prev
              : ({ ...prev, ...found } as PlayerSession),
          )
        })
        .catch(() => {
          // A transient failure just means the next poll tries again.
        })
    }
    void refresh()
    const id = window.setInterval(refresh, 1000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [session?.playerId, inSabotage])

  // The round is over: show the closing screen, then come back to login so the
  // next round starts from a clean device. A device that logs in *after* the
  // round ended did not play it, so it waits here instead of being bounced
  // straight back to the login page.
  useEffect(() => {
    if (preview || phase !== 'finished' || !sawPlaying) return
    const id = window.setTimeout(() => {
      clearToken()
      navigate('/', { replace: true })
    }, WRAP_UP_MS)
    return () => window.clearTimeout(id)
  }, [preview, phase, sawPlaying, navigate])

  if (!checked) return null
  const me = preview ? PREVIEW_SESSION : session
  if (!me) return <Navigate to="/" replace />

  // A finished round is the signal that this device's round is over - the room
  // and the player are locked together.
  const roomMissing = !pinned && resolved === null
  const stage_ = gameStage(node)

  return (
    <main className="game">
      {phase !== 'waiting' && (
      <header className="game__bar">
        {/* Four flat diamonds, one per game: the filled ones are behind you, the
            red one is where the show is now. It says "how far along" without
            asking anyone to read a node index. */}
        <nav className="game__track" aria-label="Game progress">
          {GAME_STAGES.map((stage, at) => {
            const position = at + 1
            return (
              <span
                key={stage}
                className={`game__seg ${
                  stage_ === position ? 'is-now' : stage_ !== null && position < stage_ ? 'is-done' : ''
                }`}
                aria-current={stage_ === position ? 'step' : undefined}
              />
            )
          })}
        </nav>

        <span className="game__right">
          {me.nickname && <span className="play__who">{me.nickname}</span>}
          {!preview && (
            <button
              type="button"
              className="game__signout"
              onClick={() => {
                clearToken()
                navigate('/', { replace: true })
              }}
            >
              Logout
            </button>
          )}
        </span>
      </header>
      )}

      {roomMissing || (phase === 'waiting' && !code) ? (
        <div className="wait">
          <h1 className="wait__title">
            <span className="wait__brand">AI Cyber Arcade</span>
            <span className="wait__event">{eventName}</span>
          </h1>
          <p className="wait__hi">Between rounds</p>
          <p className="wait__note">Waiting for the host to open the next show…</p>
        </div>
      ) : phase === 'finished' && sawPlaying ? (
        <div className="wait">
          <h1 className="wait__title">
            <span className="wait__brand">AI Cyber Arcade</span>
            <span className="wait__event">{eventName}</span>
          </h1>
          <p className="wait__hi">Thanks for playing</p>
          <p className="wait__note">That's a wrap — signing you out…</p>
        </div>
      ) : phase === 'finished' ? (
        <div className="wait">
          <h1 className="wait__title">
            <span className="wait__brand">AI Cyber Arcade</span>
            <span className="wait__event">{eventName}</span>
          </h1>
          <p className="wait__hi">Between rounds</p>
          <p className="wait__note">Waiting for the host to open the next show…</p>
        </div>
      ) : phase === 'waiting' ? (
        <WaitingRoom nickname={me.nickname} eventName={eventName} />
      ) : (
        <NodeStage node={node} nodeIndex={index} room={code} team={me.team} />
      )}
    </main>
  )
}
