import { Navigate, Route, Routes } from 'react-router-dom'
import LeaderboardPage from './pages/LeaderboardPage'
import StatusPage from './pages/StatusPage'
import ThemePreview from './views/admin/ThemePreview'
import AdminPage from './views/admin/AdminPage'
import DisplayPage from './views/display/DisplayPage'
import LoginPage from './views/user/LoginPage'
import PlayPage from './views/user/PlayPage'

/**
 * Three views, three routes:
 *   /              player entry (nickname + event)
 *   /r/:code       the player's waiting room and the game itself
 *   /display       the big screen, follows the newest room
 *   /display/:code the big screen pinned to one room
 *   /admin         the operator console
 */
function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/play" element={<PlayPage />} />
      <Route path="/r/:code" element={<PlayPage />} />
      <Route path="/display" element={<DisplayPage />} />
      <Route path="/display/:code" element={<DisplayPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      {/* Kept as a diagnostic page: it shows the raw API and websocket replies. */}
      <Route path="/status" element={<StatusPage />} />
      {/* Every console block on one page, no sign-in. Development only: this is
          how a colour change gets reviewed without a password and a live room. */}
      {import.meta.env.DEV && <Route path="/theme" element={<ThemePreview />} />}
      {/* Anything else is a client-side route, so send it to the entry point. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
