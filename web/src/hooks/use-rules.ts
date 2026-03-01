import { useState, useCallback } from 'react'
import type { RuleItem, RuleSet } from '@/types'
import { parseEprcRules, rulesToEprc } from '@/utils/eprc-parser'

/**
 * Hook for managing proxy rules and rule sets
 */
export function useRules() {
  const [rules, setRules] = useState<RuleItem[]>([])
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([])

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

  // Load rules from file (支持文件路径或文件内容)
  const loadRulesFromFile = useCallback(async (filePath: string, fileContent?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // 如果提供了文件内容，发送到后端
      if (fileContent !== undefined) {
        const res = await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath, content: fileContent }),
        })
        const json = await res.json()
        if (json.status === 'success') {
          await fetchRules()
          return { success: true }
        }
        return { success: false, error: json.error }
      }

      // 旧模式：通过文件路径加载
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      })
      const json = await res.json()
      if (json.status === 'success') {
        await fetchRules()
        return { success: true }
      }
      return { success: false, error: json.error }
    } catch (err) {
      console.error('Failed to load rules from file:', err)
      return { success: false, error: String(err) }
    }
  }, [fetchRules])

  // Rule sets management
  const fetchRuleSets = useCallback(async () => {
    try {
      const res = await fetch('/api/rule-sets')
      const data = await res.json()
      setRuleSets(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch rule sets:', err)
    }
  }, [])

  const saveRuleSet = useCallback(async (name: string, items: RuleItem[]) => {
    try {
      const res = await fetch('/api/rule-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, rules: items }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        setRuleSets((prev) => [...prev, data.ruleSet])
        return data.ruleSet as RuleSet
      }
      return null
    } catch (err) {
      console.error('Failed to save rule set:', err)
      return null
    }
  }, [])

  const switchRuleSet = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/rule-sets/${id}/switch`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.status === 'success') {
        await fetchRules()
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to switch rule set:', err)
      return false
    }
  }, [fetchRules])

  const deleteRuleSet = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/rule-sets/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.status === 'success') {
        setRuleSets((prev) => prev.filter((rs) => rs.id !== id))
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to delete rule set:', err)
      return false
    }
  }, [])

  return {
    rules,
    setRules,
    fetchRules,
    saveRules,
    loadRulesFromFile,
    ruleSets,
    fetchRuleSets,
    saveRuleSet,
    switchRuleSet,
    deleteRuleSet,
  }
}
