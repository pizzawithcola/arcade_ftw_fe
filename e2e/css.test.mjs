/**
 * The stylesheets have to be structurally sound before they are shipped.
 *
 * Vite serves each CSS module as its own `<style>` tag in development, so the
 * browser closes an unterminated block at the end of that file and nothing looks
 * wrong. The production bundle concatenates every sheet into one, and an
 * unterminated block there does not stop at a file boundary - it swallows every
 * rule that follows it.
 *
 * That is exactly what happened: `Welcome.css` lost the closing brace of its
 * `@media (prefers-reduced-motion: reduce)` block, which quietly nested
 * `PlayPage.css` inside that media query. Reduced motion is off on the kiosks, so
 * the player page shipped with no page layout at all - `main.game` computed to
 * `display: block` and every screen stacked at the top of the viewport - while
 * `npm run dev` looked perfect.
 *
 * Two checks, both cheap and both about that failure:
 *   1. every source sheet balances its braces;
 *   2. every sheet that opens an at-rule closes it, so a rule cannot leak past
 *      the end of its own file.
 */
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

// `fileURLToPath`, not `.pathname`: this workspace lives under a path with a
// space in it, and the raw URL escapes it to %20.
const SRC = fileURLToPath(new URL('../src/', import.meta.url))

async function cssFiles(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await cssFiles(path)))
    else if (entry.name.endsWith('.css')) found.push(path)
  }
  return found
}

/** Braces outside comments - a comment may legitimately mention either one. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

test('every stylesheet balances its braces', async () => {
  const files = await cssFiles(SRC)
  assert.ok(files.length > 0, 'no stylesheets found')
  for (const file of files) {
    const css = stripComments(await readFile(file, 'utf8'))
    const opens = (css.match(/\{/g) ?? []).length
    const closes = (css.match(/\}/g) ?? []).length
    assert.equal(
      opens,
      closes,
      `${file.replace(SRC, 'src/')} has ${opens} { and ${closes} } - a block is left open, and in the production bundle that swallows every rule after it`,
    )
  }
})

test('no stylesheet leaves an at-rule open at its last line', async () => {
  const files = await cssFiles(SRC)
  for (const file of files) {
    const lines = stripComments(await readFile(file, 'utf8')).split('\n')
    let depth = 0
    for (const line of lines) {
      depth += (line.match(/\{/g) ?? []).length
      depth -= (line.match(/\}/g) ?? []).length
    }
    assert.equal(depth, 0, `${file.replace(SRC, 'src/')} ends at brace depth ${depth}`)
  }
})
