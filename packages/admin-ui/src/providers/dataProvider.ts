import { stringify } from '@refinedev/simple-rest'
import type { DataProvider } from '@refinedev/core'

const API_BASE = '/api/v1'

const token = () => localStorage.getItem('token')
const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token()}`,
})

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: headers(), ...options })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error?.message || `Request failed: ${res.status}`)
  }
  return res.json()
}

interface ApiListResponse { data: unknown[]; meta: { count: number } }
interface ApiOneResponse { data: unknown }

function toListResult(body: ApiListResponse) {
  return { data: body.data, total: body.meta?.count ?? 0 }
}
function toOneResult(body: ApiOneResponse) {
  return { data: body.data }
}

export const dataProvider: DataProvider = {
  getList:    (r) => request<ApiListResponse>(`${API_BASE}/${r.resource}?${stringify(r)}`).then(toListResult),
  getOne:     (r) => request<ApiOneResponse>(`${API_BASE}/${r.resource}/${r.id}`).then(toOneResult),
  create:     (r) => request<ApiOneResponse>(`${API_BASE}/${r.resource}`, { method: 'POST', body: JSON.stringify(r.variables) }).then(toOneResult),
  update:     (r) => request<ApiOneResponse>(`${API_BASE}/${r.resource}/${r.id}`, { method: 'PATCH', body: JSON.stringify(r.variables) }).then(toOneResult),
  deleteOne:  (r) => request<ApiOneResponse>(`${API_BASE}/${r.resource}/${r.id}`, { method: 'DELETE' }).then(toOneResult),
  getApiUrl:  () => API_BASE,
}
