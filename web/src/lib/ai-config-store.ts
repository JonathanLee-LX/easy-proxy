/**
 * AI配置存储服务
 * 使用localStorage保存AI配置
 */

export interface AIConfig {
  enabled: boolean
  provider: 'openai' | 'anthropic'
  apiKey: string
  baseUrl: string
  model: string
}

const STORAGE_KEY = 'easy-proxy-ai-config'

const DEFAULT_CONFIG: AIConfig = {
  enabled: false,
  provider: 'openai',
  apiKey: '',
  baseUrl: '',
  model: '',
}

const DEFAULT_URLS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
}

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-20241022',
}

/**
 * 获取AI配置
 */
export function getAIConfig(): AIConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const config = JSON.parse(stored) as AIConfig
      
      // 填充默认值
      if (!config.baseUrl) {
        config.baseUrl = DEFAULT_URLS[config.provider]
      }
      if (!config.model) {
        config.model = DEFAULT_MODELS[config.provider]
      }
      
      return config
    }
  } catch (error) {
    console.error('读取AI配置失败:', error)
  }
  
  // 尝试从环境变量读取
  const envConfig = getConfigFromEnv()
  if (envConfig) {
    return envConfig
  }
  
  return { ...DEFAULT_CONFIG }
}

/**
 * 从环境变量读取配置
 */
function getConfigFromEnv(): AIConfig | null {
  const apiKey = import.meta.env.VITE_AI_API_KEY
  
  if (!apiKey) {
    return null
  }
  
  const provider = (import.meta.env.VITE_AI_PROVIDER || 'openai') as 'openai' | 'anthropic'
  const baseUrl = import.meta.env.VITE_AI_BASE_URL || DEFAULT_URLS[provider]
  const model = import.meta.env.VITE_AI_MODEL || DEFAULT_MODELS[provider]
  
  return {
    enabled: true,
    provider,
    apiKey,
    baseUrl,
    model,
  }
}

/**
 * 保存AI配置
 */
export function saveAIConfig(config: AIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (error) {
    console.error('保存AI配置失败:', error)
    throw new Error('保存配置失败')
  }
}

/**
 * 重置AI配置
 */
export function resetAIConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('重置AI配置失败:', error)
  }
}

/**
 * 检查AI配置是否可用
 */
export function isAIConfigValid(config: AIConfig): boolean {
  return config.enabled && !!config.apiKey && !!config.baseUrl && !!config.model
}

/**
 * 获取默认配置值
 */
export function getDefaultValues(provider: 'openai' | 'anthropic') {
  return {
    baseUrl: DEFAULT_URLS[provider],
    model: DEFAULT_MODELS[provider],
  }
}
