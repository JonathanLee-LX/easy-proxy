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
import { Loader2, Wand2 } from 'lucide-react'
import type { RecordDetail, ProxyRecord } from '@/types'

interface DetailPanelProps {
  open: boolean
  onClose: () => void
  detail: RecordDetail | null
  loading: boolean
  selectedRecord?: ProxyRecord
  onCreateMock?: (data: { source: string; responseBody: string; statusCode: number }) => void
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
  if (!body) {
    return <p className="text-sm text-muted-foreground py-2">无内容</p>
  }
  // Try to format as JSON
  let formatted = body
  try {
    const obj = JSON.parse(body)
    formatted = JSON.stringify(obj, null, 2)
  } catch {
    // keep as-is
  }
  return (
    <pre className="font-mono text-xs whitespace-pre-wrap break-all p-2 bg-muted/50 rounded-md max-h-[400px] overflow-auto">
      {formatted}
    </pre>
  )
}

export function DetailPanel({ open, onClose, detail, loading, selectedRecord, onCreateMock }: DetailPanelProps) {
  const handleCreateMock = () => {
    if (detail && selectedRecord && onCreateMock) {
      onCreateMock({
        source: selectedRecord.source,
        responseBody: detail.responseBody,
        statusCode: detail.statusCode,
      })
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
            {detail && onCreateMock && !selectedRecord?.mock && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={handleCreateMock}
              >
                <Wand2 className="h-3.5 w-3.5 mr-1" />
                创建 Mock
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>

        <Separator />

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
