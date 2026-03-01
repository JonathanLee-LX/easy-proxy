import { useEffect, useCallback, useMemo, useRef, useState, memo, useTransition, useDeferredValue } from 'react'
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
import { Plus, Save, Trash2, Layers, Filter, X, GripVertical, ArrowUpToLine } from 'lucide-react'
import type { RuleItem, RuleSet } from '@/types'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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

interface SortableRuleRowProps {
  id: string
  item: RuleItem
  highlighted: boolean
  highlightRef: React.RefObject<HTMLTableRowElement | null>
  onToggle: () => void
  onUpdateRule: (field: 'rule' | 'target', value: string) => void
  onDelete: () => void
  onMoveToTop: () => void
}

// 使用 memo 优化行组件，减少不必要的重渲染
const SortableRuleRow = memo(function SortableRuleRow({
  id,
  item,
  highlighted,
  highlightRef,
  onToggle,
  onUpdateRule,
  onDelete,
  onMoveToTop,
}: SortableRuleRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // 使用 useCallback 稳定回调
  const handleToggle = useCallback(() => {
    onToggle()
  }, [onToggle])

  const handleUpdateRule = useCallback((field: 'rule' | 'target') => (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateRule(field, e.target.value)
  }, [onUpdateRule])

  const handleDelete = useCallback(() => {
    onDelete()
  }, [onDelete])

  const handleMoveToTop = useCallback(() => {
    onMoveToTop()
  }, [onMoveToTop])

  return (
    <TableRow
      ref={(node) => {
        setNodeRef(node)
        if (highlighted && highlightRef) {
          highlightRef.current = node
        }
      }}
      style={style}
      className={highlighted ? 'bg-amber-100/60 dark:bg-amber-500/20 transition-colors' : undefined}
    >
      <TableCell className="w-8 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </TableCell>
      <TableCell className="w-12">
        <Checkbox checked={item.enabled} onCheckedChange={handleToggle} />
      </TableCell>
      <TableCell>
        <Input
          value={item.rule}
          onChange={handleUpdateRule('rule')}
          placeholder="example.com"
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          value={item.target}
          onChange={handleUpdateRule('target')}
          placeholder="127.0.0.1:3000"
          className="h-8"
        />
      </TableCell>
      <TableCell className="w-24">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMoveToTop}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
            title="置顶"
          >
            <ArrowUpToLine className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}, (prevProps, nextProps) => {
  // 自定义比较函数：只有当这些属性变化时才重渲染
  return (
    prevProps.item === nextProps.item &&
    prevProps.highlighted === nextProps.highlighted &&
    prevProps.id === nextProps.id
  )
})

// 筛选模式下的行组件（不使用拖拽）
interface FilteredRuleRowProps {
  item: RuleItem
  highlighted: boolean
  highlightRef: React.RefObject<HTMLTableRowElement | null>
  onToggle: () => void
  onUpdateRule: (field: 'rule' | 'target', value: string) => void
  onDelete: () => void
  onMoveToTop: () => void
}

const FilteredRuleRow = memo(function FilteredRuleRow({
  item,
  highlighted,
  highlightRef,
  onToggle,
  onUpdateRule,
  onDelete,
  onMoveToTop,
}: FilteredRuleRowProps) {
  const handleToggle = useCallback(() => onToggle(), [onToggle])
  const handleUpdateRule = useCallback((field: 'rule' | 'target') => (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateRule(field, e.target.value)
  }, [onUpdateRule])
  const handleDelete = useCallback(() => onDelete(), [onDelete])
  const handleMoveToTop = useCallback(() => onMoveToTop(), [onMoveToTop])

  return (
    <TableRow
      ref={highlighted ? highlightRef : undefined}
      className={highlighted ? 'bg-amber-100/60 dark:bg-amber-500/20 transition-colors' : undefined}
    >
      <TableCell>
        <Checkbox checked={item.enabled} onCheckedChange={handleToggle} />
      </TableCell>
      <TableCell>
        <Input
          value={item.rule}
          onChange={handleUpdateRule('rule')}
          placeholder="example.com"
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          value={item.target}
          onChange={handleUpdateRule('target')}
          placeholder="127.0.0.1:3000"
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMoveToTop}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
            title="置顶"
          >
            <ArrowUpToLine className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.item === nextProps.item &&
    prevProps.highlighted === nextProps.highlighted
  )
})

// 合并模式下的行组件
interface GroupedRuleRowProps {
  group: {
    key: string
    target: string
    indices: number[]
    rules: string[]
    enabledState: boolean | 'indeterminate'
  }
  highlighted: boolean
  highlightRef: React.RefObject<HTMLTableRowElement | null>
  onToggleGroup: () => void
  onUpdateGroupRules: (input: string) => void
  onUpdateGroupTarget: (target: string) => void
  onDeleteGroup: () => void
}

const GroupedRuleRow = memo(function GroupedRuleRow({
  group,
  highlighted,
  highlightRef,
  onToggleGroup,
  onUpdateGroupRules,
  onUpdateGroupTarget,
  onDeleteGroup,
}: GroupedRuleRowProps) {
  const handleToggle = useCallback(() => onToggleGroup(), [onToggleGroup])
  const handleUpdateRules = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateGroupRules(e.target.value)
  }, [onUpdateGroupRules])
  const handleUpdateTarget = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateGroupTarget(e.target.value)
  }, [onUpdateGroupTarget])
  const handleDelete = useCallback(() => onDeleteGroup(), [onDeleteGroup])

  return (
    <TableRow
      ref={highlighted ? highlightRef : undefined}
      className={highlighted ? 'bg-amber-100/60 dark:bg-amber-500/20 transition-colors' : undefined}
    >
      <TableCell>
        <Checkbox checked={group.enabledState} onCheckedChange={handleToggle} />
      </TableCell>
      <TableCell>
        <Input
          value={group.rules.filter(Boolean).join(' ')}
          onChange={handleUpdateRules}
          placeholder="example.com api.example.com"
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          value={group.target}
          onChange={handleUpdateTarget}
          placeholder="127.0.0.1:3000"
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.group === nextProps.group &&
    prevProps.highlighted === nextProps.highlighted
  )
})

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

  // 使用 useDeferredValue 优化筛选输入的响应性
  const deferredRuleFilter = useDeferredValue(ruleFilter)
  const deferredTargetFilter = useDeferredValue(targetFilter)

  // 使用 useTransition 优化大量规则渲染的响应性
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const toggleRule = useCallback(
    (index: number) => {
      startTransition(() => {
        setRules((prev) => prev.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r)))
      })
    },
    [setRules],
  )

  const updateRule = useCallback(
    (index: number, field: 'rule' | 'target', value: string) => {
      // 输入更新使用立即模式，保证输入响应性
      setRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
    },
    [setRules],
  )

  const deleteRule = useCallback(
    (index: number) => {
      startTransition(() => {
        setRules((prev) => prev.filter((_, i) => i !== index))
      })
    },
    [setRules],
  )

  const addRule = useCallback(() => {
    // 从顶部添加规则
    startTransition(() => {
      setRules((prev) => [{ enabled: true, rule: '', target: '' }, ...prev])
    })
    setHighlightIndex(0)
  }, [setRules])

  const moveToTop = useCallback(
    (index: number) => {
      startTransition(() => {
        setRules((prev) => {
          const newRules = [...prev]
          const [item] = newRules.splice(index, 1)
          newRules.unshift(item)
          return newRules
        })
      })
      setHighlightIndex(0)
    },
    [setRules],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      if (over && active.id !== over.id) {
        setRules((prev) => {
          const oldIndex = prev.findIndex((_, i) => `rule-${i}` === active.id)
          const newIndex = prev.findIndex((_, i) => `rule-${i}` === over.id)
          return arrayMove(prev, oldIndex, newIndex)
        })
      }
    },
    [setRules],
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

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

  // 筛选后的规则列表（包含索引，避免重复查找）
  // 使用 deferred 值避免阻塞输入
  const filteredRules = useMemo(() => {
    if (!deferredRuleFilter && !deferredTargetFilter) {
      return rules.map((item, index) => ({ item, index }))
    }

    const lowerRuleFilter = deferredRuleFilter.toLowerCase()
    const lowerTargetFilter = deferredTargetFilter.toLowerCase()

    return rules
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const matchesRule = !deferredRuleFilter || item.rule.toLowerCase().includes(lowerRuleFilter)
        const matchesTarget = !deferredTargetFilter || item.target.toLowerCase().includes(lowerTargetFilter)
        return matchesRule && matchesTarget
      })
  }, [rules, deferredRuleFilter, deferredTargetFilter])

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
    filteredRules.forEach(({ item, index: originalIndex }) => {
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
      startTransition(() => {
        const nextEnabled = enabledState === true ? false : true
        const indexSet = new Set(indices)
        setRules((prev) => prev.map((item, idx) => (indexSet.has(idx) ? { ...item, enabled: nextEnabled } : item)))
      })
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
      startTransition(() => {
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
      })
    },
    [parseRuleInput, setRules],
  )

  const deleteGroup = useCallback(
    (indices: number[]) => {
      startTransition(() => {
        const removeSet = new Set(indices)
        setRules((prev) => prev.filter((_, idx) => !removeSet.has(idx)))
      })
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

  // 创建稳定的回调函数供 memo 组件使用
  const createToggleRuleCallback = useCallback((index: number) => () => toggleRule(index), [toggleRule])
  const createUpdateRuleCallback = useCallback((index: number) => (field: 'rule' | 'target', value: string) => updateRule(index, field, value), [updateRule])
  const createDeleteRuleCallback = useCallback((index: number) => () => deleteRule(index), [deleteRule])
  const createMoveToTopCallback = useCallback((index: number) => () => moveToTop(index), [moveToTop])

  const createToggleGroupCallback = useCallback((indices: number[], enabledState: boolean | 'indeterminate') => () => toggleGroup(indices, enabledState), [toggleGroup])
  const createUpdateGroupRulesCallback = useCallback((indices: number[]) => (input: string) => updateGroupRules(indices, input), [updateGroupRules])
  const createUpdateGroupTargetCallback = useCallback((indices: number[]) => (target: string) => updateGroupTarget(indices, target), [updateGroupTarget])
  const createDeleteGroupCallback = useCallback((indices: number[]) => () => deleteGroup(indices), [deleteGroup])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          代理规则配置
          {isPending && <span className="ml-2 text-xs text-muted-foreground">(更新中...)</span>}
        </h3>
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
              {!mergeByTarget && !ruleFilter && !targetFilter && (
                <TableHead className="w-8"></TableHead>
              )}
              <TableHead className="w-12">启用</TableHead>
              <TableHead>规则</TableHead>
              <TableHead>目标</TableHead>
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  暂无规则，点击"添加规则"开始配置
                </TableCell>
              </TableRow>
            ) : filteredRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  没有匹配的规则，请调整筛选条件
                </TableCell>
              </TableRow>
            ) : mergeByTarget ? (
              groupedRules.map((group) => (
                <GroupedRuleRow
                  key={group.key}
                  group={group}
                  highlighted={highlightIndex != null && group.indices.includes(highlightIndex)}
                  highlightRef={highlightRowRef}
                  onToggleGroup={createToggleGroupCallback(group.indices, group.enabledState)}
                  onUpdateGroupRules={createUpdateGroupRulesCallback(group.indices)}
                  onUpdateGroupTarget={createUpdateGroupTargetCallback(group.indices)}
                  onDeleteGroup={createDeleteGroupCallback(group.indices)}
                />
              ))
            ) : ruleFilter || targetFilter ? (
              filteredRules.map(({ item, index }) => (
                <FilteredRuleRow
                  key={index}
                  item={item}
                  highlighted={highlightIndex === index}
                  highlightRef={highlightRowRef}
                  onToggle={createToggleRuleCallback(index)}
                  onUpdateRule={createUpdateRuleCallback(index)}
                  onDelete={createDeleteRuleCallback(index)}
                  onMoveToTop={createMoveToTopCallback(index)}
                />
              ))
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={rules.map((_, i) => `rule-${i}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {rules.map((item, index) => (
                    <SortableRuleRow
                      key={`rule-${index}`}
                      id={`rule-${index}`}
                      item={item}
                      highlighted={highlightIndex === index}
                      highlightRef={highlightRowRef}
                      onToggle={createToggleRuleCallback(index)}
                      onUpdateRule={createUpdateRuleCallback(index)}
                      onDelete={createDeleteRuleCallback(index)}
                      onMoveToTop={createMoveToTopCallback(index)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
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
