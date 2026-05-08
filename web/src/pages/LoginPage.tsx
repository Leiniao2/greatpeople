import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

type Tab = 'login' | 'register'

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
      setError('Passwords do not match')
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

  const inputClass =
    'w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-colors text-sm'

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-64 -right-64 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-64 -left-64 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700/60 overflow-hidden">

          {/* Top banner */}
          <div className="bg-gradient-to-r from-amber-600/20 to-amber-400/10 border-b border-slate-700/60 px-8 py-6 text-center">
            <div className="text-amber-400 text-4xl leading-none mb-2 select-none">♛</div>
            <h1 className="text-2xl font-bold tracking-wide text-white">Great People</h1>
            <p className="text-slate-400 text-xs mt-1 tracking-widest uppercase">Collect · Battle · Conquer</p>
          </div>

          <div className="px-8 pb-8 pt-6">
            {/* Tabs */}
            <div className="flex mb-6 border-b border-slate-700">
              {(['login', 'register'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`flex-1 pb-3 text-sm font-medium capitalize transition-colors ${
                    tab === t
                      ? 'text-amber-400 border-b-2 border-amber-400 -mb-px'
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
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1.5 uppercase tracking-wide">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    placeholder="Your name"
                    className={inputClass}
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1.5 uppercase tracking-wide">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1.5 uppercase tracking-wide">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className={inputClass}
                />
              </div>

              {tab === 'register' && (
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1.5 uppercase tracking-wide">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="••••••••"
                    className={inputClass}
                  />
                </div>
              )}

              {error && (
                <p className="text-red-400 text-sm flex items-center gap-1.5">
                  <span>⚠</span> {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-semibold py-2.5 rounded-lg transition-colors text-sm tracking-wide"
              >
                {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <p className="mt-5 text-center text-slate-500 text-xs">
              {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => switchTab(tab === 'login' ? 'register' : 'login')}
                className="text-amber-400 hover:text-amber-300 transition-colors"
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
