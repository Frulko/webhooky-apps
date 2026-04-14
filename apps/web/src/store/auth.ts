import { create } from 'zustand'
import api from '@/lib/api'

interface User {
  id: string
  email: string
  role: 'admin' | 'user'
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: !!localStorage.getItem('token'), // true if we have a token to verify

  login: async (email, password) => {
    set({ isLoading: true })
    const res = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', res.data.token)
    localStorage.setItem('refreshToken', res.data.refreshToken)
    set({ token: res.data.token, user: res.data.user, isLoading: false })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    set({ user: null, token: null })
  },

  fetchMe: async () => {
    set({ isLoading: true })
    try {
      const res = await api.get('/auth/me')
      set({ user: res.data, isLoading: false })
    } catch {
      set({ user: null, token: null, isLoading: false })
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
    }
  },
}))
