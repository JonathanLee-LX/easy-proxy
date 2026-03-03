import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { MonacoEditor } from './monaco-editor'
import { Code2, Save, Loader2, Zap, RotateCcw } from 'lucide-react'

interface PluginCodeEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filename: string
  onSaved?: () => void
}

export function PluginCodeEditor({
  open,
  onOpenChange,
  filename,
  onSaved,
}: PluginCodeEditorProps) {
  const [code, setCode] = useState('')
  const [originalCode, setOriginalCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty = code !== originalCode

  const fetchCode = useCallback(async () => {
    if (!filename) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/plugins/custom/${encodeURIComponent(filename)}/code`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '读取插件代码失败')
      }
      const data = await res.json()
      setCode(data.code)
      setOriginalCode(data.code)
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取失败')
    } finally {
      setLoading(false)
    }
  }, [filename])

  useEffect(() => {
    if (open && filename) {
      fetchCode()
    }
  }, [open, filename, fetchCode])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/plugins/custom/${encodeURIComponent(filename)}/code`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '保存失败')
      }
      setOriginalCode(code)
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndReload = async () => {
    setSaving(true)
    setReloading(true)
    setError(null)
    try {
      const res = await fetch(`/api/plugins/custom/${encodeURIComponent(filename)}/code`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '保存失败')
      }
      setOriginalCode(code)

      const reloadRes = await fetch('/api/plugins/reload', { method: 'POST' })
      if (!reloadRes.ok) {
        throw new Error('热加载失败')
      }
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setSaving(false)
      setReloading(false)
    }
  }

  const handleRevert = () => {
    setCode(originalCode)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => {
      if (!v && isDirty && !confirm('有未保存的修改，确定要关闭吗？')) return
      onOpenChange(v)
    }}>
      <SheetContent className="p-0 flex flex-col" resizable defaultWidth={900} storageKey="plugin-code-editor">
        <SheetHeader className="px-6 pt-6 pb-3">
          <SheetTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            {filename}
            {isDirty && <Badge variant="outline" className="text-orange-600 border-orange-300">未保存</Badge>}
          </SheetTitle>
          <SheetDescription>查看和编辑插件源码，保存后需热加载才能生效</SheetDescription>
        </SheetHeader>

        <Separator />

        <div className="flex-1 overflow-hidden px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>加载中...</span>
            </div>
          ) : error && !code ? (
            <div className="flex items-center justify-center h-full text-destructive">
              {error}
            </div>
          ) : (
            <MonacoEditor
              value={code}
              onChange={setCode}
              language="javascript"
              height="flex"
            />
          )}
        </div>

        {error && code && (
          <div className="px-6 py-2 text-sm text-destructive bg-destructive/10">
            {error}
          </div>
        )}

        <Separator />

        <div className="px-6 py-3 flex justify-between items-center gap-2">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRevert}
              disabled={!isDirty || saving}
              title="撤销修改"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              还原
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isDirty && !confirm('有未保存的修改，确定要关闭吗？')) return
                onOpenChange(false)
              }}
              disabled={saving}
            >
              关闭
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || saving}
            >
              {saving && !reloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              保存
            </Button>
            <Button
              size="sm"
              onClick={handleSaveAndReload}
              disabled={!isDirty || saving}
            >
              {reloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
              保存并热加载
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
