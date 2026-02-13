import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, X, Trash2, Pause, Play } from 'lucide-react'

interface LogFilterProps {
  filterText: string
  setFilterText: (text: string) => void
  totalCount: number
  filteredCount: number
  onClear: () => void
  recording: boolean
  onToggleRecording: () => void
}

export function LogFilter({
  filterText,
  setFilterText,
  totalCount,
  filteredCount,
  onClear,
  recording,
  onToggleRecording,
}: LogFilterProps) {
  return (
    <div className="flex items-center gap-2 px-1 py-2">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="过滤请求... (支持 method:GET domain:xxx -排除词)"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="pl-8 h-8 text-sm font-mono"
        />
        {filterText && (
          <button
            onClick={() => setFilterText('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Badge variant="secondary" className="text-xs shrink-0">
        {filterText ? `${filteredCount} / ${totalCount}` : `${totalCount} 条`}
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0"
        onClick={onToggleRecording}
        title={recording ? '暂停记录' : '恢复记录'}
      >
        {recording ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onClear}
        title="清空日志"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
