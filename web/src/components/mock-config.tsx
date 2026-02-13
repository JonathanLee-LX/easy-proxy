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
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Plus, Trash2, Pencil } from 'lucide-react'
import type { MockRule } from '@/types'

interface MockConfigProps {
  mockRules: MockRule[]
  fetchMocks: () => Promise<void>
  createMock: (rule: Omit<MockRule, 'id'>) => Promise<MockRule | null>
  updateMock: (id: number, updates: Partial<MockRule>) => Promise<boolean>
  deleteMock: (id: number) => Promise<boolean>
  /** 外部传入的初始编辑数据（从日志详情创建 mock 时使用） */
  initialEditData?: Partial<MockRule> | null
  onInitialEditConsumed?: () => void
}

const EMPTY_RULE: Omit<MockRule, 'id'> = {
  name: '',
  urlPattern: '',
  method: '*',
  statusCode: 200,
  headers: {},
  body: '',
  enabled: true,
}

export function MockConfig({
  mockRules,
  fetchMocks,
  createMock,
  updateMock,
  deleteMock,
  initialEditData,
  onInitialEditConsumed,
}: MockConfigProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null) // null = create, number = edit
  const [editForm, setEditForm] = useState<Omit<MockRule, 'id'>>(EMPTY_RULE)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchMocks()
  }, [fetchMocks])

  // 处理外部传入的初始编辑数据
  useEffect(() => {
    if (initialEditData) {
      setEditId(null)
      setEditForm({ ...EMPTY_RULE, ...initialEditData })
      setEditOpen(true)
      onInitialEditConsumed?.()
    }
  }, [initialEditData, onInitialEditConsumed])

  const openCreate = useCallback(() => {
    setEditId(null)
    setEditForm(EMPTY_RULE)
    setEditOpen(true)
  }, [])

  const openEdit = useCallback((rule: MockRule) => {
    setEditId(rule.id)
    setEditForm({
      name: rule.name,
      urlPattern: rule.urlPattern,
      method: rule.method,
      statusCode: rule.statusCode,
      headers: rule.headers,
      body: rule.body,
      enabled: rule.enabled,
    })
    setEditOpen(true)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    if (editId != null) {
      await updateMock(editId, editForm)
    } else {
      await createMock(editForm)
    }
    setSaving(false)
    setEditOpen(false)
  }, [editId, editForm, createMock, updateMock])

  const handleToggle = useCallback(
    async (rule: MockRule) => {
      await updateMock(rule.id, { enabled: !rule.enabled })
    },
    [updateMock],
  )

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteMock(id)
    },
    [deleteMock],
  )

  const updateField = <K extends keyof Omit<MockRule, 'id'>>(field: K, value: Omit<MockRule, 'id'>[K]) => {
    setEditForm((prev) => ({ ...prev, [field]: value }))
  }

  // 尝试格式化 body 为 JSON
  const formatBody = useCallback(() => {
    try {
      const obj = JSON.parse(editForm.body)
      updateField('body', JSON.stringify(obj, null, 2))
    } catch {
      // keep as is
    }
  }, [editForm.body])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Mock 规则配置
          <span className="ml-2 text-xs">
            匹配请求后直接返回预设响应，不再转发到真实服务器
          </span>
        </h3>
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          新增规则
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">启用</TableHead>
              <TableHead className="w-40">名称</TableHead>
              <TableHead>URL 匹配</TableHead>
              <TableHead className="w-20">方法</TableHead>
              <TableHead className="w-20">状态码</TableHead>
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  暂无 Mock 规则，点击"新增规则"或从请求日志详情中创建
                </TableCell>
              </TableRow>
            ) : (
              mockRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <Checkbox
                      checked={rule.enabled}
                      onCheckedChange={() => handleToggle(rule)}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {rule.name || <span className="text-muted-foreground italic">未命名</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs truncate max-w-[300px]" title={rule.urlPattern}>
                    {rule.urlPattern}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {rule.method || '*'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        rule.statusCode >= 200 && rule.statusCode < 300
                          ? 'text-green-600'
                          : rule.statusCode >= 400
                          ? 'text-red-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {rule.statusCode}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(rule)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(rule.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 编辑面板 */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-base">
              {editId != null ? '编辑 Mock 规则' : '新建 Mock 规则'}
            </SheetTitle>
          </SheetHeader>
          <Separator />
          <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
            {/* 名称 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">规则名称</label>
              <Input
                value={editForm.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="如：模拟欠费状态"
                className="h-8"
              />
            </div>
            {/* URL 匹配 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                URL 匹配（支持正则）
              </label>
              <Input
                value={editForm.urlPattern}
                onChange={(e) => updateField('urlPattern', e.target.value)}
                placeholder="如：/api/console/user/corp/.*"
                className="h-8 font-mono text-sm"
              />
            </div>
            {/* 方法和状态码 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">HTTP 方法</label>
                <select
                  value={editForm.method}
                  onChange={(e) => updateField('method', e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="*">全部</option>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">响应状态码</label>
                <Input
                  type="number"
                  value={editForm.statusCode}
                  onChange={(e) => updateField('statusCode', parseInt(e.target.value) || 200)}
                  className="h-8"
                />
              </div>
            </div>
            {/* 响应 Body */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">响应内容 (Body)</label>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={formatBody}>
                  格式化 JSON
                </Button>
              </div>
              <textarea
                value={editForm.body}
                onChange={(e) => updateField('body', e.target.value)}
                placeholder='{"code": 0, "data": {...}}'
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm font-mono min-h-[240px] resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            {/* 启用 */}
            <div className="flex items-center gap-2">
              <Checkbox
                checked={editForm.enabled}
                onCheckedChange={(checked) => updateField('enabled', !!checked)}
              />
              <label className="text-sm">启用此规则</label>
            </div>
          </div>
          <Separator />
          <div className="px-4 py-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !editForm.urlPattern}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
