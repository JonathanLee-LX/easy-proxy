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
  headers: Record<string, string>
  body: string
  enabled: boolean
}
