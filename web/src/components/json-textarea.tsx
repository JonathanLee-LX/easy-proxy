import { useRef, useCallback } from 'react'
import { highlightJson, isValidJson } from '@/lib/json-highlight'

interface JsonTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
}

/**
 * 带 JSON 语法高亮的 textarea。
 * 原理：在透明文字的 textarea 下叠加一个带高亮的 <pre>，
 * 两者共享相同的字体/间距/换行规则以保持对齐。
 */
export function JsonTextarea({
  value,
  onChange,
  placeholder,
  className,
  minHeight = '240px',
}: JsonTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)

  const handleScroll = useCallback(() => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop
      preRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }, [])

  const isJson = value.trim().length > 0 && isValidJson(value)

  // 共享的文本样式类名（textarea 和 pre 必须完全一致）
  const sharedTextStyle =
    'px-3 py-2 text-sm leading-[1.625] font-mono whitespace-pre-wrap break-words'

  return (
    <div className={`relative ${className || ''}`}>
      {/* 高亮渲染层 —— 放在 textarea 下方，pointer-events: none 使其不拦截点击 */}
      <pre
        ref={preRef}
        className={`absolute inset-0 ${sharedTextStyle} m-0 overflow-hidden border border-transparent rounded-md pointer-events-none select-none`}
        aria-hidden="true"
      >
        {isJson ? highlightJson(value) : <span className="invisible">{value || ' '}</span>}
        {/* 末尾换行保证 pre 高度与 textarea 一致 */}
        {'\n'}
      </pre>

      {/* 可编辑的 textarea —— JSON 有效时文字透明，仅显示光标 */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        placeholder={placeholder}
        spellCheck={false}
        className={`relative w-full ${sharedTextStyle} rounded-md border border-input bg-transparent shadow-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring selection:bg-blue-300/30 ${
          isJson ? 'text-transparent caret-foreground' : ''
        }`}
        style={{ minHeight }}
      />
    </div>
  )
}
