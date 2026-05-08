import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

type Tab = 'login' | 'register'

// Decorative background card definitions
const BG_CARDS = [
  { cls: 'top-[6%]  left-[5%]  rotate-[-20deg] animate-float',       bg: 'from-amber-900/40  to-slate-900/10' },
  { cls: 'top-[18%] left-[2%]  rotate-[-13deg] animate-float-slow',  bg: 'from-yellow-800/30 to-slate-900/10' },
  { cls: 'top-[6%]  right-[5%] rotate-[20deg]  animate-float-slow',  bg: 'from-indigo-900/40 to-slate-900/10' },
  { cls: 'top-[18%] right-[2%] rotate-[13deg]  animate-float',       bg: 'from-violet-900/30 to-slate-900/10' },
  { cls: 'bottom-[8%]  left-[7%]  rotate-[-10deg] animate-float',    bg: 'from-amber-800/25  to-slate-900/10' },
  { cls: 'bottom-[8%]  right-[7%] rotate-[10deg]  animate-float-slow',bg: 'from-indigo-800/25 to-slate-900/10' },
]

export default function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const switchTab = (t: Tab) => { setTab(t); setError('') }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (tab === 'register' && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(email, password)
      } else {
        await register(email, password, displayName)
      }
      navigate('/collection')
    } catch {
      setError(tab === 'login' ? 'Invalid email or password.' : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-[#080812] flex items-center justify-center overflow-hidden p-4">

      {/* ── Ambient glow orbs ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/3 left-1/3  w-[500px] h-[500px] rounded-full bg-amber-600/10  blur-[140px]" />
        <div className="absolute bottom-1/3 right-1/3 w-[500px] h-[500px] rounded-full bg-indigo-700/10 blur-[140px]" />
      </div>

      {/* ── Floating decorative cards ── */}
      {BG_CARDS.map((c, i) => (
        <div
          key={i}
          className={`deco-card bg-gradient-to-br ${c.bg} ${c.cls}`}
          style={{ animationDelay: `${i * 0.8}s` }}
        />
      ))}

      {/* ── Main panel ── */}
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="glass rounded-3xl shadow-[0_32px_64px_rgba(0,0,0,0.5)] overflow-hidden">

          {/* Header */}
          <div className="px-8 pt-9 pb-7 text-center border-b border-white/[0.06]">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <span className="text-amber-400 text-4xl leading-none select-none">♛</span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-[0.12em] text-white uppercase mb-1.5">
              Great People
            </h1>
            <p className="text-slate-500 text-[11px] tracking-[0.28em] uppercase">
              Collect · Battle · Conquer
            </p>
          </div>

          <div className="px-8 py-7">

            {/* Tab pill switcher */}
            <div className="flex rounded-xl p-1 mb-7 gap-1"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {(['login', 'register'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    tab === t
                      ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t === 'login' ? 'Sign In' : 'Register'}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {tab === 'register' && (
                <Field label="Display Name">
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </Field>
              )}

              <Field label="Email">
                <input
                  type="email"
                  className="auth-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>

              <Field label="Password">
                <input
                  type="password"
                  className="auth-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>

              {tab === 'register' && (
                <Field label="Confirm Password">
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </Field>
              )}

              {error && (
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm text-red-300"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <span className="shrink-0 text-base">⚠</span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-1 py-3.5 rounded-xl font-bold text-sm tracking-wide text-slate-950
                           bg-amber-500 hover:bg-amber-400 active:bg-amber-600
                           disabled:opacity-50 disabled:cursor-not-allowed
                           shadow-lg shadow-amber-500/25 hover:shadow-amber-400/40
                           transition-all duration-200"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Please wait…
                  </span>
                ) : (
                  tab === 'login' ? 'Sign In  →' : 'Create Account  →'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-slate-600 text-xs">
              {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => switchTab(tab === 'login' ? 'register' : 'login')}
                className="text-amber-500 hover:text-amber-400 transition-colors font-semibold"
              >
                {tab === 'login' ? 'Register' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
        {label}
      </label>
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
  )
}
