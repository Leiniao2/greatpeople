import axios from 'axios'

export const apiClient = axios.create({ baseURL: '/' })

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (r) => r,
  async (err) => {
    // Only redirect on 401 if there was already a stored token (expired session).
    // During login attempts there is no token yet, so we let the caller handle the error.
    if (err.response?.status === 401 && localStorage.getItem('access_token')) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)
