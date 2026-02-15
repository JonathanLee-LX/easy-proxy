import { useEffect, useCallback, useState } from 'react'
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
import { Plus, Save, Trash2, FileText } from 'lucide-react'
import type { RuleItem } from '@/types'

interface RuleConfigProps {
  rules: RuleItem[]
  setRules: React.Dispatch<React.SetStateAction<RuleItem[]>>
  fetchRules: () => Promise<void>
  saveRules: (items: RuleItem[]) => Promise<boolean>
}

export function RuleConfig({ rules, setRules, fetchRules, saveRules }: RuleConfigProps) {
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

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
    (index: number, field: 'rule' | 'target' | 'targetType', value: string) => {
      setRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
    },
    [setRules],
  )

  // 根据 targetType 获取显示的 target 值
  const getDisplayTarget = (item: RuleItem) => {
    if (item.targetType === 'map-local' && item.target.startsWith('file://')) {
      return item.target.replace(/^file:\/\//, '').replace(/\//g, '\\')
    }
    return item.target
  }

  // 处理 target 变化，自动检测是否是本地文件路径
  const handleTargetChange = useCallback((index: number, value: string) => {
    setRules((prev) => prev.map((r, i) => {
      if (i !== index) return r
      // 检测是否是本地文件路径
      const isLocalFile = /^[A-Za-z]:\\|^\/[^\0]+/.test(value)
      let target = value
      if (isLocalFile && !value.startsWith('file://')) {
        // 转换为 file:// 格式
        target = 'file://' + value.replace(/\\/g, '/')
      }
      return {
        ...r,
        target,
        targetType: isLocalFile ? 'map-local' : (r.targetType || 'proxy')
      }
    }))
  }, [setRules])

  // 处理文件选择
  const handleFileSelect = useCallback((index: number) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        // 使用 file.path 获取完整路径（仅 Electron/WebKit 支持）
        const filePath = (file as any).path || file.name
        handleTargetChange(index, filePath)
      }
    })
    input.click()
  }, [handleTargetChange])

  const deleteRule = useCallback(
    (index: number) => {
      setRules((prev) => prev.filter((_, i) => i !== index))
    },
    [setRules],
  )

  const addRule = useCallback(() => {
    setRules((prev) => [...prev, { enabled: true, rule: '', target: '', targetType: 'proxy' }])
  }, [setRules])

  const handleSave = useCallback(async () => {
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addRule}>
            <Plus className="h-4 w-4 mr-1" />
            添加规则
          </Button>
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
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">启用</TableHead>
              <TableHead>规则</TableHead>
              <TableHead className="w-32">类型</TableHead>
              <TableHead>目标</TableHead>
              <TableHead className="w-16">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  暂无规则，点击"添加规则"开始配置
                </TableCell>
              </TableRow>
            ) : (
              rules.map((item, index) => (
                <TableRow key={index}>
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
                    <div className="flex items-center gap-1">
                      <Button
                        variant={item.targetType === 'proxy' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateRule(index, 'targetType', 'proxy')}
                        className="h-7 px-2 text-xs"
                        title="代理"
                      >
                        代理
                      </Button>
                      <Button
                        variant={item.targetType === 'map-local' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateRule(index, 'targetType', 'map-local')}
                        className="h-7 px-2 text-xs"
                        title="本地文件"
                      >
                        <FileText className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        value={getDisplayTarget(item)}
                        onChange={(e) => handleTargetChange(index, e.target.value)}
                        placeholder={item.targetType === 'map-local' ? 'C:\\path\\to\\file' : '127.0.0.1:3000'}
                        className="h-8"
                      />
                      {item.targetType === 'map-local' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleFileSelect(index)}
                          className="h-8 px-2"
                          title="选择文件"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
