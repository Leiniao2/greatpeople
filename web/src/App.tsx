import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import LoginPage from '@/pages/LoginPage'
import CollectionPage from '@/pages/CollectionPage'
import CardDetailPage from '@/pages/CardDetailPage'
import BattlePage from '@/pages/BattlePage'
import EpicPage from '@/pages/EpicPage'
import ProfilePage from '@/pages/ProfilePage'
import MainLayout from '@/pages/MainLayout'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isGuest } = useAuth()
  return (isLoggedIn || isGuest) ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public routes — no tab bar */}
      <Route path="/login" element={<LoginPage />} />

      {/* Full-screen detail — private, no tab bar */}
      <Route path="/card/:id" element={<PrivateRoute><CardDetailPage /></PrivateRoute>} />

      {/* Tab-bar layout — all protected */}
      <Route
        element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }>
        <Route index element={<Navigate to="/collection" replace />} />
        <Route path="/epic"       element={<EpicPage />} />
        <Route path="/collection" element={<CollectionPage />} />
        <Route path="/battle"     element={<BattlePage />} />
        <Route path="/profile"    element={<ProfilePage />} />
        <Route path="*"           element={<Navigate to="/collection" replace />} />
      </Route>
    </Routes>
  )
}
