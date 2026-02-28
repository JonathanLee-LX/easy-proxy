import type React from 'react'

// 性能配置
const MAX_HIGHLIGHT_SIZE = 50 * 1024 // 50KB，超过此大小不进行语法高亮
const MAX_HIGHLIGHT_LINES = 1000 // 最多高亮 1000 行

/**
 * 检查内容是否适合进行语法高亮
 */
export function shouldHighlight(code: string): boolean {
  if (!code) return false
  
  // 检查大小限制
  if (code.length > MAX_HIGHLIGHT_SIZE) {
    return false
  }
  
  // 检查行数限制
  const lineCount = code.split('\n').length
  if (lineCount > MAX_HIGHLIGHT_LINES) {
    return false
  }
  
  return true
}

/**
 * 检测代码类型
 */
export function detectLanguage(code: string): 'json' | 'html' | 'css' | 'javascript' | 'text' {
  const trimmed = code.trim()
  
  if (!trimmed) return 'text'
  
  // 检测 JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {
      // 继续检测其他类型
    }
  }
  
  // 检测 HTML
  if (trimmed.startsWith('<!DOCTYPE') || 
      trimmed.startsWith('<html') ||
      /<[a-z][\s\S]*>/i.test(trimmed)) {
    return 'html'
  }
  
  // 检测 CSS
  if (/[a-z-]+\s*\{[\s\S]*\}/i.test(trimmed) || 
      /@(media|keyframes|import|font-face)/i.test(trimmed)) {
    return 'css'
  }
  
  // 检测 JavaScript
  if (/(function|const|let|var|class|import|export|=>)/i.test(trimmed)) {
    return 'javascript'
  }
  
  return 'text'
}

/**
 * JSON 语法高亮（优化版本）
 */
function highlightJson(json: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // 简化的正则，避免复杂回溯
  const tokenRe = /("(?:[^"\\]|\\.)+")\s*:|("(?:[^"\\]|\\.)+")|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|true|false|null|[{}[\]:,]/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let matchCount = 0
  const MAX_MATCHES = 5000 // 限制最大匹配数，防止性能问题

  while ((match = tokenRe.exec(json)) !== null && matchCount++ < MAX_MATCHES) {
    if (match.index > lastIndex) {
      nodes.push(json.slice(lastIndex, match.index))
    }
    
    const token = match[0]
    
    if (match[1]) {
      // 对象键
      nodes.push(<span key={match.index} className="text-purple-600 dark:text-purple-400">{match[1]}</span>)
      nodes.push(':')
    } else if (match[2]) {
      // 字符串值
      nodes.push(<span key={match.index} className="text-emerald-600 dark:text-emerald-400">{match[2]}</span>)
    } else if (match[3]) {
      // 数字
      nodes.push(<span key={match.index} className="text-blue-600 dark:text-blue-400">{match[3]}</span>)
    } else if (token === 'true' || token === 'false') {
      // 布尔值
      nodes.push(<span key={match.index} className="text-amber-600 dark:text-amber-400">{token}</span>)
    } else if (token === 'null') {
      // null
      nodes.push(<span key={match.index} className="text-red-400">{token}</span>)
    } else {
      // 标点符号
      nodes.push(<span key={match.index} className="text-muted-foreground">{token}</span>)
    }
    
    lastIndex = match.index + match[0].length
  }
  
  if (lastIndex < json.length) {
    nodes.push(json.slice(lastIndex))
  }
  return nodes
}

/**
 * HTML 语法高亮（优化版本）
 */
function highlightHtml(html: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  
  // 简化的正则，避免贪婪匹配导致的性能问题
  const tagRe = /<!--[\s\S]{0,500}?-->|<\/?([a-z][\w-]*)\b([^>]{0,500})>/gi
  let match: RegExpExecArray | null
  let currentIndex = 0
  let matchCount = 0
  const MAX_MATCHES = 3000
  
  while ((match = tagRe.exec(html)) !== null && matchCount++ < MAX_MATCHES) {
    // 添加标签前的文本
    if (match.index > currentIndex) {
      const text = html.slice(currentIndex, match.index)
      if (text) {
        nodes.push(<span key={`text-${currentIndex}`} className="text-foreground">{text}</span>)
      }
    }
    
    const fullMatch = match[0]
    
    // HTML 注释
    if (fullMatch.startsWith('<!--')) {
      nodes.push(<span key={match.index} className="text-gray-500 dark:text-gray-400 italic">{fullMatch}</span>)
    } else {
      // 标签
      const tagName = match[1]
      const attrs = match[2]
      
      if (fullMatch.startsWith('</')) {
        // 闭合标签
        nodes.push(<span key={match.index} className="text-blue-600 dark:text-blue-400">{fullMatch}</span>)
      } else {
        // 开始标签
        nodes.push(<span key={match.index} className="text-blue-600 dark:text-blue-400">{'<'}</span>)
        nodes.push(<span key={`tag-${match.index}`} className="text-blue-600 dark:text-blue-400 font-semibold">{tagName}</span>)
        
        // 高亮属性
        if (attrs) {
          const attrNodes = highlightAttributes(attrs, match.index)
          nodes.push(...attrNodes)
        }
        
        nodes.push(<span key={`close-${match.index}`} className="text-blue-600 dark:text-blue-400">{'>'}</span>)
      }
    }
    
    currentIndex = match.index + fullMatch.length
  }
  
  // 添加剩余文本
  if (currentIndex < html.length) {
    const text = html.slice(currentIndex)
    if (text) {
      nodes.push(<span key={`text-${currentIndex}`} className="text-foreground">{text}</span>)
    }
  }
  
  return nodes
}

/**
 * 高亮 HTML 属性
 */
function highlightAttributes(attrs: string, baseIndex: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const attrRe = /([a-z-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi
  let match: RegExpExecArray | null
  let lastIndex = 0
  
  while ((match = attrRe.exec(attrs)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(attrs.slice(lastIndex, match.index))
    }
    
    const attrName = match[1]
    const attrValue = match[2] || match[3] || match[4]
    
    nodes.push(<span key={`attr-name-${baseIndex}-${match.index}`} className="text-amber-600 dark:text-amber-400">{attrName}</span>)
    
    if (attrValue !== undefined) {
      nodes.push('=')
      if (match[2] !== undefined) {
        nodes.push(<span key={`attr-val-${baseIndex}-${match.index}`} className="text-emerald-600 dark:text-emerald-400">{`"${match[2]}"`}</span>)
      } else if (match[3] !== undefined) {
        nodes.push(<span key={`attr-val-${baseIndex}-${match.index}`} className="text-emerald-600 dark:text-emerald-400">{`'${match[3]}'`}</span>)
      } else {
        nodes.push(<span key={`attr-val-${baseIndex}-${match.index}`} className="text-emerald-600 dark:text-emerald-400">{match[4]}</span>)
      }
    }
    
    lastIndex = match.index + match[0].length
  }
  
  if (lastIndex < attrs.length) {
    nodes.push(attrs.slice(lastIndex))
  }
  
  return nodes
}

/**
 * CSS 语法高亮（优化版本）
 */
function highlightCss(css: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  
  // 限制行数
  const lines = css.split('\n').slice(0, MAX_HIGHLIGHT_LINES)
  
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      nodes.push('\n')
    }
    
    // CSS 注释
    if (line.trim().startsWith('/*')) {
      nodes.push(<span key={`comment-${lineIndex}`} className="text-gray-500 dark:text-gray-400 italic">{line}</span>)
      return
    }
    
    // 选择器行（不包含冒号或只在 {} 外）
    if (!line.includes(':') || line.includes('{')) {
      // 选择器
      const parts = line.split('{')
      if (parts.length > 1) {
        nodes.push(<span key={`selector-${lineIndex}`} className="text-purple-600 dark:text-purple-400 font-semibold">{parts[0]}</span>)
        nodes.push(<span key={`brace-${lineIndex}`} className="text-foreground">{' {'}</span>)
        if (parts[1]) {
          nodes.push(parts[1])
        }
      } else {
        nodes.push(<span key={`selector-${lineIndex}`} className="text-purple-600 dark:text-purple-400 font-semibold">{line}</span>)
      }
    } else if (line.includes(':')) {
      // 属性:值对
      const colonIndex = line.indexOf(':')
      const property = line.slice(0, colonIndex)
      const value = line.slice(colonIndex + 1)
      
      nodes.push(<span key={`prop-${lineIndex}`} className="text-blue-600 dark:text-blue-400">{property}</span>)
      nodes.push(<span key={`colon-${lineIndex}`} className="text-foreground">:</span>)
      
      // 值可能包含颜色、数字等
      const valueNodes = highlightCssValue(value, lineIndex)
      nodes.push(...valueNodes)
    } else {
      nodes.push(line)
    }
  })
  
  return nodes
}

/**
 * 高亮 CSS 值
 */
function highlightCssValue(value: string, lineIndex: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  
  // 匹配颜色值、数字、关键字
  const valueRe = /(#[0-9a-fA-F]{3,8})|(\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|deg|s|ms)?)|([a-z-]+)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  
  while ((match = valueRe.exec(value)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index))
    }
    
    if (match[1]) {
      // 颜色值
      nodes.push(<span key={`color-${lineIndex}-${match.index}`} className="text-pink-600 dark:text-pink-400">{match[1]}</span>)
    } else if (match[2]) {
      // 数字
      nodes.push(<span key={`num-${lineIndex}-${match.index}`} className="text-amber-600 dark:text-amber-400">{match[2]}</span>)
    } else if (match[3]) {
      // 关键字
      nodes.push(<span key={`keyword-${lineIndex}-${match.index}`} className="text-emerald-600 dark:text-emerald-400">{match[3]}</span>)
    }
    
    lastIndex = match.index + match[0].length
  }
  
  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex))
  }
  
  return nodes
}

/**
 * JavaScript 语法高亮（优化版本）
 */
function highlightJavaScript(js: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  
  // 简化的正则，限制字符串和注释的长度
  const combinedRe = /(["'`])(?:[^"'`\\]|\\.){0,200}?\1|\/\/[^\n]{0,200}|\/\*[\s\S]{0,500}?\*\/|\b(function|const|let|var|if|else|for|while|return|class|import|export|from|default|async|await|try|catch|finally|throw|new|this|super|extends|static|get|set|typeof|instanceof|in|of|void|delete|yield|switch|case|break|continue|do)\b|(\d+\.?\d*(?:[eE][+-]?\d+)?)/gm
  
  let lastIndex = 0
  let match: RegExpExecArray | null
  let matchCount = 0
  const MAX_MATCHES = 3000
  
  while ((match = combinedRe.exec(js)) !== null && matchCount++ < MAX_MATCHES) {
    if (match.index > lastIndex) {
      nodes.push(js.slice(lastIndex, match.index))
    }
    
    const fullMatch = match[0]
    
    if (fullMatch.startsWith('"') || fullMatch.startsWith("'") || fullMatch.startsWith('`')) {
      // 字符串
      nodes.push(<span key={match.index} className="text-emerald-600 dark:text-emerald-400">{fullMatch}</span>)
    } else if (fullMatch.startsWith('//') || fullMatch.startsWith('/*')) {
      // 注释
      nodes.push(<span key={match.index} className="text-gray-500 dark:text-gray-400 italic">{fullMatch}</span>)
    } else if (match[2]) {
      // 关键字
      nodes.push(<span key={match.index} className="text-purple-600 dark:text-purple-400 font-semibold">{match[2]}</span>)
    } else if (match[3]) {
      // 数字
      nodes.push(<span key={match.index} className="text-amber-600 dark:text-amber-400">{match[3]}</span>)
    } else {
      nodes.push(fullMatch)
    }
    
    lastIndex = match.index + fullMatch.length
  }
  
  if (lastIndex < js.length) {
    nodes.push(js.slice(lastIndex))
  }
  
  return nodes
}

/**
 * 根据语言类型进行语法高亮（带性能优化）
 */
export function highlightCode(code: string, language?: 'json' | 'html' | 'css' | 'javascript' | 'text'): React.ReactNode[] {
  // 性能检查：内容过大或过长则不高亮
  if (!shouldHighlight(code)) {
    return [code]
  }
  
  const lang = language || detectLanguage(code)
  
  try {
    const startTime = performance.now()
    let result: React.ReactNode[]
    
    switch (lang) {
      case 'json':
        result = highlightJson(code)
        break
      case 'html':
        result = highlightHtml(code)
        break
      case 'css':
        result = highlightCss(code)
        break
      case 'javascript':
        result = highlightJavaScript(code)
        break
      default:
        return [code]
    }
    
    const duration = performance.now() - startTime
    // 如果高亮耗时超过 100ms，输出警告
    if (duration > 100) {
      console.warn(`Syntax highlighting took ${duration.toFixed(2)}ms for ${code.length} chars`)
    }
    
    return result
  } catch (error) {
    // 如果高亮失败，返回原始代码
    console.error('Syntax highlighting error:', error)
    return [code]
  }
}

/**
 * 判断字符串是否为合法 JSON
 */
export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str)
    return true
  } catch {
    return false
  }
}
