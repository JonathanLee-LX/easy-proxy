import { useState, useCallback, useEffect } from 'react'
import type { MockRule } from '@/types'

const MOCKS_UPDATED_EVENT = 'mocksUpdated'

/**
 * Hook for managing mock rules
 */
export function useMocks() {
  const [mockRules, setMockRules] = useState<MockRule[]>([])

  // 监听服务端广播的 Mock 规则变更（如通过 MCP/API 修改后）
  useEffect(() => {
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<MockRule[] | undefined>
      setMockRules(Array.isArray(e.detail) ? e.detail : [])
    }
    window.addEventListener(MOCKS_UPDATED_EVENT, handler)
    return () => window.removeEventListener(MOCKS_UPDATED_EVENT, handler)
  }, [])

  const fetchMocks = useCallback(async () => {
    try {
      const res = await fetch('/api/mocks')
      const data = await res.json()
      setMockRules(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch mocks:', err)
    }
  }, [])

  const createMock = useCallback(async (rule: Omit<MockRule, 'id'>) => {
    try {
      const res = await fetch('/api/mocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      })
      const data = await res.json()
      if (data.status === 'success') {
        setMockRules((prev) => [...prev, data.rule])
        return data.rule as MockRule
      }
      return null
    } catch (err) {
      console.error('Failed to create mock:', err)
      return null
    }
  }, [])

  const updateMock = useCallback(async (id: number, updates: Partial<MockRule>) => {
    try {
      const res = await fetch(`/api/mocks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (data.status === 'success') {
        setMockRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)))
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to update mock:', err)
      return false
    }
  }, [])

  const deleteMock = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/mocks/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.status === 'success') {
        setMockRules((prev) => prev.filter((r) => r.id !== id))
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to delete mock:', err)
      return false
    }
  }, [])

  return {
    mockRules,
    fetchMocks,
    createMock,
    updateMock,
    deleteMock,
  }
}
