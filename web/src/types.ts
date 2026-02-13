export interface ProxyRecord {
  id?: number
  method: string
  source: string
  target: string
  time: string
  mock?: boolean
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
  headers: Record<string, string>
  body: string
  enabled: boolean
}
