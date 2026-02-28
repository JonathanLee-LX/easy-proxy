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
import { Plus, Trash2, Pencil, FileText, Code, ChevronDown, ChevronRight } from 'lucide-react'
import { JsonTextarea } from '@/components/json-textarea'
import { formatContent } from '@/lib/formatter'
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
  delay: 0,
  bodyType: 'inline',
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
  const [headersExpanded, setHeadersExpanded] = useState(false)
  const [headerKey, setHeaderKey] = useState('')
  const [headerValue, setHeaderValue] = useState('')
  const [formatError, setFormatError] = useState<string | null>(null)

  useEffect(() => {
    fetchMocks()
  }, [fetchMocks])

  // 处理外部传入的初始编辑数据
  useEffect(() => {
    if (initialEditData) {
      setEditId(null)
      setEditForm({ ...EMPTY_RULE, ...initialEditData })
      setEditOpen(true)
      setHeadersExpanded(Object.keys(initialEditData.headers || {}).length > 0)
      onInitialEditConsumed?.()
    }
  }, [initialEditData, onInitialEditConsumed])

  // 关闭编辑面板时重置 header 输入框
  useEffect(() => {
    if (!editOpen) {
      setHeaderKey('')
      setHeaderValue('')
      setHeadersExpanded(false)
    }
  }, [editOpen])

  const openCreate = useCallback(() => {
    setEditId(null)
    setEditForm(EMPTY_RULE)
    setHeadersExpanded(false)
    setEditOpen(true)
  }, [])

  const openEdit = useCallback((rule: MockRule) => {
    setEditId(rule.id)
    setEditForm({
      name: rule.name,
      urlPattern: rule.urlPattern,
      method: rule.method,
      statusCode: rule.statusCode,
      delay: rule.delay || 0,
      bodyType: rule.bodyType || 'inline',
      headers: rule.headers || {},
      body: rule.body,
      enabled: rule.enabled,
    })
    setHeadersExpanded(!!rule.headers && Object.keys(rule.headers).length > 0)
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

  // 自动格式化 body（支持 JSON, HTML, JS, CSS）
  const formatBody = useCallback(() => {
    try {
      const { formatted, type } = formatContent(editForm.body)
      updateField('body', formatted)
      setFormatError(null)
      // 显示格式化成功的提示（可选）
      console.log(`已格式化为 ${type}`)
    } catch (error) {
      setFormatError(error instanceof Error ? error.message : '格式化失败')
      setTimeout(() => setFormatError(null), 3000)
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
              <TableHead className="w-16">类型</TableHead>
              <TableHead className="w-16">延迟</TableHead>
              <TableHead className="w-16">响应头</TableHead>
              <TableHead className="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
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
                    {rule.bodyType === 'file' ? (
                      <Badge variant="outline" className="text-xs text-blue-600">
                        <FileText className="h-3 w-3 mr-0.5" />文件
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        <Code className="h-3 w-3 mr-0.5" />内容
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {rule.delay ? `${rule.delay}ms` : '-'}
                  </TableCell>
                  <TableCell>
                    {rule.headers && Object.keys(rule.headers).length > 0 ? (
                      <Badge variant="secondary" className="text-xs">
                        {Object.keys(rule.headers).length}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
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
        <SheetContent className="p-0 flex flex-col" resizable={true}>
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
            <div className="grid grid-cols-3 gap-3">
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
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">响应延迟 (ms)</label>
                <Input
                  type="number"
                  value={editForm.delay}
                  onChange={(e) => updateField('delay', parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="h-8"
                />
              </div>
            </div>
            {/* 响应来源切换 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">响应来源</label>
              <div className="flex gap-1 p-0.5 bg-muted rounded-md w-fit">
                <button
                  type="button"
                  className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${
                    editForm.bodyType !== 'file'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => updateField('bodyType', 'inline')}
                >
                  <Code className="h-3 w-3" />
                  自定义内容
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${
                    editForm.bodyType === 'file'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => updateField('bodyType', 'file')}
                >
                  <FileText className="h-3 w-3" />
                  本地文件
                </button>
              </div>
            </div>
            {/* 响应 Body */}
            {editForm.bodyType === 'file' ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  本地文件路径
                  <span className="ml-1 font-normal text-muted-foreground/70">
                    （支持绝对路径，自动推断 MIME 类型）
                  </span>
                </label>
                <Input
                  value={editForm.body}
                  onChange={(e) => updateField('body', e.target.value)}
                  placeholder="如：/Users/me/project/dist/app.js"
                  className="h-8 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  匹配请求时返回该文件内容，适合替换线上 JS/CSS/JSON 等资源
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">响应内容 (Body)</label>
                  <div className="flex items-center gap-2">
                    {formatError && (
                      <span className="text-xs text-red-500">{formatError}</span>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={formatBody}>
                      <Code className="h-3 w-3 mr-1" />
                      智能格式化
                    </Button>
                  </div>
                </div>
                <JsonTextarea
                  value={editForm.body}
                  onChange={(v) => updateField('body', v)}
                  placeholder='支持 JSON, HTML, JS, CSS 等格式'
                />
              </div>
            )}
            {/* Response Headers */}
            <div className="space-y-2">
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setHeadersExpanded(!headersExpanded)}
              >
                {headersExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                响应头 (Headers)
                {Object.keys(editForm.headers || {}).length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {Object.keys(editForm.headers || {}).length}
                  </Badge>
                )}
              </button>
              {headersExpanded && (
                <div className="space-y-2 pl-4 border-l-2 border-muted">
                  {/* 已添加的 headers 列表 */}
                  {Object.entries(editForm.headers || {}).length > 0 ? (
                    <div className="space-y-1">
                      {Object.entries(editForm.headers || {}).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                          <Input
                            value={key}
                            onChange={(e) => {
                              const newHeaders = { ...editForm.headers }
                              delete newHeaders[key]
                              if (e.target.value) {
                                newHeaders[e.target.value] = value
                              }
                              updateField('headers', newHeaders)
                            }}
                            placeholder="Header 名称"
                            className="h-7 font-mono text-xs flex-1"
                          />
                          <Input
                            value={value}
                            onChange={(e) => {
                              updateField('headers', { ...editForm.headers, [key]: e.target.value })
                            }}
                            placeholder="Header 值"
                            className="h-7 font-mono text-xs flex-1"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const newHeaders = { ...editForm.headers }
                              delete newHeaders[key]
                              updateField('headers', newHeaders)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">暂无自定义响应头</p>
                  )}
                  {/* 新增 header */}
                  <div className="flex items-center gap-2">
                    <Input
                      value={headerKey}
                      onChange={(e) => setHeaderKey(e.target.value)}
                      placeholder="Header 名称"
                      className="h-7 font-mono text-xs flex-1"
                    />
                    <Input
                      value={headerValue}
                      onChange={(e) => setHeaderValue(e.target.value)}
                      placeholder="Header 值"
                      className="h-7 font-mono text-xs flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        if (headerKey && headerValue) {
                          updateField('headers', { ...editForm.headers, [headerKey]: headerValue })
                          setHeaderKey('')
                          setHeaderValue('')
                        }
                      }}
                      disabled={!headerKey || !headerValue}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
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
