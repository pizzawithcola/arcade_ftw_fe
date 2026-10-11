import { Navigate, Route, Routes } from 'react-router-dom'
import GamePage from './pages/GamePage'
import LoginPage from './pages/LoginPage'
import StatusPage from './pages/StatusPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Kept as a diagnostic page: it shows the raw API and websocket replies. */}
      <Route path="/status" element={<StatusPage />} />
      <Route path="/" element={<GamePage />} />
      {/* Anything else is a client-side route, so send it to the show. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
