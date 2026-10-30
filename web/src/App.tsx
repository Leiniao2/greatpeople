import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useStoryProgress } from '@/hooks/useStoryProgress'
import LoadingScreen from '@/components/LoadingScreen'
import LoginPage from '@/pages/LoginPage'

// Every page except Login is its own chunk, so the first paint only ships the
// code for the route being opened.
const HomePage          = lazy(() => import('@/pages/HomePage'))
const CollectionPage    = lazy(() => import('@/pages/CollectionPage'))
const CardDetailPage    = lazy(() => import('@/pages/CardDetailPage'))
const BattlePage        = lazy(() => import('@/pages/BattlePage'))
const EpicPage          = lazy(() => import('@/pages/EpicPage'))
const ProfilePage       = lazy(() => import('@/pages/ProfilePage'))
const MiniChallengePage = lazy(() => import('@/pages/MiniChallengePage'))
const MainLayout        = lazy(() => import('@/pages/MainLayout'))
const PlayStoryPage     = lazy(() => import('@/pages/PlayPage').then(m => ({ default: m.PlayStoryPage })))
const PlayChallengePage = lazy(() => import('@/pages/PlayPage').then(m => ({ default: m.PlayChallengePage })))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isGuest } = useAuth()
  return (isLoggedIn || isGuest) ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const isLoggedIn = useAuth(s => s.isLoggedIn)
  const pullAndMerge = useStoryProgress(s => s.pullAndMerge)
  // Merge the server's copy of story progress whenever a session starts.
  useEffect(() => { if (isLoggedIn) void pullAndMerge() }, [isLoggedIn, pullAndMerge])

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Public routes — no tab bar */}
        <Route path="/login" element={<LoginPage />} />

        {/* Home — private, full-screen landing, no tab bar */}
        <Route path="/home" element={<PrivateRoute><HomePage /></PrivateRoute>} />

        {/* Full-screen detail — private, no tab bar */}
        <Route path="/card/:id" element={<PrivateRoute><CardDetailPage /></PrivateRoute>} />

        {/* Full-screen play routes, also used inside the native apps' WebViews */}
        <Route path="/play/story/:slug" element={<PrivateRoute><PlayStoryPage /></PrivateRoute>} />
        <Route path="/play/challenge/:id" element={<PrivateRoute><PlayChallengePage /></PrivateRoute>} />

        {/* Tab-bar layout — all protected */}
        <Route
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="/epic"       element={<EpicPage />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route path="/battle"     element={<BattlePage />} />
          <Route path="/arcade"     element={<MiniChallengePage />} />
          <Route path="/profile"    element={<ProfilePage />} />
          <Route path="*"           element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
