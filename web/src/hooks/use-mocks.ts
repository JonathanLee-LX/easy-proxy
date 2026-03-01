import { useState, useCallback } from 'react'
import type { MockRule } from '@/types'

/**
 * Hook for managing mock rules
 */
export function useMocks() {
  const [mockRules, setMockRules] = useState<MockRule[]>([])

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
