/**
 * The whole report set as one printable document: A4, one report per page, in
 * the same order as the tabs.
 *
 * Print rather than a PDF library. The browser's own "Save as PDF" produces an
 * A4 file with correct page breaks and selectable text for free, where a client
 * side PDF writer would be a new dependency, a second set of table styles and a
 * font problem. Everything here is therefore plain HTML with its own print CSS -
 * it deliberately does not borrow the console's stylesheet, because that one is
 * built for a dark screen and would print as a black rectangle.
 *
 * The data is fetched fresh rather than read off the screen: the printout covers
 * every report, not just the one the operator happens to be looking at.
 */
import {
  fetchEventArchive,
  fetchEventLeaderboard,
  fetchEventOptions,
  fetchEventSummary,
  type EventArchive,
  type EventLeaderboardRow,
  type EventSummary,
} from '../../api'

const number = (value: number): string => value.toLocaleString('en-US')
const oneDecimal = (value: number): string =>
  value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const share = (value: number): string => `${Math.round(value)}%`

/** The names the console uses, repeated here because this module builds its own
 *  markup and importing the component file for a list would drag the whole page
 *  into a print path. */
const GAME_LABELS: Record<string, string> = {
  hallucination: 'Hallucination',
  data: 'Data Shadows',
  sabotage: 'AI Cyber Battle',
  ultimate: 'Ultimate',
}

const STYLES = `
  @page { size: A4 portrait; margin: 14mm 12mm; }
  /* The print dialog ships with "Background graphics" off, which drops every
     background colour - the bars, the legend dots, the column fills. Asking for
     exact adjustment keeps them, and is the only reason the ink charts appear. */
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    margin: 0;
    /* Fluid children fill the content box exactly, so the outermost border sits
       on the boundary and the page box shaves half of it off. An inset keeps it
       inside by construction, whatever margins the dialog applies. */
    padding: 0 2mm;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #16181d;
    font-size: 8.9pt;
    line-height: 1.42;
  }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  h1 { margin: 0 0 1.4mm; font-size: 15pt; letter-spacing: -0.01em; }
  .facts { margin: 0 0 1mm; color: #5a6270; }
  h2 {
    margin: 3.6mm 0 1.4mm;
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #6b7484;
  }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th {
    padding: 1mm 1.4mm;
    border-bottom: 0.5pt solid #ccd2db;
    text-align: left;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6b7484;
    white-space: nowrap;
  }
  td { padding: 0.9mm 1.4mm; border-bottom: 0.4pt solid #e6e9ee; }
  /* Six equal columns, shrinkable to nothing: as flex items a long value ("991.5
     (45%)") keeps its min-content width, pushes the row wider than the paper and
     the last card's right border lands off the page. A grid with minmax(0, 1fr)
     cannot do that. */
  .cards { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 1.8mm; }
  .card {
    min-width: 0;
    padding: 1.6mm 1.4mm;
    border: 0.5pt solid #d7dce4;
    border-radius: 1.6mm;
  }
  .card span {
    display: block;
    font-size: 6.6pt;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #6b7484;
  }
  /* 10pt, not 11: a score carries its share - "2,000 (100%)" - and six cards
     across A4 leave about 26mm each, where 11pt threw that onto a second line. */
  .card b {
    display: block;
    font-size: 10pt;
    font-weight: 500;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .bars { width: 100%; border-collapse: collapse; }
  .bars td.bar { width: 51%; }
  .track { height: 2.4mm; border-radius: 1.2mm; background: #eceff3; }
  .fill { height: 2.4mm; border-radius: 1.2mm; background: #c2352c; }
  .right { text-align: right; }
  /* Two short tables side by side: on the 1.0 page they are the difference
     between fitting one A4 sheet and spilling onto a second. */
  .pair { display: flex; gap: 6mm; }
  .pair > div { flex: 1; min-width: 0; }
  .muted { color: #7a828f; }
  /* A table and its shape side by side, the same pairing the screen uses. */
  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 66mm;
    gap: 5mm;
    align-items: center;
  }
  /* The columns are shorter than eleven table rows: centring them against the
     table keeps the block from looking like it slid off the bottom of the page. */
  .split--columns { grid-template-columns: minmax(0, 1fr) 70mm; }
  .split--columns .columns { height: 40mm; }
  .split--pie { grid-template-columns: minmax(0, 1fr) 64mm; }
  /* Disc left, legend right: the same reading order as the screen's compact pie. */
  .pie { display: flex; align-items: center; gap: 3mm; }
  .pie svg { width: 22mm; height: 22mm; flex: none; }
  .legend { flex: 1 1 auto; min-width: 0; margin: 0; padding: 0; list-style: none; font-size: 6.6pt; }
  .legend li { display: flex; align-items: center; gap: 1.2mm; line-height: 1.55; }
  .legend .dot { width: 2.2mm; height: 2.2mm; border-radius: 0.6mm; flex: none; }
  .legend .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .legend .num { margin-left: auto; color: #5a6270; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .columns { display: flex; align-items: flex-end; gap: 2px; height: 32mm; margin: 0; padding: 0; list-style: none; }
  .column { display: flex; flex: 1; flex-direction: column; align-items: center; gap: 0.8mm; height: 100%; min-width: 0; }
  .column-track { position: relative; width: 100%; flex: 1; }
  .column-bar {
    position: absolute;
    left: 50%;
    bottom: 0;
    width: min(100%, 1.8mm);
    transform: translateX(-50%);
    border-radius: 0.5mm 0.5mm 0 0;
    background: #c2352c;
  }
  .column-value {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 5.6pt;
    line-height: 1;
    color: #6b7484;
    font-variant-numeric: tabular-nums;
  }
  .column-label { font-size: 5.4pt; color: #7a828f; white-space: nowrap; }
`

function cards(items: { label: string; value: string }[]): string {
  return `<div class="cards">${items
    .map((item) => `<div class="card"><span>${item.label}</span><b>${item.value}</b></div>`)
    .join('')}</div>`
}

/** The ink twin of the screen's palette: same hues, darkened for paper. */
const PIE_COLOURS = [
  '#c2352c',
  '#d98324',
  '#2f7d8c',
  '#3f5b8f',
  '#7a5ea8',
  '#4a8a54',
  '#8a9099',
  '#b0557d',
]

/** Shares of a whole, drawn with dashed strokes on one circle: no library, no
 *  conic-gradient (print engines disagree about it), and exact to the byte. */
function pie(slices: { label: string; value: number }[]): string {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  if (total <= 0) return ''
  // The ring must fit inside the 100x100 box: outer radius is r + strokeWidth/2,
  // and at r=40 with a 26 stroke that was 53 - three units past the edge, so the
  // donut came out with four flat sides where the canvas clipped it.
  const radius = 38
  const stroke = 20
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const rings = slices
    .map((slice, index) => {
      const length = (slice.value / total) * circumference
      const ring = `<circle cx="50" cy="50" r="${radius}" fill="none" stroke="${
        PIE_COLOURS[index % PIE_COLOURS.length]
      }" stroke-width="${stroke}" stroke-dasharray="${length.toFixed(2)} ${(
        circumference - length
      ).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" />`
      offset += length
      return ring
    })
    .join('')
  const legend = slices
    .map(
      (slice, index) =>
        `<li><span class="dot" style="background:${
          PIE_COLOURS[index % PIE_COLOURS.length]
        }"></span><span class="label">${slice.label}</span><span class="num">${number(
          slice.value,
        )} · ${share((slice.value / total) * 100)}</span></li>`,
    )
    .join('')
  return `<div class="pie"><svg viewBox="0 0 100 100" role="img" aria-label="share of the whole"><g transform="rotate(-90 50 50)">${rings}</g></svg><ul class="legend">${legend}</ul></div>`
}

/** `1–10%` -> `10`: the column axis takes the band's top edge, never the range.
 *  A dash stranded at the head of a label reads as a minus sign. */
function tick(label: string): string {
  const bounds = label.replace('%', '').split('–')
  return bounds[bounds.length - 1] ?? label
}

/** One thin column per band, the number riding its own bar. */
function columns(bars: { label: string; value: number }[]): string {
  if (bars.length === 0) return ''
  const tallest = Math.max(1, ...bars.map((bar) => bar.value))
  // 86 leaves the tallest bar room for its own number inside the track.
  const height = (value: number) => Math.max(2, (value / tallest) * 86)
  return `<ol class="columns">${bars
    .map(
      (bar) => `<li class="column">
        <span class="column-track">
          <span class="column-bar" style="height:${height(bar.value).toFixed(2)}%"></span>
          <span class="column-value" style="bottom:calc(${height(bar.value).toFixed(
            2,
          )}% + 0.5mm)">${number(bar.value)}</span>
        </span>
        <span class="column-label">${bar.label}</span>
      </li>`,
    )
    .join('')}</ol>`
}

/** Label, bar, value - the same shape the console draws, in ink. */
function bars(
  rows: { label: string; value: number; note?: string }[],
  columns?: [string, string],
): string {
  const busiest = Math.max(1, ...rows.map((row) => row.value))
  const head = columns
    ? `<thead><tr><th style="width:26%">${columns[0]}</th><th class="bar"></th><th class="right" style="width:8%">${columns[1]}</th><th style="width:15%"></th></tr></thead>`
    : ''
  return `<table class="bars">${head}<tbody>${rows
    .map(
      (row) => `<tr>
        <td style="width:26%">${row.label}</td>
        <td class="bar"><div class="track"><div class="fill" style="width:${Math.max(
          1,
          (row.value / busiest) * 100,
        ).toFixed(1)}%"></div></div></td>
        <td class="right" style="width:8%"><b>${number(row.value)}</b></td>
        <td class="muted" style="width:15%">${row.note ?? ''}</td>
      </tr>`,
    )
    .join('')}</tbody></table>`
}

function leaderboardPage(board: EventLeaderboardRow[], scored: number): string {
  if (board.length === 0) return ''
  return `<h2>Leaderboard · top ${board.length} of ${number(scored)} who scored</h2>
    <table><thead><tr><th>#</th><th>Nickname</th><th>Total</th></tr></thead><tbody>${board
      .map(
        (row) =>
          `<tr><td>${row.rank}</td><td>${row.nickname}</td><td>${number(row.total_score)}</td></tr>`,
      )
      .join('')}</tbody></table>`
}

function summaryPage(summary: EventSummary, board: EventLeaderboardRow[]): string {
  const all = summary.by_event
  const games = all
    ? `<table><thead><tr><th>Game</th><th>Total avg</th>${summary.by_event
        ?.map((row) => `<th>${row.short} avg</th>`)
        .join('')}</tr></thead><tbody>${Object.entries(summary.games)
        .filter(([, stat]) => stat.players > 0)
        .map(
          ([key, stat]) => `<tr><td>${GAME_LABELS[key] ?? key}</td><td>${oneDecimal(stat.average)} / ${number(
            stat.max,
          )}</td>${summary
            .by_event!.map((row) => {
              const one = row.games[key]
              return `<td>${one && one.players > 0 ? `${oneDecimal(one.average)}` : '—'}</td>`
            })
            .join('')}</tr>`,
        )
        .join('')}</tbody></table>`
    : `<table><thead><tr><th>Game</th><th>Players</th><th>Average</th><th>Best</th></tr></thead><tbody>${Object.entries(
        summary.games,
      )
        .filter(([, stat]) => stat.players > 0)
        .map(
          ([key, stat]) =>
            `<tr><td>${GAME_LABELS[key] ?? key}</td><td>${number(stat.players)}</td><td>${oneDecimal(
              stat.average,
            )} / ${number(stat.max)}</td><td>${number(stat.best)} / ${number(stat.max)}</td></tr>`,
        )
        .join('')}</tbody></table>`

  const playedBlock = all
    ? `<div class="split split--pie">${bars(
        all.map((row) => ({
          label: row.short,
          value: row.played,
          note: `of ${number(row.players)}`,
        })),
      )}${pie(all.map((row) => ({ label: row.short, value: row.played })))}</div>`
    : summary.registrations_per_day.length > 0
      ? bars(
          summary.registrations_per_day.map((day) => ({
            label: day.date.slice(5),
            value: day.played,
            note: `of ${number(day.count)}`,
          })),
        )
      // A heading over nothing reads as a printing failure, so say why.
      : '<p class="muted">No sign-ups inside this event&rsquo;s dates.</p>'

  const distribution = `<div class="split split--columns"><table><thead><tr><th>Share of a perfect run</th><th>Players</th></tr></thead><tbody>${summary.distribution
    .map((band) => `<tr><td>${band.label}</td><td>${number(band.count)}</td></tr>`)
    .join(
      '',
    )}</tbody></table>${columns(
    summary.distribution.map((band) => ({ label: tick(band.label), value: band.count })),
  )}</div>`

  return `<section class="page">
    <h1>${summary.event.title}</h1>
    ${summary.event.facts ? `<p class="facts">${summary.event.facts}</p>` : ''}
    ${cards([
      { label: 'Registered', value: number(summary.players) },
      { label: 'Played', value: number(summary.played) },
      { label: 'Rounds', value: number(summary.rooms.rounds) },
      { label: 'Size', value: summary.rooms.rounds ? oneDecimal(summary.rooms.average_per_round) : '—' },
      {
        label: 'Average',
        value: `${oneDecimal(summary.score.average)} (${share(summary.score.average_share)})`,
      },
      {
        label: 'Best',
        value: `${number(summary.score.best)} (${share(summary.score.best_share)})`,
      },
    ])}
    <h2>${all ? 'Played per event' : 'Played per day'}</h2>
    ${playedBlock}
    <h2>Games</h2>
    ${games}
    ${all ? `<h2>Score distribution</h2>${distribution}` : leaderboardPage(board, summary.scored)}
  </section>`
}

function archivePage(archive: EventArchive): string {
  const headline = archive.headline
  return `<section class="page">
    <h1>${archive.title}</h1>
    <p class="facts">${archive.tagline}</p>
    ${cards([
      { label: 'Participants', value: number(headline.participants) },
      { label: 'Played', value: number(headline.active_players) },
      { label: 'Countries', value: number(headline.countries) },
      { label: 'Rounds', value: number(headline.rounds) },
      { label: 'Answers', value: number(headline.answers) },
      {
        label: 'Best',
        value: number(archive.leaderboard[0]?.total_score ?? 0),
      },
    ])}
    <h2>Games · each out of 100</h2>
    <table><thead><tr><th>Game</th><th>Players</th><th>Average</th><th>Best</th><th>Of played</th></tr></thead><tbody>${archive.games
      .map(
        (game) =>
          `<tr><td>${game.label}</td><td>${number(game.players)}</td><td>${oneDecimal(
            game.average,
          )}</td><td>${number(game.best)}</td><td>${share(
            (game.players / Math.max(1, headline.active_players)) * 100,
          )}</td></tr>`,
      )
      .join('')}</tbody></table>
    <div class="pair">
      <div>
    <h2>Countries</h2>
    <table><thead><tr><th>Country</th><th>Players</th><th>Share</th></tr></thead><tbody>${archive.countries
      .map(
        (country) =>
          `<tr><td>${country.region}</td><td>${number(country.count)}</td><td>${share(
            (country.count / Math.max(1, headline.participants)) * 100,
          )}</td></tr>`,
      )
      .join('')}</tbody></table>
      </div>
      <div>
    <h2>Played per day</h2>
    ${bars(
      archive.registrations_per_day.map((day) => ({ label: day.date.slice(5), value: day.count })),
      ['Day', 'Sign-ups'],
    )}
      </div>
    </div>
    <h2>Leaderboard · top ten only</h2>
    <table><thead><tr><th>#</th><th>Nickname</th><th>Name</th><th>Country</th><th>Total</th></tr></thead><tbody>${archive.leaderboard
      .map(
        (row) =>
          `<tr><td>${row.rank}</td><td>${row.nickname}</td><td>${row.name}</td><td>${row.region}</td><td>${oneDecimal(
            row.total_score,
          )}</td></tr>`,
      )
      .join('')}</tbody></table>
  </section>`
}

/** Fetch every report and hand the set to the browser's print dialog.
 *
 *  The caller gets the document, not a file: "Save as PDF" in the dialog is what
 *  turns this into the A4 download, with the page breaks already correct.
 */
export async function printAllReports(): Promise<void> {
  const { events } = await fetchEventOptions()
  const pages: string[] = []
  for (const option of events) {
    if (option.source) {
      pages.push(archivePage(await fetchEventArchive(option.key)))
      continue
    }
    const [summary, board] = await Promise.all([
      fetchEventSummary(option.key),
      // The all-time page prints a distribution instead of a board: one list of
      // names spanning three shows is not something a reader can use.
      option.key === 'all' ? Promise.resolve([]) : fetchEventLeaderboard(option.key, 10),
    ])
    pages.push(summaryPage(summary, board))
  }

  const document_ = `<!doctype html><html><head><meta charset="utf-8">
    <title>Arcade reports</title><style>${STYLES}</style></head>
    <body>${pages.join('')}</body></html>`

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  // A4 at 96dpi, off to the side: the print dialog lays the document out on its
  // own paper box, but a frame this size means what the page measures here is
  // what it will measure on paper - which is how "one page per report" is kept
  // honest rather than hoped for. The frame is the *printable* box, not the
  // sheet: A4 (210mm) minus the @page side margins (12mm each) leaves 186mm, so
  // the frame must be 186mm wide or the measurement and the paper disagree and
  // a right-aligned card or chart that fits the frame still falls off the sheet.
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:186mm;height:269mm;border:0;opacity:0'
  document.body.append(frame)
  const view = frame.contentWindow
  if (!view) {
    frame.remove()
    throw new Error('Could not open the print view.')
  }
  view.document.open()
  view.document.write(document_)
  view.document.close()
  // One frame for layout before printing: Safari will otherwise measure the
  // document as empty and print a blank page per report.
  await new Promise((resolve) => window.setTimeout(resolve, 250))
  view.focus()
  view.print()
  frame.remove()
}
