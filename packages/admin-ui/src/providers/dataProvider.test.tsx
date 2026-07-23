import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('dataProvider', () => {
  beforeEach(() => { mockFetch.mockReset() })

  test('getList transforms {data, meta:{count}} to {data, total}', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: '1' }, { id: '2' }], meta: { count: 42, page: 1, pageSize: 20 } }),
    } as Response)

    const { dataProvider } = await import('./dataProvider')
    const result = await dataProvider.getList({ resource: 'users', pagination: { current: 1, pageSize: 20 } })

    expect(result.total).toBe(42)
    expect(result.data).toHaveLength(2)
  })

  test('getList uses /api/v1 prefix', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: [], meta: { count: 0, page: 1, pageSize: 20 } }),
    } as Response)

    const { dataProvider } = await import('./dataProvider')
    await dataProvider.getList({ resource: 'print_jobs', pagination: { current: 1, pageSize: 10 } })

    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('/api/v1/print_jobs')
  })

  test('update uses PATCH method', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: { id: '1', name: 'updated' } }),
    } as Response)

    const { dataProvider } = await import('./dataProvider')
    await dataProvider.update({ resource: 'users', id: '1', variables: { name: 'updated' } })

    const options = mockFetch.mock.calls[0][1]
    expect(options.method).toBe('PATCH')
  })

  test('401 response triggers redirect to /login', async () => {
    const mockRemoveItem = vi.spyOn(global.localStorage, 'removeItem')
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) } as Response)

    const { dataProvider } = await import('./dataProvider')
    await expect(dataProvider.getOne({ resource: 'users', id: '1' })).rejects.toThrow()
    expect(mockRemoveItem).toHaveBeenCalledWith('token')
    mockRemoveItem.mockRestore()
  })
})
