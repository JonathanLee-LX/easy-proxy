/**
 * 代码修复工具
 * 提供基于规则的修复和AI辅助修复
 */

import { validateContent } from './syntax-highlight'

/**
 * 基于规则的简单修复
 * 修复常见的语法错误,如缺失的括号、引号等
 */
function simpleFixCode(code: string, type: 'json' | 'html' | 'css' | 'javascript'): string {
  let fixed = code
  
  switch (type) {
    case 'json':
      // 尝试修复JSON
      fixed = fixJsonQuotes(fixed)
      fixed = fixJsonTrailingCommas(fixed)
      break
    
    case 'javascript':
      // 尝试修复JavaScript
      fixed = fixMissingBrackets(fixed)
      fixed = fixMissingQuotes(fixed)
      break
    
    case 'html':
      // 尝试修复HTML标签
      fixed = fixHtmlTags(fixed)
      break
    
    case 'css':
      // 尝试修复CSS
      fixed = fixCssBrackets(fixed)
      break
  }
  
  return fixed
}

/**
 * 修复JSON中的引号问题
 */
function fixJsonQuotes(json: string): string {
  // 将单引号替换为双引号(JSON标准要求双引号)
  let fixed = json.replace(/'/g, '"')
  
  // 修复属性名没有引号的情况
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
  
  return fixed
}

/**
 * 移除JSON中的尾随逗号
 */
function fixJsonTrailingCommas(json: string): string {
  // 移除对象和数组末尾的逗号
  return json.replace(/,(\s*[}\]])/g, '$1')
}

/**
 * 修复缺失的括号
 */
function fixMissingBrackets(code: string): string {
  const brackets = { '{': '}', '[': ']', '(': ')' }
  const stack: string[] = []
  let inString = false
  let stringChar = ''
  
  for (let i = 0; i < code.length; i++) {
    const char = code[i]
    const prevChar = i > 0 ? code[i - 1] : ''
    
    // 处理字符串
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true
        stringChar = char
      } else if (char === stringChar) {
        inString = false
      }
    }
    
    if (!inString) {
      if (char in brackets) {
        stack.push(char)
      } else if (Object.values(brackets).includes(char)) {
        const expected = Object.keys(brackets).find(k => brackets[k as keyof typeof brackets] === char)
        if (stack.length > 0 && stack[stack.length - 1] === expected) {
          stack.pop()
        }
      }
    }
  }
  
  // 添加缺失的闭合括号
  let fixed = code
  while (stack.length > 0) {
    const open = stack.pop()!
    const close = brackets[open as keyof typeof brackets]
    fixed += close
  }
  
  return fixed
}

/**
 * 修复缺失的引号
 */
function fixMissingQuotes(code: string): string {
  // 这是一个简化的实现,实际中很难准确判断
  let fixed = code
  let quoteCount = { '"': 0, "'": 0, '`': 0 }
  
  for (const char of code) {
    if (char === '"' || char === "'" || char === '`') {
      quoteCount[char]++
    }
  }
  
  // 如果引号数量是奇数,在末尾添加对应的引号
  if (quoteCount['"'] % 2 !== 0) fixed += '"'
  if (quoteCount["'"] % 2 !== 0) fixed += "'"
  if (quoteCount['`'] % 2 !== 0) fixed += '`'
  
  return fixed
}

/**
 * 修复HTML标签
 */
function fixHtmlTags(html: string): string {
  const stack: string[] = []
  const selfClosingTags = ['br', 'hr', 'img', 'input', 'link', 'meta', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']
  
  const tagRe = /<\/?([a-z][\w-]*)\b[^>]*>/gi
  let match: RegExpExecArray | null
  
  while ((match = tagRe.exec(html)) !== null) {
    const fullMatch = match[0]
    const tagName = match[1].toLowerCase()
    
    const isSelfClosing = fullMatch.endsWith('/>') || selfClosingTags.includes(tagName)
    
    if (fullMatch.startsWith('</')) {
      // 闭合标签
      if (stack.length > 0 && stack[stack.length - 1] === tagName) {
        stack.pop()
      }
    } else if (!isSelfClosing) {
      // 开始标签
      stack.push(tagName)
    }
  }
  
  // 添加缺失的闭合标签
  let fixed = html
  while (stack.length > 0) {
    const tag = stack.pop()!
    fixed += `</${tag}>`
  }
  
  return fixed
}

/**
 * 修复CSS大括号
 */
function fixCssBrackets(css: string): string {
  let braceCount = 0
  let inString = false
  let stringChar = ''
  
  for (let i = 0; i < css.length; i++) {
    const char = css[i]
    const prevChar = i > 0 ? css[i - 1] : ''
    
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true
        stringChar = char
      } else if (char === stringChar) {
        inString = false
      }
    }
    
    if (!inString) {
      if (char === '{') braceCount++
      else if (char === '}') braceCount--
    }
  }
  
  // 添加缺失的闭合大括号
  let fixed = css
  while (braceCount > 0) {
    fixed += '\n}'
    braceCount--
  }
  
  return fixed
}

/**
 * AI配置接口
 */
export interface AIConfig {
  provider: 'openai' | 'anthropic'
  apiKey: string
  baseUrl?: string
  model?: string
}

/**
 * 获取AI配置
 */
function getAIConfig(): AIConfig | null {
  const provider = (import.meta.env.VITE_AI_PROVIDER || 'openai') as 'openai' | 'anthropic'
  const apiKey = import.meta.env.VITE_AI_API_KEY
  
  if (!apiKey) {
    return null
  }
  
  const config: AIConfig = {
    provider,
    apiKey,
    baseUrl: import.meta.env.VITE_AI_BASE_URL,
    model: import.meta.env.VITE_AI_MODEL,
  }
  
  // 设置默认值
  if (!config.baseUrl) {
    config.baseUrl = provider === 'anthropic' 
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://api.openai.com/v1/chat/completions'
  }
  
  if (!config.model) {
    config.model = provider === 'anthropic' 
      ? 'claude-3-5-sonnet-20241022'
      : 'gpt-4o-mini'
  }
  
  return config
}

/**
 * AI辅助修复代码
 * 如果配置了AI API,则使用AI进行修复;否则使用简单规则修复
 */
export async function fixCode(code: string): Promise<{ fixed: string; method: 'ai' | 'rules' | 'none'; success: boolean }> {
  if (!code.trim()) {
    return { fixed: code, method: 'none', success: true }
  }
  
  // 首先验证代码
  const validation = validateContent(code)
  
  if (validation.valid) {
    return { fixed: code, method: 'none', success: true }
  }
  
  // 检测代码类型
  const typeStr = validation.type?.toLowerCase()
  
  if (!typeStr || typeStr === 'text') {
    return { fixed: code, method: 'none', success: false }
  }
  
  const type = typeStr as 'json' | 'html' | 'css' | 'javascript'
  
  // 检查是否配置了AI API
  const aiConfig = getAIConfig()
  
  if (aiConfig) {
    try {
      const fixed = await fixWithAI(code, type, aiConfig)
      
      // 验证修复后的代码
      const fixedValidation = validateContent(fixed)
      if (fixedValidation.valid) {
        return { fixed, method: 'ai', success: true }
      }
    } catch (error) {
      console.warn('AI修复失败,尝试使用规则修复:', error)
    }
  }
  
  // 使用简单规则修复
  const fixed = simpleFixCode(code, type)
  
  // 验证修复结果
  const fixedValidation = validateContent(fixed)
  
  return {
    fixed,
    method: 'rules',
    success: fixedValidation.valid
  }
}

/**
 * 使用OpenAI API修复代码
 */
async function fixWithOpenAI(code: string, type: string, config: AIConfig): Promise<string> {
  const systemPrompt = `You are a code fixing assistant. Fix syntax errors in ${type.toUpperCase()} code. Return only the fixed code without explanations or markdown formatting.`
  const userPrompt = `Please fix the syntax errors in the following ${type.toUpperCase()} code. Return ONLY the fixed code without any explanations:

${code}`
  
  const response = await fetch(config.baseUrl!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API错误 (${response.status}): ${errorText}`)
  }
  
  const data = await response.json()
  const fixed = data.choices?.[0]?.message?.content?.trim()
  
  if (!fixed) {
    throw new Error('OpenAI返回了空结果')
  }
  
  return cleanAIResponse(fixed)
}

/**
 * 使用Anthropic API修复代码
 */
async function fixWithAnthropic(code: string, type: string, config: AIConfig): Promise<string> {
  const systemPrompt = `You are a code fixing assistant. Fix syntax errors in ${type.toUpperCase()} code. Return only the fixed code without explanations or markdown formatting.`
  const userPrompt = `Please fix the syntax errors in the following ${type.toUpperCase()} code. Return ONLY the fixed code without any explanations:

${code}`
  
  const response = await fetch(config.baseUrl!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: 0.3
    })
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic API错误 (${response.status}): ${errorText}`)
  }
  
  const data = await response.json()
  const fixed = data.content?.[0]?.text?.trim()
  
  if (!fixed) {
    throw new Error('Anthropic返回了空结果')
  }
  
  return cleanAIResponse(fixed)
}

/**
 * 清理AI响应,移除markdown代码块标记
 */
function cleanAIResponse(text: string): string {
  // 移除可能的markdown代码块标记
  let cleaned = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
  
  // 移除可能的解释性文本
  const lines = cleaned.split('\n')
  if (lines.length > 0 && !lines[0].trim().match(/^[{<\[a-z@]/i)) {
    // 如果第一行不像代码,移除它
    lines.shift()
    cleaned = lines.join('\n').trim()
  }
  
  return cleaned
}

/**
 * 使用AI修复代码(根据配置选择提供商)
 */
async function fixWithAI(code: string, type: string, config: AIConfig): Promise<string> {
  if (config.provider === 'anthropic') {
    return fixWithAnthropic(code, type, config)
  } else {
    return fixWithOpenAI(code, type, config)
  }
}
