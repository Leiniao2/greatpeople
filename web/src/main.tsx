import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

// GoogleOAuthProvider crashes when clientId is empty — only mount it when configured.
function Providers({ children }: { children: React.ReactNode }) {
  if (googleClientId) {
    return (
      <GoogleOAuthProvider clientId={googleClientId}>
        {children}
      </GoogleOAuthProvider>
    )
  }
  return <>{children}</>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Providers>
  </React.StrictMode>,
)
