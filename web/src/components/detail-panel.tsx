import { useState, useMemo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Wand2, RotateCw } from 'lucide-react'
import { highlightCode } from '@/lib/syntax-highlight'
import type { RecordDetail, ProxyRecord } from '@/types'

interface DetailPanelProps {
  open: boolean
  onClose: () => void
  detail: RecordDetail | null
  loading: boolean
  selectedRecord?: ProxyRecord
  onCreateMock?: (data: { source: string; responseBody: string; statusCode: number; responseHeaders?: Record<string, string> }) => void
  onReplay?: (id: number) => Promise<unknown>
}

function getStatusColor(code: number) {
  if (code >= 200 && code < 300) return 'bg-green-100 text-green-800'
  if (code >= 300 && code < 400) return 'bg-blue-100 text-blue-800'
  if (code >= 400 && code < 500) return 'bg-amber-100 text-amber-800'
  if (code >= 500) return 'bg-red-100 text-red-800'
  return ''
}

function HeadersView({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers || {})
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">无头部信息</p>
  }
  return (
    <div className="font-mono text-xs space-y-0.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 py-0.5 hover:bg-muted/50 px-1 rounded">
          <span className="text-purple-600 shrink-0 font-semibold">{key}:</span>
          <span className="text-foreground/80 break-all">{value}</span>
        </div>
      ))}
    </div>
  )
}

function BodyView({ body }: { body: string }) {
  // 使用轻量级语法高亮（类似 Chrome DevTools）
  const highlightedBody = useMemo(() => {
    if (!body) return null
    return highlightCode(body)
  }, [body])

  if (!body) {
    return <p className="text-sm text-muted-foreground py-2">无内容</p>
  }

  return (
    <div className="font-mono text-xs bg-muted/30 rounded p-2">
      <pre className="whitespace-pre-wrap break-all">{highlightedBody}</pre>
    </div>
  )
}

export function DetailPanel({ open, onClose, detail, loading, selectedRecord, onCreateMock, onReplay }: DetailPanelProps) {
  const [replaying, setReplaying] = useState(false)

  const handleCreateMock = () => {
    if (detail && selectedRecord && onCreateMock) {
      onCreateMock({
        source: selectedRecord.source,
        responseBody: detail.responseBody,
        statusCode: detail.statusCode,
        responseHeaders: detail.responseHeaders,
      })
    }
  }

  const [replayError, setReplayError] = useState<string | null>(null)

  const handleReplay = async () => {
    if (selectedRecord?.id != null && onReplay) {
      setReplaying(true)
      setReplayError(null)
      try {
        await onReplay(selectedRecord.id)
      } catch (err) {
        setReplayError((err as Error).message || '重放失败')
      } finally {
        setReplaying(false)
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            请求详情
            {detail && (
              <Badge className={`${getStatusColor(detail.statusCode)} border-0`}>
                {detail.statusCode} {detail.statusMessage}
              </Badge>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              {detail && onReplay && selectedRecord?.id != null && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleReplay}
                  disabled={replaying}
                  title="使用相同的请求参数重新发送请求"
                >
                  <RotateCw className={`h-3.5 w-3.5 mr-1 ${replaying ? 'animate-spin' : ''}`} />
                  {replaying ? '重放中...' : '重放'}
                </Button>
              )}
              {detail && onCreateMock && !selectedRecord?.mock && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleCreateMock}
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1" />
                  创建 Mock
                </Button>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        <Separator />

        {replayError && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs">
            {replayError}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : detail ? (
          <Tabs defaultValue="request" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-4 mt-2 w-fit">
              <TabsTrigger value="request">请求</TabsTrigger>
              <TabsTrigger value="response">响应</TabsTrigger>
            </TabsList>
            <TabsContent value="request" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full px-4 pb-4">
                <div className="space-y-3 pt-3">
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Request Headers</h4>
                    <HeadersView headers={detail.requestHeaders} />
                  </div>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Request Body</h4>
                    <BodyView body={detail.requestBody} />
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="response" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full px-4 pb-4">
                <div className="space-y-3 pt-3">
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Response Headers</h4>
                    <HeadersView headers={detail.responseHeaders} />
                  </div>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Response Body</h4>
                    <BodyView body={detail.responseBody} />
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            无法加载详情
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
