import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App'
import { adoptTokenFromFragment } from './bridge/native'

// A native app opening /play/… passes its session as #token=…; it must be in
// storage before the auth store reads it.
adoptTokenFromFragment()

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

// Pages are code-split with hashed filenames.  A tab left open across a deploy
// asks for chunks that no longer exist; reload so it picks up the new build
// instead of showing a blank page.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  window.location.reload()
})

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
