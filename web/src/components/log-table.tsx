import { useRef, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

  useEffect(() => {
    if (autoScroll && sortedRecords.length > lastCountRef.current && scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTop = 0
        })
      }
    }
    lastCountRef.current = sortedRecords.length
  }, [sortedRecords.length, autoScroll])

  return (
    <ScrollArea className="h-[calc(100vh-12rem)]" ref={scrollRef}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-16 text-xs">方法</TableHead>
            <TableHead className="text-xs">源地址</TableHead>
            <TableHead className="text-xs">目标地址</TableHead>
            <TableHead className="w-14 text-xs">协议</TableHead>
            <TableHead className="w-28 text-xs">
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
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRecords.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                暂无请求记录
              </TableCell>
            </TableRow>
          ) : (
            sortedRecords.map((record, index) => (
              <TableRow
                key={record.id ?? index}
                className={`cursor-pointer transition-colors text-xs ${
                  selectedRecordId === record.id
                    ? 'bg-primary/5 hover:bg-primary/10'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => record.id != null && onSelect(record.id)}
              >
                <TableCell className="py-1.5">
                  <Badge variant="outline" className={`text-[10px] font-mono px-1.5 py-0 ${getMethodColor(record.method)}`}>
                    {record.method}
                  </Badge>
                </TableCell>
                <TableCell className="py-1.5 font-mono truncate max-w-[300px]" title={record.source}>
                  {record.source}
                </TableCell>
                <TableCell className="py-1.5 font-mono truncate max-w-[300px]" title={record.target}>
                  {record.mock && (
                    <Badge variant="outline" className="text-[10px] font-mono px-1 py-0 mr-1 text-orange-500 border-orange-300">
                      MOCK
                    </Badge>
                  )}
                  {record.target}
                </TableCell>
                <TableCell className="py-1.5">
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
                </TableCell>
                <TableCell className="py-1.5 text-muted-foreground font-mono">
                  {record.time}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}
