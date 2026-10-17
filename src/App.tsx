import { Navigate, Route, Routes } from 'react-router-dom'
import StatusPage from './pages/StatusPage'
import AdminPage from './views/admin/AdminPage'
import DisplayPage from './views/display/DisplayPage'
import LoginPage from './views/user/LoginPage'
import PlayPage from './views/user/PlayPage'

/**
 * Three views, three routes:
 *   /              player entry (nickname + event)
 *   /r/:code       the player's waiting room and the game itself
 *   /display/:code the big screen, read-only
 *   /admin         the operator console
 */
function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/r/:code" element={<PlayPage />} />
      <Route path="/display/:code" element={<DisplayPage />} />
      <Route path="/admin" element={<AdminPage />} />
      {/* Kept as a diagnostic page: it shows the raw API and websocket replies. */}
      <Route path="/status" element={<StatusPage />} />
      {/* Anything else is a client-side route, so send it to the entry point. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
