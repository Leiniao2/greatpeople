// Lazily loads the Facebook JS SDK and provides a login helper.

export function initFacebook(): void {
  if (typeof window === 'undefined' || (window as any).FB) return

  ;(window as any).fbAsyncInit = () => {
    ;(window as any).FB.init({
      appId: import.meta.env.VITE_FACEBOOK_APP_ID ?? '',
      version: 'v19.0',
      xfbml: false,
      cookie: true,
    })
  }

  const script = document.createElement('script')
  script.src = 'https://connect.facebook.net/en_US/sdk.js'
  script.async = true
  script.defer = true
  document.body.appendChild(script)
}

export function facebookLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const FB = (window as any).FB
    if (!FB) {
      reject(new Error('Facebook SDK not loaded'))
      return
    }
    FB.login(
      (response: any) => {
        const token = response?.authResponse?.accessToken
        token ? resolve(token) : reject(new Error('Facebook login cancelled'))
      },
      { scope: 'email,public_profile' },
    )
  })
}
