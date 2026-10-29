import { COLOR_GROUPS, FONT_TOKENS, contrastOnBlack, resolveColor } from '../../design/tokens'
import './DesignPage.css'
import './DesignBackground.css'

/** Art in public/, served from the site root. */
const ARTWORK = [
  { src: '/hallucination_icon.PNG', label: 'Hallucination', note: 'game icon' },
  { src: '/data_icon.PNG', label: 'Data Shadow', note: 'game icon' },
  { src: '/sabotage_icon.PNG', label: 'Sabotage', note: 'game icon' },
  { src: '/ultimate_icon.PNG', label: 'Ultimate Quiz', note: 'game icon' },
  { src: '/city_skyline.PNG', label: 'City skyline', note: 'scene' },
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
                Arcade FTW
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
