import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password)
      navigate('/collection')
    } catch {
      setError('Invalid email or password')
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24 }}>
      <h1>Great People</h1>
      <form onSubmit={handleSubmit}>
        <div><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label></div>
        <div><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label></div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">Sign In</button>
      </form>
    </div>
  )
}
