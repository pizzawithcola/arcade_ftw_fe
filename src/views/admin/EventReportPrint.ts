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
  fetchEventOptions,
  fetchEventSummary,
  type EventArchive,
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
  * { box-sizing: border-box; }
  body {
    margin: 0;
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
  }
  td { padding: 0.9mm 1.4mm; border-bottom: 0.4pt solid #e6e9ee; }
  .cards { display: flex; flex-wrap: wrap; gap: 2mm; }
  .card {
    flex: 1 1 24mm;
    padding: 1.5mm 2mm;
    border: 0.5pt solid #d7dce4;
    border-radius: 1.6mm;
  }
  .card b { display: block; font-size: 10.5pt; }
  .card span { font-size: 7.5pt; letter-spacing: 0.06em; text-transform: uppercase; color: #6b7484; }
  .card i { display: block; font-style: normal; font-size: 7.5pt; color: #7a828f; }
  .bars { width: 100%; border-collapse: collapse; }
  .bars td.bar { width: 55%; }
  .track { height: 2.4mm; border-radius: 1.2mm; background: #eceff3; }
  .fill { height: 2.4mm; border-radius: 1.2mm; background: #c2352c; }
  .right { text-align: right; }
  /* Two short tables side by side: on the 1.0 page they are the difference
     between fitting one A4 sheet and spilling onto a second. */
  .pair { display: flex; gap: 6mm; }
  .pair > div { flex: 1; min-width: 0; }
  .muted { color: #7a828f; }
`

function cards(items: { label: string; value: string; note: string }[]): string {
  return `<div class="cards">${items
    .map(
      (item) =>
        `<div class="card"><span>${item.label}</span><b>${item.value}</b><i>${item.note}</i></div>`,
    )
    .join('')}</div>`
}

/** Label, bar, value - the same shape the console draws, in ink. */
function bars(rows: { label: string; value: number; note?: string }[]): string {
  const busiest = Math.max(1, ...rows.map((row) => row.value))
  return `<table class="bars">${rows
    .map(
      (row) => `<tr>
        <td style="width:22%">${row.label}</td>
        <td class="bar"><div class="track"><div class="fill" style="width:${Math.max(
          1,
          (row.value / busiest) * 100,
        ).toFixed(1)}%"></div></div></td>
        <td class="right" style="width:8%"><b>${number(row.value)}</b></td>
        <td class="muted" style="width:15%">${row.note ?? ''}</td>
      </tr>`,
    )
    .join('')}</table>`
}

function summaryPage(summary: EventSummary): string {
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
    ? bars(
        all.map((row) => ({
          label: row.short,
          value: row.played,
          note: `of ${number(row.players)}`,
        })),
      )
    : bars(
        summary.registrations_per_day.map((day) => ({
          label: day.date.slice(5),
          value: day.played,
          note: `of ${number(day.count)}`,
        })),
      )

  const distribution = `<table><thead><tr><th>Share of a perfect run</th><th>Players</th></tr></thead><tbody>${summary.distribution
    .map(
      (band) =>
        `<tr><td>${band.label}</td><td>${number(band.count)}</td></tr>`,
    )
    .join('')}</tbody></table>`

  return `<section class="page">
    <h1>${summary.event.title}</h1>
    ${summary.event.facts ? `<p class="facts">${summary.event.facts}</p>` : ''}
    ${cards([
      { label: 'Registered', value: number(summary.players), note: 'players, all time' },
      {
        label: 'Played',
        value: number(summary.played),
        note: `${share(summary.played_rate * 100)} of them played`,
      },
      { label: 'Rounds', value: number(summary.rooms.rounds), note: 'rooms run' },
      {
        label: 'Size',
        value: summary.rooms.rounds ? oneDecimal(summary.rooms.average_per_round) : '—',
        note: `${number(summary.rooms.participations)} entries`,
      },
      {
        label: 'Average',
        value: `${oneDecimal(summary.score.average)} (${share(summary.score.average_share)})`,
        note: `median ${number(summary.score.median)}`,
      },
      {
        label: 'Best',
        value: `${number(summary.score.best)} (${share(summary.score.best_share)})`,
        note: `lowest ${number(summary.score.lowest)}`,
      },
    ])}
    <h2>${all ? 'Played per event' : 'Played per day'}</h2>
    ${playedBlock}
    <h2>Games</h2>
    ${games}
    ${all ? `<h2>Score distribution</h2>${distribution}` : ''}
  </section>`
}

function archivePage(archive: EventArchive): string {
  const headline = archive.headline
  return `<section class="page">
    <h1>${archive.title}</h1>
    <p class="facts">${archive.tagline}</p>
    ${cards([
      { label: 'Participants', value: number(headline.participants), note: 'signed in' },
      { label: 'Played', value: number(headline.active_players), note: 'active players' },
      { label: 'Countries', value: number(headline.countries), note: 'on the sign-in form' },
      { label: 'Rounds', value: number(headline.rounds), note: 'Ultimate Showdown rooms' },
      { label: 'Answers', value: number(headline.answers), note: `${number(headline.round_players)} players` },
      {
        label: 'Best',
        value: number(archive.leaderboard[0]?.total_score ?? 0),
        note: 'of about 500',
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
    <h2>Registrations per day</h2>
    ${bars(archive.registrations_per_day.map((day) => ({ label: day.date.slice(5), value: day.count })))}
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
    if (option.source) pages.push(archivePage(await fetchEventArchive(option.key)))
    else pages.push(summaryPage(await fetchEventSummary(option.key)))
  }

  const document_ = `<!doctype html><html><head><meta charset="utf-8">
    <title>Arcade reports</title><style>${STYLES}</style></head>
    <body>${pages.join('')}</body></html>`

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  // A4 at 96dpi, off to the side: the print dialog lays the document out on its
  // own paper box, but a frame this size means what the page measures here is
  // what it will measure on paper - which is how "one page per report" is kept
  // honest rather than hoped for.
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0'
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
