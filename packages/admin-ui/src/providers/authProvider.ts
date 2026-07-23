import type { AuthProvider } from '@refinedev/core'

const TOKEN_KEY = 'token'
const API_BASE = '/api/v1'

const getToken = (): string | null => localStorage.getItem(TOKEN_KEY)
const setToken = (token: string): void => { localStorage.setItem(TOKEN_KEY, token) }
const removeToken = (): void => { localStorage.removeItem(TOKEN_KEY) }

const headers = (): Record<string, string> => {
  const t = getToken()
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: headers(), ...options })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw Object.assign(new Error(body.error?.message ?? 'Request failed'), { statusCode: res.status })
  }
  return res.json() as Promise<T>
}

interface LoginParams {
  email: string
  password: string
}

export const authProvider: AuthProvider = {
  login: async (params: LoginParams) => {
    try {
      const body = await request<{ data: { token: string } }>(`${API_BASE}/auth/login`, {
        method: 'POST',
        body: JSON.stringify(params),
      })
      setToken(body.data.token)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Login failed'),
      }
    }
  },

  logout: async () => {
    removeToken()
    return { success: true }
  },

  check: async () => {
    const token = getToken()
    if (token) return { authenticated: true }
    // ponytail: fast gate only; App.tsx 3-state auth + dataProvider 401 interceptor handle real validation
    return { authenticated: false, redirectTo: '/login', logout: true }
  },

  getPermissions: async (): Promise<unknown> => {
    const t = getToken()
    if (!t) return []
    try {
      const res = await request<{ data: { permissions?: string[] } }>(`${API_BASE}/auth/me`)
      return res.data?.permissions ?? []
    } catch {
      return []
    }
  },

  onError: async (error) => {
    if (error?.statusCode === 401 || error?.message?.includes('Unauthorized')) {
      removeToken()
      return { redirectTo: '/login', logout: true }
    }
    return { error }
  },
}
