import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from '@/hooks/useAuth'

type Tab = 'login' | 'register'

const googleConfigured = !!import.meta.env.VITE_GOOGLE_CLIENT_ID

const BG_CARDS = [
  { cls: 'top-[6%] left-[5%] rotate-[-20deg] animate-float',        bg: 'from-amber-900/40 to-slate-900/10' },
  { cls: 'top-[18%] left-[2%] rotate-[-13deg] animate-float-slow',  bg: 'from-yellow-800/30 to-slate-900/10' },
  { cls: 'top-[6%] right-[5%] rotate-[20deg] animate-float-slow',   bg: 'from-indigo-900/40 to-slate-900/10' },
  { cls: 'top-[18%] right-[2%] rotate-[13deg] animate-float',       bg: 'from-violet-900/30 to-slate-900/10' },
  { cls: 'bottom-[8%] left-[7%] rotate-[-10deg] animate-float',     bg: 'from-amber-800/25 to-slate-900/10' },
  { cls: 'bottom-[8%] right-[7%] rotate-[10deg] animate-float-slow',bg: 'from-indigo-800/25 to-slate-900/10' },
]

// useGoogleLogin must only render when GoogleOAuthProvider is in the tree.
// Split into an inner component so the hook is only called when configured.
function GoogleButton({ onToken, disabled }: { onToken: (t: string) => void; disabled: boolean }) {
  const googleLogin = useGoogleLogin({
    onSuccess: ({ access_token }) => onToken(access_token),
    onError: () => onToken(''),
  })
  return (
    <button
      type="button"
      onClick={() => googleLogin()}
      disabled={disabled}
      className="relative flex items-center w-full py-3.5 rounded-xl font-semibold text-sm
                 bg-white hover:bg-slate-50 active:bg-slate-100 text-[#1a1a2e]
                 border border-slate-200 hover:border-slate-300
                 transition-all duration-200 shadow-sm hover:shadow
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="absolute left-4 flex items-center">
        <GoogleIcon />
      </span>
      <span className="w-full text-center">Continue with Google</span>
    </button>
  )
}

export default function LoginPage() {
  const { login, register, ssoLogin, enterGuestMode } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const switchTab = (t: Tab) => { setTab(t); setError('') }
  const succeed = () => navigate('/collection')
  const fail = (msg: string) => setError(msg)

  // ── Email / password ──────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (tab === 'register' && password !== confirm) { fail('Passwords do not match.'); return }
    setLoading(true)
    try {
      tab === 'login'
        ? await login(email, password)
        : await register(email, password, displayName)
      succeed()
    } catch {
      fail(tab === 'login' ? 'Invalid email or password.' : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Google SSO ────────────────────────────────────────────────────
  const handleGoogleToken = async (accessToken: string) => {
    if (!accessToken) { fail('Google sign-in failed. Please try again.'); return }
    setLoading(true)
    try { await ssoLogin('google', accessToken); succeed() }
    catch { fail('Google sign-in failed. Please try again.') }
    finally { setLoading(false) }
  }

  const showSso = googleConfigured
  const inputClass = 'w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 transition-all duration-200 outline-none auth-input'

  return (
    <div className="relative min-h-screen bg-[#080812] flex items-center justify-center overflow-hidden p-4">

      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full bg-amber-600/10 blur-[140px]" />
        <div className="absolute bottom-1/3 right-1/3 w-[500px] h-[500px] rounded-full bg-indigo-700/10 blur-[140px]" />
      </div>

      {/* Floating decorative cards */}
      {BG_CARDS.map((c, i) => (
        <div key={i} className={`deco-card bg-gradient-to-br ${c.bg} ${c.cls}`}
          style={{ animationDelay: `${i * 0.8}s` }} />
      ))}

      {/* Main panel */}
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

            {/* SSO buttons — only rendered when at least one provider is configured */}
            {showSso && (
              <>
                <div className="flex flex-col gap-3 mb-6">
                  <GoogleButton onToken={handleGoogleToken} disabled={loading} />
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-slate-600 text-xs uppercase tracking-widest">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              </>
            )}

            {/* Tab switcher */}
            <div className="flex rounded-xl p-1 mb-6 gap-1"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {(['login', 'register'] as Tab[]).map((t) => (
                <button key={t} type="button" onClick={() => switchTab(t)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    tab === t
                      ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}>
                  {t === 'login' ? 'Sign In' : 'Register'}
                </button>
              ))}
            </div>

            {/* Email / password form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {tab === 'register' && (
                <Field label="Display Name">
                  <input type="text" className={inputClass} placeholder="Your name"
                    value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                </Field>
              )}
              <Field label="Email">
                <input type="email" className={inputClass} placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field label="Password">
                <input type="password" className={inputClass} placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              {tab === 'register' && (
                <Field label="Confirm Password">
                  <input type="password" className={inputClass} placeholder="••••••••"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                </Field>
              )}

              {error && (
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm text-red-300"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <span className="shrink-0">⚠</span>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full mt-1 py-3.5 rounded-xl font-bold text-sm tracking-wide text-slate-950
                           bg-amber-500 hover:bg-amber-400 active:bg-amber-600
                           disabled:opacity-50 disabled:cursor-not-allowed
                           shadow-lg shadow-amber-500/25 hover:shadow-amber-400/40
                           transition-all duration-200">
                {loading ? <LoadingRow /> : tab === 'login' ? 'Sign In  →' : 'Create Account  →'}
              </button>
            </form>

            <p className="mt-6 text-center text-slate-600 text-xs">
              {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button type="button" onClick={() => switchTab(tab === 'login' ? 'register' : 'login')}
                className="text-amber-500 hover:text-amber-400 transition-colors font-semibold">
                {tab === 'login' ? 'Register' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>

        {/* Guest explore */}
        <div className="mt-5 text-center">
          <button type="button"
            onClick={() => { enterGuestMode(); navigate('/collection') }}
            className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
            Explore as Guest →
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  )
}

function LoadingRow() {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="inline-block w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
      Please wait…
    </span>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

