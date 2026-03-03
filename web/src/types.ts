export type ResourceType = 
  | 'all'
  | 'fetch'
  | 'doc'
  | 'css'
  | 'js'
  | 'font'
  | 'img'
  | 'media'
  | 'manifest'
  | 'websocket'
  | 'wasm'
  | 'other'

export interface ProxyRecord {
  id?: number
  method: string
  source: string
  target: string
  time: string
  mock?: boolean
  protocol?: string // 'h2' | 'h1.1'
  statusCode?: number
  duration?: number // milliseconds
}

export interface RecordDetail {
  requestHeaders: Record<string, string>
  requestBody: string
  responseHeaders: Record<string, string>
  responseBody: string
  statusCode: number
  statusMessage: string
}

export interface RuleItem {
  enabled: boolean
  rule: string
  target: string
}

export interface MockRule {
  id: number
  name: string
  urlPattern: string
  method: string
  statusCode: number
  delay: number // milliseconds, 0 = no delay
  bodyType: 'inline' | 'file' // inline: 自定义内容, file: 本地文件路径
  headers: Record<string, string>
  body: string // bodyType=inline 时为响应内容, bodyType=file 时为文件路径
  enabled: boolean
}

export interface Plugin {
  id: string
  name: string
  version: string
  hooks: string[]
  permissions: string[]
  priority: number
  state: 'running' | 'stopped' | 'error' | 'disabled' | 'ready' | 'registered'
  stats: Record<string, unknown> | null
}

export interface RuleFile {
  name: string
  enabled: boolean
  ruleCount: number
}
