/**
 * Thin API client for AUDEBase backend.
 *
 * @audebase/admin-ui
 */

const API_URL = import.meta.env.VITE_API_URL ?? ''

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

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method: 'PUT' }
  if (body !== undefined) {
    opts.body = JSON.stringify(body)
  }
  return request<T>(path, opts)
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}
export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? (typeof import.meta !== 'undefined' ? (import.meta as Record<string,unknown>).env?.VITE_API_URL as string ?? '' : '');
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  setToken(token: string | null, refreshToken?: string): void {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    if (refreshToken !== undefined) {
      if (refreshToken) {
        localStorage.setItem(REFRESH_KEY, refreshToken);
      } else {
        localStorage.removeItem(REFRESH_KEY);
      }
    }
  }

  getTenantId(): string {
    return localStorage.getItem(TENANT_KEY) ?? 'system';
  }

  setTenantId(id: string): void {
    localStorage.setItem(TENANT_KEY, id);
  }

  async get<T>(path: string): Promise<T> {
    return apiGet<T>(path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return apiPost<T>(path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return apiPut<T>(path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return apiDelete<T>(path);
  }
}

export const apiClient = new ApiClient();

