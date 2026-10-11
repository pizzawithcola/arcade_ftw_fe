import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import './StatusPage.css'

type State = 'pending' | 'ok' | 'fail'

interface Check {
  label: string
  state: State
  detail: string
}

const websocketUrl = () =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`

function StatusPage() {
  const [checks, setChecks] = useState<Check[]>([
    { label: 'GET /health', state: 'pending', detail: 'checking…' },
    { label: 'GET /health/db', state: 'pending', detail: 'checking…' },
  ])
  const [socket, setSocket] = useState<{ state: string; messages: string[] }>({
    state: 'connecting…',
    messages: [],
  })
  const phase = useGameStore((store) => store.phase)
  const current = useGameStore((store) => store.node)

  useEffect(() => {
    let cancelled = false

    const probe = async (index: number, path: string) => {
      try {
        const response = await fetch(path)
        const body = await response.text()
        if (cancelled) return
        setChecks((previous) =>
          previous.map((check, i) =>
            i === index
              ? {
                  ...check,
                  state: response.ok ? 'ok' : 'fail',
                  detail: `HTTP ${response.status} · ${response.headers.get('content-type') ?? 'no content-type'}\n${body}`,
                }
              : check,
          ),
        )
      } catch (error) {
        if (cancelled) return
        setChecks((previous) =>
          previous.map((check, i) =>
            i === index
              ? { ...check, state: 'fail', detail: `network error: ${String(error)}` }
              : check,
          ),
        )
      }
    }

    void probe(0, '/health')
    void probe(1, '/health/db')

    const ws = new WebSocket(websocketUrl())
    ws.onopen = () => setSocket((s) => ({ ...s, state: 'open' }))
    ws.onmessage = (event) => {
      const raw = String(event.data)
      setSocket((s) => ({ ...s, messages: [...s.messages, raw].slice(-3) }))
      // Every message goes through the store, the same entry point the real
      // gameplay screens will use.
      try {
        useGameStore.getState().applyMessage(JSON.parse(raw))
      } catch {
        // Not JSON; the raw message is already shown above.
      }
    }
    ws.onerror = () => setSocket((s) => ({ ...s, state: 'error' }))
    ws.onclose = () =>
      setSocket((s) => ({ ...s, state: s.state === 'error' ? s.state : 'closed' }))

    return () => {
      cancelled = true
      ws.close()
    }
  }, [])

  const socketClass = socket.state === 'open' ? 'ok' : socket.state === 'error' ? 'fail' : ''

  return (
    <main className="status">
      <h1>Arcade FTW</h1>
      <p className="muted">
        Same-origin smoke test against <code>{location.host}</code>. This page and the API
        share one CloudFront hostname, so there is no CORS involved.
      </p>

      {checks.map((check) => (
        <section key={check.label} className={`card ${check.state}`}>
          <header>
            <span className={`dot ${check.state}`} />
            <code>{check.label}</code>
          </header>
          <pre>{check.detail}</pre>
        </section>
      ))}

      <section className={`card ${socketClass}`}>
        <header>
          <span className={`dot ${socketClass}`} />
          <code>WS /api/ws</code>
          <span className="muted">· {socket.state}</span>
        </header>
        <pre>
          {`phase:   ${phase}\ncurrent: ${current ? JSON.stringify(current) : '—'}\n\n`}
          {socket.messages.length ? socket.messages.join('\n') : 'waiting for the state snapshot…'}
        </pre>
      </section>
    </main>
  )
}

export default StatusPage
