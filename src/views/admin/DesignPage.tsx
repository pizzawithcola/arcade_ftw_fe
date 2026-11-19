import { COLOR_GROUPS, FONT_TOKENS, contrastOnBlack, resolveColor } from '../../design/tokens'
import LightPreview from './LightPreview'
import './DesignPage.css'
import './DesignBackground.css'

/** Art in public/, served from the site root. */
const ARTWORK = [
  { src: '/game_icons/hallucination_icon.PNG', label: 'Hallucination', note: 'game icon' },
  { src: '/game_icons/data_icon.PNG', label: 'Data Shadows', note: 'game icon' },
  { src: '/game_icons/sabotage_icon.PNG', label: 'AI Cyber Battle', note: 'game icon' },
  { src: '/game_icons/ultimate_icon.PNG', label: 'Ultimate Quiz', note: 'game icon' },
  { src: '/city_skyline.PNG', label: 'City skyline', note: 'scene' },
]

/** A board edge that reports itself, the way a running agent's panel does. */
const EDGES = [
  {
    key: 'sweep',
    label: 'Sweep',
    detail: 'one arc travelling the edge, 3.4s',
    note: 'The agent-panel read: a single bright head with a tail dying behind it.',
  },
  {
    key: 'twin',
    label: 'Twin',
    detail: 'two arcs, opposite corners',
    note: 'Symmetric, so the eye has no start point. Reads calmer across a wide plate.',
  },
  {
    key: 'breathe',
    label: 'Breathe',
    detail: 'the whole edge, 2.6s in and out',
    note: 'No travel at all - the plate is simply lit. Quietest of the three.',
  },
]

const POC_ROWS = [
  { rank: '01', name: 'Aisha', score: 300 },
  { rank: '02', name: 'Ben', score: 285 },
  { rank: '03', name: 'Chandra', score: 270 },
  { rank: '04', name: 'Dev', score: 255 },
  { rank: '05', name: 'Elena', score: 240 },
]

const POC_TEN = [
  { rank: '01', name: 'Aisha', score: 1420 },
  { rank: '02', name: 'Ben', score: 1310 },
  { rank: '03', name: 'Chandra', score: 1240 },
  { rank: '04', name: 'Dev', score: 1180 },
  { rank: '05', name: 'Elena', score: 1090 },
  { rank: '06', name: 'Farid', score: 980 },
  { rank: '07', name: 'Grace', score: 910 },
  { rank: '08', name: 'Hana', score: 840 },
  { rank: '09', name: 'Ivan', score: 760 },
  { rank: '10', name: 'Jia', score: 690 },
]

export default function DesignPage() {
  return (
    <section className="admin__panel admin__panel--wide design">
      <h2>Palette</h2>

      {COLOR_GROUPS.map((group) => (
        <div className="design__group" key={group.title}>
          <h3>{group.title}</h3>
          <ul className="design__swatches">
            {group.tokens.map((token) => {
              const value = resolveColor(token.cssVar)
              const contrast = contrastOnBlack(value)
              return (
                <li className="design__swatch" key={token.name}>
                  <span
                    className="design__chip"
                    style={{ background: `var(${token.cssVar})` }}
                    aria-hidden="true"
                  />
                  <span className="design__name">{token.name}</span>
                  <code className="design__value">
                    {value}
                    {contrast > 0 && <span className="design__ratio">{contrast.toFixed(2)}</span>}
                  </code>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <div className="design__fonts">
        <h3>Typefaces</h3>
        <ul className="design__font-list">
          {FONT_TOKENS.map((font) => (
            <li className="design__font" key={font.name}>
              <div className="design__font-head">
                <span className="design__font-name">{font.name}</span>
                <code className="design__font-stack">{font.stack.split(',')[0]}</code>
              </div>
              <p className="design__font-sample" style={{ fontFamily: font.stack }}>
                Arcade Fintech Festival
              </p>
              <p className="design__font-role">{font.role}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="design__art">
        <h3>Artwork</h3>
        <div className="design__art-grid">
          {ARTWORK.map((item) => (
            <figure className="design__art-item" key={item.src}>
              <img className="design__art-img" src={item.src} alt={item.label} loading="lazy" />
              <figcaption className="design__art-label">
                <span>{item.label}</span>
                <code>{item.note}</code>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <LightPreview />

      <div className="design__edges">
        <h3>Board edge light · POC</h3>
        <p>
          The leaderboard loses the rail across its top and the red pool behind it. Instead the
          whole plate carries the light, the way a running agent panel does: an arc that travels
          the edge and dies in its own tail. Three candidates below - all three are the same
          panel, only the light moves differently.
        </p>
        <div className="design__edge-grid">
          {EDGES.map((edge) => (
            <figure className={`design__edge design__edge--${edge.key}`} key={edge.key}>
              <div className="poc">
                <div className="poc__rows">
                  {POC_ROWS.map((row) => (
                    <div className="poc__row" key={row.rank}>
                      <span className="poc__fill" style={{ width: `${(row.score / 300) * 100}%` }} />
                      <span className="poc__rank">{row.rank}</span>
                      <span className="poc__name">{row.name}</span>
                      <span className="poc__score">{row.score}</span>
                    </div>
                  ))}
                </div>
              </div>
              <figcaption className="design__edge-label">
                <span>{edge.label}</span>
                <code>{edge.detail}</code>
                <em>{edge.note}</em>
              </figcaption>
            </figure>
          ))}
        </div>

        {/* The same light on a full top ten: the ring is twice the perimeter, so
            the question is whether one arc still reads as travelling rather than
            as a line that happens to be lit somewhere. */}
        <figure className="design__edge design__edge--twin design__edge--ten">
          <div className="poc">
            <div className="poc__rows poc__rows--split">
              {POC_TEN.map((row) => (
                <div className="poc__row" key={row.rank}>
                  <span className="poc__fill" style={{ width: `${(row.score / 1420) * 100}%` }} />
                  <span className="poc__rank">{row.rank}</span>
                  <span className="poc__name">{row.name}</span>
                  <span className="poc__score">{row.score}</span>
                </div>
              ))}
            </div>
          </div>
          <figcaption className="design__edge-label">
            <span>Twin · ten players</span>
            <code>five and five, as the wall draws it</code>
            <em>
              Ten places never fit one column on the wall, so the plate splits - which makes it
              wide and short, and that is the shape the light has to survive.
            </em>
          </figcaption>
        </figure>
      </div>

      <div className="design__backgrounds">
        <h3>Background</h3>
        <p>
          60% black canvas, 30% white type, 10% red. Red is a fill or a rail, never small text:
          #AF000E on black is 2.83:1, but white on deep red is 6.76:1 and it does not glare.
        </p>
        <figure className="design__bg">
          <div className="design__bg-surface" aria-hidden="true">
            <div className="design__demo">
              <span className="design__demo-eyebrow">Section 02 · live</span>
              <strong className="design__demo-title">Hallucination</strong>
              <p className="design__demo-copy">Five statements, one verdict each.</p>
              <div className="design__demo-actions">
                <span className="design__demo-btn">Start round</span>
                <span className="design__demo-btn design__demo-btn--ghost">Details</span>
              </div>
            </div>
          </div>
          <figcaption className="design__bg-label">
            <span>Grid</span>
            <code>40px cells, neutral rules, slow sweep</code>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
