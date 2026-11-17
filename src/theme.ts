/**
 * Which of the two themes a screen wears, and how it is put on.
 *
 * The choice is the server's (`app_settings.theme`), broadcast to every screen,
 * because the wall, the iPads and the console have to agree. This module only
 * knows how to *apply* one, plus a local copy of the last known value: the copy
 * is what the inline script in `index.html` reads so a light room does not paint
 * one dark frame before the socket connects.
 */

export type Theme = 'dark' | 'light'

/** Matches the key the anti-flash script in `index.html` reads. */
export const THEME_KEY = 'arcade_ftw_theme'

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    // Private mode or a blocked store: the server will correct it a moment later.
    return 'dark'
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'light') {
    root.dataset.theme = 'light'
  } else {
    // Dark *is* the absence of the attribute: the base stylesheet is the dark
    // theme, so nothing has to be re-applied when the room switches back.
    delete root.dataset.theme
  }
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Same as above: not worth failing over.
  }
}
