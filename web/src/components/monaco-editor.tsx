import { useRef, useEffect, useState } from 'react'
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

interface MonacoEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
  height?: string
  language?: string
  readOnly?: boolean
}

/**
 * Monaco Editor 组件包装器，支持多种语言的语法高亮和语法检查
 * 支持 JSON、HTML、CSS、JavaScript 等
 */
export function MonacoEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = '240px',
  height,
  language = 'json',
  readOnly = false,
}: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const [detectedLanguage, setDetectedLanguage] = useState(language)

  // 自动检测语言类型
  useEffect(() => {
    if (!value.trim()) {
      setDetectedLanguage(language)
      return
    }

    const trimmed = value.trim()
    
    // 检测 JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      setDetectedLanguage('json')
      return
    }
    
    // 检测 HTML
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.match(/^<\w+/)) {
      setDetectedLanguage('html')
      return
    }
    
    // 检测 CSS
    if (trimmed.match(/^[.#@]?[\w-]+\s*\{/) || trimmed.includes('/*') && trimmed.includes('*/')) {
      setDetectedLanguage('css')
      return
    }
    
    // 检测 JavaScript
    if (
      trimmed.startsWith('function') ||
      trimmed.startsWith('const ') ||
      trimmed.startsWith('let ') ||
      trimmed.startsWith('var ') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('export ') ||
      trimmed.includes('=>')
    ) {
      setDetectedLanguage('javascript')
      return
    }
    
    // 默认使用传入的语言
    setDetectedLanguage(language)
  }, [value, language])

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // 配置 JSON 语言的验证选项
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: true,
      schemas: [],
      enableSchemaRequest: false,
    })

    // 配置编辑器选项
    editor.updateOptions({
      fontSize: 13,
      lineHeight: 20,
      tabSize: 2,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      wrappingStrategy: 'advanced',
      automaticLayout: true,
      folding: true,
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        useShadows: false,
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      suggest: {
        showKeywords: true,
        showSnippets: true,
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: true,
      },
    })

    // 设置主题（根据系统主题）
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs')

    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = (e: MediaQueryListEvent) => {
      monaco.editor.setTheme(e.matches ? 'vs-dark' : 'vs')
    }
    mediaQuery.addEventListener('change', handleThemeChange)

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange)
    }
  }

  const handleEditorChange = (value: string | undefined) => {
    onChange(value || '')
  }

  // 计算最终高度：如果传入了 height 则使用，否则使用 minHeight
  const finalHeight = height || minHeight

  return (
    <div
      className={`rounded-md border border-input overflow-hidden ${className || ''}`}
      style={height === 'flex' ? { height: '100%', display: 'flex', flexDirection: 'column' } : undefined}
    >
      <Editor
        height={height === 'flex' ? '100%' : finalHeight}
        language={detectedLanguage}
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
        }}
        loading={
          <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span>加载编辑器中...</span>
          </div>
        }
      />
      {!value && placeholder && (
        <div className="absolute top-2 left-14 text-sm text-muted-foreground pointer-events-none select-none">
          {placeholder}
        </div>
      )}
    </div>
  )
}
