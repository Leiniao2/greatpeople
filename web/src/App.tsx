import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import LoginPage from '@/pages/LoginPage'
import CollectionPage from '@/pages/CollectionPage'
import BattlePage from '@/pages/BattlePage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth()
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/collection" element={<PrivateRoute><CollectionPage /></PrivateRoute>} />
      <Route path="/battle" element={<PrivateRoute><BattlePage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/collection" replace />} />
    </Routes>
  )
}
