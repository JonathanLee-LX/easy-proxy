import { useMemo } from 'react'
import { diffLines, type Change } from 'diff'

interface BodyDiffViewProps {
  original: string
  modified: string
  className?: string
  maxHeight?: string
}

/**
 * 按行 Diff 展示两段文本的差异，用于 Response Body 对比。使用 diffLines 控制行数，保证性能。
 */
export function BodyDiffView({ original, modified, className = '', maxHeight = '320px' }: BodyDiffViewProps) {
  const changes = useMemo(() => {
    return diffLines(original || '', modified || '')
  }, [original, modified])

  return (
    <pre
      className={`text-xs font-mono overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/30 ${className}`}
      style={{ maxHeight }}
    >
      {changes.map((part: Change, i: number) => {
        if (part.added) {
          return (
            <span key={i} className="block bg-green-500/20 text-green-800 dark:text-green-200 border-l-2 border-green-500 pl-2">
              {part.value}
            </span>
          )
        }
        if (part.removed) {
          return (
            <span key={i} className="block bg-red-500/20 text-red-800 dark:text-red-200 border-l-2 border-red-500 pl-2">
              {part.value}
            </span>
          )
        }
        return <span key={i}>{part.value}</span>
      })}
    </pre>
  )
}
