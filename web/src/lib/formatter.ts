/**
 * 格式化工具
 * 支持 JSON, HTML, JavaScript, CSS 等内容的格式化
 */

/**
 * 检测内容类型
 */
export function detectContentType(content: string): 'json' | 'html' | 'css' | 'javascript' | 'unknown' {
  const trimmed = content.trim()
  
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
  
  return 'unknown'
}

/**
 * 格式化 JSON
 */
function formatJson(content: string): string {
  const obj = JSON.parse(content)
  return JSON.stringify(obj, null, 2)
}

/**
 * 格式化 HTML
 */
function formatHtml(content: string): string {
  let formatted = ''
  let indent = 0
  const indentSize = 2
  
  // 移除多余的空白
  content = content.replace(/>\s+</g, '><').trim()
  
  // 自闭合标签和需要特殊处理的标签
  const selfClosingTags = ['br', 'hr', 'img', 'input', 'link', 'meta', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']
  const inlineTags = ['span', 'a', 'strong', 'em', 'b', 'i', 'u', 'small', 'mark', 'del', 'ins', 'sub', 'sup']
  
  let i = 0
  while (i < content.length) {
    if (content[i] === '<') {
      // 找到标签结束位置
      const tagEnd = content.indexOf('>', i)
      if (tagEnd === -1) break
      
      const tag = content.substring(i, tagEnd + 1)
      const isClosing = tag.startsWith('</')
      const isSelfClosing = tag.endsWith('/>') || selfClosingTags.some(t => new RegExp(`<${t}\\b`, 'i').test(tag))
      const isComment = tag.startsWith('<!--')
      const isDoctype = tag.toLowerCase().startsWith('<!doctype')
      
      // 获取标签名
      let tagName = ''
      if (isClosing) {
        tagName = tag.match(/<\/([a-z0-9]+)/i)?.[1] || ''
      } else if (!isComment && !isDoctype) {
        tagName = tag.match(/<([a-z0-9]+)/i)?.[1] || ''
      }
      
      const isInline = inlineTags.includes(tagName.toLowerCase())
      
      // 处理缩进
      if (isClosing) {
        indent = Math.max(0, indent - 1)
      }
      
      // 添加换行和缩进（除非是内联标签）
      if (!isInline && formatted.length > 0 && !formatted.endsWith('\n')) {
        formatted += '\n'
      }
      
      if (!isInline) {
        formatted += ' '.repeat(indent * indentSize)
      }
      
      formatted += tag
      
      // 增加缩进（对于开始标签）
      if (!isClosing && !isSelfClosing && !isComment && !isDoctype && !isInline) {
        indent++
      }
      
      i = tagEnd + 1
    } else {
      // 文本内容
      const nextTag = content.indexOf('<', i)
      let text = content.substring(i, nextTag === -1 ? content.length : nextTag)
      
      // 只移除前后的换行和多余空白，但保留单个空格
      text = text.replace(/^\s+/, '').replace(/\s+$/, '')
      
      if (text) {
        // 将内部的多个空白字符合并为单个空格
        text = text.replace(/\s+/g, ' ')
        formatted += text
      }
      
      i = nextTag === -1 ? content.length : nextTag
    }
  }
  
  return formatted.trim()
}

/**
 * 格式化 CSS
 */
function formatCss(content: string): string {
  let formatted = ''
  let indent = 0
  const indentSize = 2
  
  // 移除多余的空白
  content = content.replace(/\s+/g, ' ').trim()
  
  let i = 0
  while (i < content.length) {
    const char = content[i]
    
    if (char === '{') {
      formatted += ' {\n'
      indent++
      i++
    } else if (char === '}') {
      formatted += '\n'
      indent = Math.max(0, indent - 1)
      formatted += ' '.repeat(indent * indentSize) + '}'
      
      // 在规则之间添加空行
      if (i + 1 < content.length && content[i + 1] !== '}') {
        formatted += '\n\n'
      }
      i++
    } else if (char === ';') {
      formatted += ';\n'
      i++
      // 跳过分号后的空格
      while (i < content.length && content[i] === ' ') {
        i++
      }
    } else {
      // 添加适当的缩进
      if (formatted.endsWith('\n')) {
        formatted += ' '.repeat(indent * indentSize)
      }
      formatted += char
      i++
    }
  }
  
  return formatted.trim()
}

/**
 * 格式化 JavaScript
 */
function formatJavaScript(content: string): string {
  let formatted = ''
  let indent = 0
  const indentSize = 2
  
  // 移除多余的空白（但保留字符串内的空白）
  let inString = false
  let stringChar = ''
  let escaped = false
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const prevChar = i > 0 ? content[i - 1] : ''
    
    // 处理字符串
    if ((char === '"' || char === "'" || char === '`') && !escaped) {
      if (!inString) {
        inString = true
        stringChar = char
      } else if (char === stringChar) {
        inString = false
        stringChar = ''
      }
    }
    
    escaped = char === '\\' && !escaped
    
    if (inString) {
      formatted += char
      continue
    }
    
    // 处理大括号
    if (char === '{') {
      formatted += ' {\n'
      indent++
      continue
    }
    
    if (char === '}') {
      indent = Math.max(0, indent - 1)
      formatted = formatted.trimEnd() + '\n' + ' '.repeat(indent * indentSize) + '}'
      continue
    }
    
    // 处理分号
    if (char === ';') {
      formatted += ';\n'
      continue
    }
    
    // 处理换行
    if (char === '\n') {
      formatted += '\n'
      // 跳过后续的空白字符
      while (i + 1 < content.length && /\s/.test(content[i + 1])) {
        i++
      }
      continue
    }
    
    // 跳过多余的空格
    if (char === ' ' && prevChar === ' ') {
      continue
    }
    
    // 添加字符
    if (formatted.endsWith('\n') && char !== ' ') {
      formatted += ' '.repeat(indent * indentSize)
    }
    
    formatted += char
  }
  
  return formatted.trim()
}

/**
 * 自动格式化内容
 * 根据内容类型自动选择合适的格式化方式
 */
export function formatContent(content: string): { formatted: string; type: string } {
  const type = detectContentType(content)
  
  try {
    switch (type) {
      case 'json':
        return { formatted: formatJson(content), type: 'JSON' }
      case 'html':
        return { formatted: formatHtml(content), type: 'HTML' }
      case 'css':
        return { formatted: formatCss(content), type: 'CSS' }
      case 'javascript':
        return { formatted: formatJavaScript(content), type: 'JavaScript' }
      default:
        return { formatted: content, type: 'Unknown' }
    }
  } catch (error) {
    // 如果格式化失败，返回原内容
    throw new Error(`格式化失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}
