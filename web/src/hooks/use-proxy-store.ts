import { useState, useEffect, useCallback, useRef } from 'react'
import type { ProxyRecord, RecordDetail, RuleItem, MockRule } from '@/types'

const IP_PATTERN = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/
const URL_PATTERN = /^https?:\/\//

function parseEprcRules(text: string): RuleItem[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .flatMap((line) => {
      let enabled = true
      if (line.trimStart().startsWith('//')) {
        enabled = false
        line = line.replace(/^\/\//, '').trim()
      }
      const parts = line.split(/\s+/).filter(Boolean)
      if (parts.length < 2) return []
      const isTargetFirst = IP_PATTERN.test(parts[0]) || URL_PATTERN.test(parts[0])
      if (isTargetFirst) {
        const [target, ...rules] = parts
        return rules.map((rule) => ({ rule, target, enabled }))
      } else {
        const target = parts[parts.length - 1]
        const rules = parts.slice(0, -1)
        return rules.map((rule) => ({ rule, target, enabled }))
      }
    })
}

function rulesToEprc(rules: RuleItem[]): string {
  return rules
    .map((r) => {
      const prefix = r.enabled ? '' : '//'
      return `${prefix}${r.rule} ${r.target}`
    })
    .join('\n')
}

export function useProxyStore() {
  const [records, setRecords] = useState<ProxyRecord[]>([])
  const [rules, setRules] = useState<RuleItem[]>([])
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null)
  const [recordDetail, setRecordDetail] = useState<RecordDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  // Load initial logs
  useEffect(() => {
    fetch('/api/logs')
      .then((res) => res.json())
      .then((json: ProxyRecord[]) => setRecords(json))
      .catch(console.error)
  }, [])

  // WebSocket for real-time updates
  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss://' : 'ws://'
    const ws = new WebSocket(protocol + location.host + '/')
    wsRef.current = ws

    ws.addEventListener('message', (ev) => {
      try {
        const data: ProxyRecord = JSON.parse(ev.data)
        setRecords((prev) => [...prev, data])
      } catch {}
    })

    ws.addEventListener('close', () => {
      console.log('WebSocket closed')
    })

    return () => {
      ws.close()
    }
  }, [])

  // Load rules
  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/rules')
      const text = await res.text()
      setRules(parseEprcRules(text))
    } catch (err) {
      console.error('Failed to fetch rules:', err)
    }
  }, [])

  // Save rules
  const saveRules = useCallback(async (items: RuleItem[]) => {
    try {
      const res = await fetch('/api/rules', {
        method: 'PUT',
        body: rulesToEprc(items),
      })
      const json = await res.json()
      if (json.status === 'success') {
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to save rules:', err)
      return false
    }
  }, [])

  // Fetch detail
  const fetchDetail = useCallback(async (id: number) => {
    setSelectedRecordId(id)
    setDetailLoading(true)
    setRecordDetail(null)
    try {
      const res = await fetch(`/api/logs/${id}`)
      const data = await res.json()
      if (!data.error) {
        setRecordDetail(data)
      }
    } catch (err) {
      console.error('Failed to fetch detail:', err)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const closeDetail = useCallback(() => {
    setSelectedRecordId(null)
    setRecordDetail(null)
  }, [])

  const clearRecords = useCallback(() => {
    setRecords([])
  }, [])

  // ===== Mock 功能 =====
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
    records,
    rules,
    setRules,
    selectedRecordId,
    recordDetail,
    detailLoading,
    fetchRules,
    saveRules,
    fetchDetail,
    closeDetail,
    clearRecords,
    mockRules,
    fetchMocks,
    createMock,
    updateMock,
    deleteMock,
  }
}
