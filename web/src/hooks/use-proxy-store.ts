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
  const [maxRecords, setMaxRecords] = useState(1000)
  const maxRecordsRef = useRef(maxRecords)
  maxRecordsRef.current = maxRecords
  const wsRef = useRef<WebSocket | null>(null)

  // Load initial logs
  useEffect(() => {
    fetch('/api/logs')
      .then((res) => res.json())
      .then((json: ProxyRecord[]) => setRecords(json))
      .catch(console.error)
  }, [])

  // WebSocket for real-time updates with reconnection
  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 10
    const BASE_RECONNECT_DELAY = 1000

    const connectWebSocket = () => {
      const protocol = location.protocol === 'https:' ? 'wss://' : 'ws://'
      const ws = new WebSocket(protocol + location.host + '/')

      ws.addEventListener('message', (ev) => {
        try {
          const data: ProxyRecord = JSON.parse(ev.data)
          setRecords((prev) => {
            const newRecords = [data, ...prev]
            return newRecords.slice(0, maxRecordsRef.current)
          })
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e)
        }
      })

      ws.addEventListener('error', (ev) => {
        console.error('WebSocket error:', ev)
      })

      ws.addEventListener('close', () => {
        console.log('WebSocket closed')
        wsRef.current = null

        // Exponential backoff reconnection
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000)
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`)
          reconnectTimeout = setTimeout(() => {
            reconnectAttempts++
            connectWebSocket()
          }, delay)
        } else {
          console.error('Max reconnection attempts reached')
        }
      })

      ws.addEventListener('open', () => {
        console.log('WebSocket connected')
        reconnectAttempts = 0 // Reset on successful connection
      })

      wsRef.current = ws
    }

    connectWebSocket()

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
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
    maxRecords,
    setMaxRecords,
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
