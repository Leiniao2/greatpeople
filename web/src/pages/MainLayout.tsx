import { Outlet, useNavigate, useLocation } from 'react-router-dom'

const TABS = [
  { path: '/epic',       label: 'Epic',       icon: '⚡', title: 'Epic — Read stories and unlock Great People cards through quizzes and mini-challenges' },
  { path: '/collection', label: 'Collection', icon: '♛', title: 'Collection — Browse and manage all the Great People cards you have unlocked' },
  { path: '/battle',     label: 'Fight',      icon: '⚔', title: 'Fight — Deploy your cards across history\'s greatest cities and battle other players' },
  { path: '/arcade',     label: 'Arcade',     icon: '🎮', title: 'Arcade — Play any mini-challenge freely, without going through a story' },
  { path: '/profile',    label: 'Profile',    icon: '◉', title: 'Profile — View your account, stats, and sign in or out' },
] as const

export default function MainLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div className="flex flex-col min-h-screen bg-[#080812]">
      {/* Page content */}
      <div className="flex-1 pb-20">
        <Outlet />
      </div>

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50
                   bg-[#0d0d1a] border-t border-white/[0.06]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="grid grid-cols-5">
          {TABS.map((tab) => {
            const isActive = pathname === tab.path || pathname.startsWith(tab.path + '/')
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                title={tab.title}
                className={`flex flex-col items-center justify-center gap-1 py-3 transition-colors duration-200
                            ${isActive ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}>
                <span className="text-xl leading-none select-none">{tab.icon}</span>
                <span className="text-[10px] uppercase tracking-widest font-semibold">
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
