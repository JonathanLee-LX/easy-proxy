import type React from 'react'

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
 * JSON 语法高亮
 */
function highlightJson(json: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const tokenRe = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false)\b|\b(null)\b|([{}[\]:,])/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(json)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(json.slice(lastIndex, match.index))
    }
    const [, key, str, num, bool, nil, punct] = match
    if (key !== undefined) {
      nodes.push(<span key={match.index} className="text-purple-600 dark:text-purple-400">{key}</span>)
      nodes.push(':')
    } else if (str !== undefined) {
      nodes.push(<span key={match.index} className="text-emerald-600 dark:text-emerald-400">{str}</span>)
    } else if (num !== undefined) {
      nodes.push(<span key={match.index} className="text-blue-600 dark:text-blue-400">{num}</span>)
    } else if (bool !== undefined) {
      nodes.push(<span key={match.index} className="text-amber-600 dark:text-amber-400">{bool}</span>)
    } else if (nil !== undefined) {
      nodes.push(<span key={match.index} className="text-red-400">{nil}</span>)
    } else if (punct !== undefined) {
      nodes.push(<span key={match.index} className="text-muted-foreground">{punct}</span>)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < json.length) {
    nodes.push(json.slice(lastIndex))
  }
  return nodes
}

/**
 * HTML 语法高亮
 */
function highlightHtml(html: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  
  // 匹配 HTML 标签、注释、文本
  const tagRe = /<!--[\s\S]*?-->|<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi
  let match: RegExpExecArray | null
  let currentIndex = 0
  
  while ((match = tagRe.exec(html)) !== null) {
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
 * CSS 语法高亮
 */
function highlightCss(css: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  
  // 匹配选择器、属性、值、注释
  const lines = css.split('\n')
  
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
 * JavaScript 语法高亮
 */
function highlightJavaScript(js: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  
  // 组合所有正则：字符串、注释、关键字、数字
  const combinedRe = /(["'`])(?:(?=(\\?))\2.)*?\1|\/\/.*$|\/\*[\s\S]*?\*\/|\b(function|const|let|var|if|else|for|while|return|class|import|export|from|default|async|await|try|catch|finally|throw|new|this|super|extends|static|get|set|typeof|instanceof|in|of|void|delete|yield|switch|case|break|continue|do)\b|\b(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/gm
  
  let lastIndex = 0
  let match: RegExpExecArray | null
  
  while ((match = combinedRe.exec(js)) !== null) {
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
    } else if (match[3]) {
      // 关键字
      nodes.push(<span key={match.index} className="text-purple-600 dark:text-purple-400 font-semibold">{match[3]}</span>)
    } else if (match[4]) {
      // 数字
      nodes.push(<span key={match.index} className="text-amber-600 dark:text-amber-400">{match[4]}</span>)
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
 * 根据语言类型进行语法高亮
 */
export function highlightCode(code: string, language?: 'json' | 'html' | 'css' | 'javascript' | 'text'): React.ReactNode[] {
  const lang = language || detectLanguage(code)
  
  try {
    switch (lang) {
      case 'json':
        return highlightJson(code)
      case 'html':
        return highlightHtml(code)
      case 'css':
        return highlightCss(code)
      case 'javascript':
        return highlightJavaScript(code)
      default:
        return [code]
    }
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
