/**
 * Thin API client for AUDEBase backend.
 *
 * @audebase/admin-ui
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

const TOKEN_KEY = 'aude_access_token'
const REFRESH_KEY = 'aude_refresh_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

const TENANT_KEY = 'aude_tenant_id'

export function getTenantId(): string {
  return localStorage.getItem(TENANT_KEY) ?? 'system'
}

export function setTenantId(id: string): void {
  localStorage.setItem(TENANT_KEY, id)
}
export interface ApiError {
  readonly code: string
  readonly message: string
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const tenantId = getTenantId()
  if (tenantId) {
    headers['X-Tenant-Id'] = tenantId
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    clearTokens()
    window.dispatchEvent(new CustomEvent('aude:unauthorized'))
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: 'UNKNOWN', message: res.statusText } }))
    throw new Error(body.error?.message ?? 'Request failed')
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' })
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method: 'POST' }
  if (body !== undefined) {
    opts.body = JSON.stringify(body)
  }
  return request<T>(path, opts)
}
