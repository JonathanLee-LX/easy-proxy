/**
 * 格式化工具
 * 使用 Prettier 进行专业的代码格式化
 */

import * as prettier from 'prettier'

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
 * 使用 Prettier 格式化代码
 */
async function formatWithPrettier(content: string, parser: 'json' | 'html' | 'css' | 'babel'): Promise<string> {
  try {
    const formatted = await prettier.format(content, {
      parser,
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      bracketSpacing: true,
      arrowParens: 'always',
    })
    return formatted.trim()
  } catch (error) {
    throw new Error(`格式化失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

/**
 * 自动格式化内容
 * 根据内容类型自动选择合适的格式化方式,使用 Prettier 进行专业格式化
 */
export async function formatContent(content: string): Promise<{ formatted: string; type: string }> {
  const type = detectContentType(content)
  
  try {
    let formatted: string
    let typeName: string
    
    switch (type) {
      case 'json':
        formatted = await formatWithPrettier(content, 'json')
        typeName = 'JSON'
        break
      case 'html':
        formatted = await formatWithPrettier(content, 'html')
        typeName = 'HTML'
        break
      case 'css':
        formatted = await formatWithPrettier(content, 'css')
        typeName = 'CSS'
        break
      case 'javascript':
        formatted = await formatWithPrettier(content, 'babel')
        typeName = 'JavaScript'
        break
      default:
        formatted = content
        typeName = 'Unknown'
    }
    
    return { formatted, type: typeName }
  } catch (error) {
    throw new Error(`格式化失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}
