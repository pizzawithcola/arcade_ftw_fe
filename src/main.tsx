import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './design/tokens.css'
import './design/light.css'
import './index.css'
import App from './App.tsx'
import { applyTheme, readStoredTheme } from './theme'

// The inline script in index.html has already painted the stored theme; this
// keeps the module and the attribute in step for the rest of the session.
applyTheme(readStoredTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
