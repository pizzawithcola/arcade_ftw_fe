/** A leading mark on a report row so the player can tell a phrase from a
 *  picture without reading the label again. */
export function ReportKindIcon({ kind }: { kind: 'text' | 'image' }) {
  if (kind === 'image') {
    return (
      <svg
        className="report__kind"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.7" cy="10.3" r="1.5" />
        <path d="M4 17.2 9.4 12l3.5 3.4L16.2 12l3.8 3.6" />
      </svg>
    )
  }
  return (
    <svg className="report__kind" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 7h14M5 12h14M5 17h9" />
    </svg>
  )
}
