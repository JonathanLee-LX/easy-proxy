import { useRef, useEffect, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ProxyRecord } from '@/types'

type TimeSortOrder = 'asc' | 'desc'

interface LogTableProps {
  records: ProxyRecord[]
  selectedRecordId: number | null
  onSelect: (id: number) => void
  autoScroll: boolean
}

function getMethodColor(method: string) {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'text-blue-600'
    case 'POST':
      return 'text-green-600'
    case 'PUT':
      return 'text-amber-600'
    case 'DELETE':
      return 'text-red-600'
    case 'PATCH':
      return 'text-purple-600'
    default:
      return 'text-muted-foreground'
  }
}

function getStatusColor(code: number) {
  if (code >= 500) return 'text-red-600'
  if (code >= 400) return 'text-amber-600'
  if (code >= 300) return 'text-blue-600'
  if (code >= 200) return 'text-green-600'
  return 'text-muted-foreground'
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function LogTable({ records, selectedRecordId, onSelect, autoScroll }: LogTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastCountRef = useRef(records.length)
  const [timeSortOrder, setTimeSortOrder] = useState<TimeSortOrder>('desc')

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const idA = a.id ?? 0
      const idB = b.id ?? 0
      return timeSortOrder === 'desc' ? idB - idA : idA - idB
    })
  }, [records, timeSortOrder])

  const rowHeight = 36

  const virtualizer = useVirtualizer({
    count: sortedRecords.length,
    getScrollElement: () => {
      const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]')
      return viewport as HTMLElement | null
    },
    estimateSize: () => rowHeight,
    overscan: 10,
  })

  const virtualItems = virtualizer.getVirtualItems()

  useEffect(() => {
    if (autoScroll && sortedRecords.length > lastCountRef.current) {
      const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTop = 0
        })
      }
    }
    lastCountRef.current = sortedRecords.length
  }, [sortedRecords.length, autoScroll])

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement
      if (viewport && virtualItems.length > 0) {
        virtualizer.scrollToOffset(0)
      }
    }
  }, [timeSortOrder])

  return (
    <ScrollArea className="h-[calc(100vh-12rem)]" ref={scrollRef}>
      <div className="min-w-full">
        {/* Header */}
        <div className="flex bg-muted/50 text-xs font-medium border-b">
          <div className="w-16 py-2 px-2">方法</div>
          <div className="w-14 py-2 px-2">状态</div>
          <div className="flex-1 py-2 px-2 min-w-[200px]">源地址</div>
          <div className="flex-1 py-2 px-2 min-w-[200px]">目标地址</div>
          <div className="w-14 py-2 px-2">协议</div>
          <div className="w-16 py-2 px-2">耗时</div>
          <div className="w-28 py-2 px-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTimeSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
              title={timeSortOrder === 'desc' ? '倒序（新→旧），点击切换为正序' : '正序（旧→新），点击切换为倒序'}
            >
              时间
              {timeSortOrder === 'desc' ? (
                <ArrowDown className="h-3 w-3" />
              ) : (
                <ArrowUp className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>

        {/* Virtual List */}
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {sortedRecords.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">
              暂无请求记录
            </div>
          ) : (
            virtualItems.map((virtualRow) => {
              const record = sortedRecords[virtualRow.index]
              const isSelected = selectedRecordId === record.id
              return (
                <div
                  key={record.id ?? virtualRow.index}
                  className={`flex cursor-pointer transition-colors text-xs absolute w-full ${
                    isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => record.id != null && onSelect(record.id)}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="w-16 py-1.5 px-2">
                    <Badge variant="outline" className={`text-[10px] font-mono px-1.5 py-0 ${getMethodColor(record.method)}`}>
                      {record.method}
                    </Badge>
                  </div>
                  <div className="w-14 py-1.5 px-2">
                    {record.statusCode != null && (
                      <span className={`text-[10px] font-mono font-semibold ${getStatusColor(record.statusCode)}`}>
                        {record.statusCode}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 py-1.5 px-2 font-mono truncate min-w-[200px]" title={record.source}>
                    {record.source}
                  </div>
                  <div className="flex-1 py-1.5 px-2 font-mono truncate min-w-[200px]" title={record.target}>
                    {record.mock && (
                      <Badge variant="outline" className="text-[10px] font-mono px-1 py-0 mr-1 text-orange-500 border-orange-300">
                        MOCK
                      </Badge>
                    )}
                    {record.target}
                  </div>
                  <div className="w-14 py-1.5 px-2">
                    {record.protocol && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono px-1 py-0 ${
                          record.protocol === 'h2'
                            ? 'text-emerald-600 border-emerald-300'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {record.protocol}
                      </Badge>
                    )}
                  </div>
                  <div className="w-16 py-1.5 px-2 text-muted-foreground font-mono text-[10px]">
                    {record.duration != null && formatDuration(record.duration)}
                  </div>
                  <div className="w-28 py-1.5 px-2 text-muted-foreground font-mono">
                    {record.time}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
