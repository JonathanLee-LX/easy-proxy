import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Save, Trash2, Layers, Filter, X } from 'lucide-react'
import type { RuleItem, RuleSet } from '@/types'

interface RuleConfigProps {
  rules: RuleItem[]
  setRules: React.Dispatch<React.SetStateAction<RuleItem[]>>
  fetchRules: () => Promise<void>
  saveRules?: (items: RuleItem[]) => Promise<boolean>
  /** @deprecated 暂未实现 */
  ruleSets?: RuleSet[]
  /** @deprecated 暂未实现 */
  fetchRuleSets?: () => Promise<void>
  /** @deprecated 暂未实现 */
  saveRuleSet?: (name: string, rules: RuleItem[]) => Promise<RuleSet | null>
  /** @deprecated 暂未实现 */
  switchRuleSet?: (id: number) => Promise<boolean>
  /** @deprecated 暂未实现 */
  deleteRuleSet?: (id: number) => Promise<boolean>
}

export function RuleConfig(props: RuleConfigProps) {
  const { rules, setRules, fetchRules, saveRules } = props
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [mergeByTarget, setMergeByTarget] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null)
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null)
  
  // 筛选相关状态
  const [showFilters, setShowFilters] = useState(false)
  const [ruleFilter, setRuleFilter] = useState('')
  const [targetFilter, setTargetFilter] = useState('')

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const toggleRule = useCallback(
    (index: number) => {
      setRules((prev) => prev.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r)))
    },
    [setRules],
  )

  const updateRule = useCallback(
    (index: number, field: 'rule' | 'target', value: string) => {
      setRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
    },
    [setRules],
  )

  const deleteRule = useCallback(
    (index: number) => {
      setRules((prev) => prev.filter((_, i) => i !== index))
    },
    [setRules],
  )

  const addRule = useCallback(() => {
    const nextIndex = rules.length
    setRules((prev) => [...prev, { enabled: true, rule: '', target: '' }])
    setHighlightIndex(nextIndex)
  }, [rules.length, setRules])

  useEffect(() => {
    if (highlightIndex == null) return
    const raf = requestAnimationFrame(() => {
      highlightRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    const timer = setTimeout(() => setHighlightIndex(null), 1600)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [rules, highlightIndex, mergeByTarget])

  const parseRuleInput = useCallback((value: string) => {
    return value
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean)
  }, [])

  type RuleGroup = {
    key: string
    target: string
    indices: number[]
    rules: string[]
    enabledState: boolean | 'indeterminate'
  }

  // 筛选后的规则列表
  const filteredRules = useMemo(() => {
    if (!ruleFilter && !targetFilter) {
      return rules
    }
    
    const lowerRuleFilter = ruleFilter.toLowerCase()
    const lowerTargetFilter = targetFilter.toLowerCase()
    
    return rules.filter((item) => {
      const matchesRule = !ruleFilter || item.rule.toLowerCase().includes(lowerRuleFilter)
      const matchesTarget = !targetFilter || item.target.toLowerCase().includes(lowerTargetFilter)
      return matchesRule && matchesTarget
    })
  }, [rules, ruleFilter, targetFilter])

  // 获取所有唯一的目标列表（用于下拉筛选）
  const uniqueTargets = useMemo(() => {
    const targets = new Set<string>()
    rules.forEach((item) => {
      if (item.target.trim()) {
        targets.add(item.target.trim())
      }
    })
    return Array.from(targets).sort()
  }, [rules])

  const groupedRules = useMemo<RuleGroup[]>(() => {
    const groups = new Map<string, RuleGroup>()
    filteredRules.forEach((item) => {
      // 需要使用原始索引
      const originalIndex = rules.indexOf(item)
      const normalizedTarget = item.target.trim()
      const key = normalizedTarget === '' ? `__EMPTY__${originalIndex}` : normalizedTarget
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, {
          key,
          target: item.target,
          indices: [originalIndex],
          rules: [item.rule],
          enabledState: item.enabled,
        })
        return
      }
      existing.indices.push(originalIndex)
      existing.rules.push(item.rule)
    })

    return Array.from(groups.values()).map((group) => {
      const enabledCount = group.indices.reduce((count, idx) => count + (rules[idx].enabled ? 1 : 0), 0)
      let enabledState: boolean | 'indeterminate' = false
      if (enabledCount === 0) enabledState = false
      else if (enabledCount === group.indices.length) enabledState = true
      else enabledState = 'indeterminate'
      return { ...group, enabledState }
    })
  }, [filteredRules, rules])

  const toggleGroup = useCallback(
    (indices: number[], enabledState: boolean | 'indeterminate') => {
      const nextEnabled = enabledState === true ? false : true
      const indexSet = new Set(indices)
      setRules((prev) => prev.map((item, idx) => (indexSet.has(idx) ? { ...item, enabled: nextEnabled } : item)))
    },
    [setRules],
  )

  const updateGroupTarget = useCallback(
    (indices: number[], target: string) => {
      const indexSet = new Set(indices)
      setRules((prev) => prev.map((item, idx) => (indexSet.has(idx) ? { ...item, target } : item)))
    },
    [setRules],
  )

  const updateGroupRules = useCallback(
    (indices: number[], input: string) => {
      const nextRules = parseRuleInput(input)
      setRules((prev) => {
        const sorted = [...indices].sort((a, b) => a - b)
        const firstIndex = sorted[0]
        const firstItem = prev[firstIndex]
        if (!firstItem) return prev

        const replacement = (nextRules.length > 0 ? nextRules : ['']).map((rule) => ({
          enabled: firstItem.enabled,
          target: firstItem.target,
          rule,
        }))

        const removeSet = new Set(sorted)
        const result: RuleItem[] = []
        prev.forEach((item, idx) => {
          if (idx === firstIndex) {
            result.push(...replacement)
            return
          }
          if (!removeSet.has(idx)) {
            result.push(item)
          }
        })
        return result
      })
    },
    [parseRuleInput, setRules],
  )

  const deleteGroup = useCallback(
    (indices: number[]) => {
      const removeSet = new Set(indices)
      setRules((prev) => prev.filter((_, idx) => !removeSet.has(idx)))
    },
    [setRules],
  )

  const handleSave = useCallback(async () => {
    if (!saveRules) return
    setSaving(true)
    setSaveStatus('idle')
    const ok = await saveRules(rules)
    setSaving(false)
    setSaveStatus(ok ? 'success' : 'error')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [rules, saveRules])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">代理规则配置</h3>
        <div className="flex items-center gap-2">
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            title="显示/隐藏筛选器"
          >
            <Filter className="h-4 w-4 mr-1" />
            筛选
          </Button>
          <Button
            variant={mergeByTarget ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMergeByTarget((v) => !v)}
            title="将同一目标的规则合并为一条记录"
          >
            <Layers className="h-4 w-4 mr-1" />
            {mergeByTarget ? '已按目标合并' : '按目标合并'}
          </Button>
          <Button variant="outline" size="sm" onClick={addRule}>
            <Plus className="h-4 w-4 mr-1" />
            添加规则
          </Button>
          {saveRules && (
            <>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? '保存中...' : '保存'}
              </Button>
              {saveStatus === 'success' && (
                <span className="text-sm text-green-600 self-center">已保存</span>
              )}
              {saveStatus === 'error' && (
                <span className="text-sm text-red-600 self-center">保存失败</span>
              )}
            </>
          )}
        </div>
      </div>
      
      {showFilters && (
        <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-md">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">筛选规则</label>
            <div className="relative">
              <Input
                value={ruleFilter}
                onChange={(e) => setRuleFilter(e.target.value)}
                placeholder="输入规则名称进行筛选..."
                className="h-9"
              />
              {ruleFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setRuleFilter('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">筛选目标</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  value={targetFilter}
                  onChange={(e) => setTargetFilter(e.target.value)}
                  placeholder="输入目标地址进行筛选..."
                  className="h-9"
                  list="target-list"
                />
                <datalist id="target-list">
                  {uniqueTargets.map((target) => (
                    <option key={target} value={target} />
                  ))}
                </datalist>
                {targetFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setTargetFilter('')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {(ruleFilter || targetFilter) && (
            <div className="self-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRuleFilter('')
                  setTargetFilter('')
                }}
                className="h-9"
              >
                清除筛选
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">启用</TableHead>
              <TableHead>规则</TableHead>
              <TableHead>目标</TableHead>
              <TableHead className="w-16">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  暂无规则，点击"添加规则"开始配置
                </TableCell>
              </TableRow>
            ) : filteredRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  没有匹配的规则，请调整筛选条件
                </TableCell>
              </TableRow>
            ) : (
              mergeByTarget
                ? groupedRules.map((group) => (
                    <TableRow
                      key={group.key}
                      ref={highlightIndex != null && group.indices.includes(highlightIndex) ? highlightRowRef : undefined}
                      className={highlightIndex != null && group.indices.includes(highlightIndex) ? 'bg-amber-100/60 dark:bg-amber-500/20 transition-colors' : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={group.enabledState}
                          onCheckedChange={() => toggleGroup(group.indices, group.enabledState)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={group.rules.filter(Boolean).join(' ')}
                          onChange={(e) => updateGroupRules(group.indices, e.target.value)}
                          placeholder="example.com api.example.com"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={group.target}
                          onChange={(e) => updateGroupTarget(group.indices, e.target.value)}
                          placeholder="127.0.0.1:3000"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteGroup(group.indices)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                : filteredRules.map((item) => {
                    const index = rules.indexOf(item)
                    return (
                      <TableRow
                        key={index}
                        ref={highlightIndex === index ? highlightRowRef : undefined}
                        className={highlightIndex === index ? 'bg-amber-100/60 dark:bg-amber-500/20 transition-colors' : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            checked={item.enabled}
                            onCheckedChange={() => toggleRule(index)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.rule}
                            onChange={(e) => updateRule(index, 'rule', e.target.value)}
                            placeholder="example.com"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.target}
                            onChange={(e) => updateRule(index, 'target', e.target.value)}
                            placeholder="127.0.0.1:3000"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteRule(index)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
            )}
          </TableBody>
        </Table>
      </div>
      
      {(ruleFilter || targetFilter) && filteredRules.length > 0 && (
        <div className="text-sm text-muted-foreground">
          显示 {filteredRules.length} / {rules.length} 条规则
        </div>
      )}
    </div>
  )
}
