# Easy Proxy 插件系统开发指南

## 目录

- [1. 概述](#1-概述)
- [2. 核心概念](#2-核心概念)
- [3. 插件 Manifest 规范](#3-插件-manifest-规范)
- [4. 插件运行时接口](#4-插件运行时接口)
- [5. Hook 协议详解](#5-hook-协议详解)
- [6. 上下文对象](#6-上下文对象)
- [7. 插件能力 API](#7-插件能力-api)
- [8. 错误处理与超时](#8-错误处理与超时)
- [9. 权限模型](#9-权限模型)
- [10. 完整示例](#10-完整示例)
- [11. 最佳实践](#11-最佳实践)

---

## 1. 概述

Easy Proxy 插件系统提供了一套标准化的扩展机制，允许开发者通过插件的方式添加自定义功能，而无需修改核心代理逻辑。插件系统基于 Hook 协议，可以在请求的不同生命周期阶段介入处理。

### 1.1 主要特性

- **生命周期管理**：完整的插件启动、运行、停止、销毁流程
- **Hook 协议**：在请求的关键阶段注入自定义逻辑
- **权限控制**：细粒度的能力访问权限管理
- **错误隔离**：插件异常不影响代理主链路
- **性能监控**：自动记录插件执行耗时和错误统计
- **优先级调度**：支持插件执行顺序控制

---

## 2. 核心概念

### 2.1 插件类型

- **builtin**：内置插件，与 Easy Proxy 一起发布
- **local**：本地插件，用户自定义的插件

### 2.2 插件状态

插件在运行时会经历以下状态：

```
registered → ready → running → stopped → disposed
                ↓
            disabled (发生错误时)
```

- `registered`：插件已注册
- `ready`：setup 完成，准备启动
- `running`：插件正在运行
- `stopped`：插件已停止
- `disposed`：插件已销毁
- `disabled`：插件因错误被禁用

### 2.3 健康状态

- `healthy`：插件运行正常
- `degraded`：插件有错误或超时
- `disabled`：插件已被禁用
- `inactive`：插件未运行

---

## 3. 插件 Manifest 规范

Manifest 是插件的元数据描述文件，定义了插件的基本信息、权限、Hook 等。

### 3.1 完整定义

```typescript
export type PluginManifest = {
  id: string                    // 插件唯一标识
  name: string                  // 插件名称
  version: string               // 插件版本
  apiVersion: '1.x'            // API 版本
  type: 'builtin' | 'local'    // 插件类型
  permissions: Permission[]     // 权限列表
  hooks: HookName[]            // 声明的 Hook
  priority?: number            // 优先级（默认 100）
  dependencies?: string[]      // 依赖的其他插件
  configSchema?: JsonSchema    // 配置 Schema
}
```

### 3.2 字段说明

#### id（必填）

插件的全局唯一标识符，建议格式：`org.plugin-name`

**示例：**
```javascript
id: 'builtin.logger'        // 内置日志插件
id: 'builtin.router'        // 内置路由插件
id: 'company.custom-auth'   // 自定义认证插件
```

#### name（必填）

插件的显示名称，用于 UI 展示。

**示例：**
```javascript
name: 'Request Logger'
name: 'Mock Server'
```

#### version（必填）

插件版本号，建议遵循语义化版本规范。

**示例：**
```javascript
version: '1.0.0'
version: '2.1.3'
```

#### apiVersion（必填）

插件使用的 API 版本，当前为 `'1.x'`。

**约束：**
- `1.x` 内保持向后兼容
- `2.0` 才允许破坏性变更

#### type（必填）

插件类型，可选值：
- `builtin`：内置插件
- `local`：本地插件

#### permissions（必填）

插件需要的权限列表，必须声明所有需要使用的权限。

**示例：**
```javascript
permissions: [
  'proxy:read',
  'proxy:write',
  'storage:write'
]
```

#### hooks（必填）

插件声明的 Hook 列表，只有声明的 Hook 才会被调用。

**示例：**
```javascript
hooks: [
  'onRequestStart',
  'onBeforeProxy',
  'onAfterResponse'
]
```

#### priority（可选）

插件执行优先级，数字越小优先级越高，默认为 100。

**示例：**
```javascript
priority: 10   // 高优先级
priority: 100  // 默认优先级
priority: 200  // 低优先级
```

**排序规则：**
1. 首先按 priority 数字升序排序
2. priority 相同时按 id 字母序排序

#### dependencies（可选）

依赖的其他插件 ID 列表。

**示例：**
```javascript
dependencies: ['builtin.logger', 'builtin.router']
```

#### configSchema（可选）

插件配置的 JSON Schema，用于验证和 UI 自动渲染。

**示例：**
```javascript
configSchema: {
  type: 'object',
  properties: {
    enabled: { type: 'boolean', default: true },
    timeout: { type: 'number', default: 5000 }
  }
}
```

### 3.3 完整示例

```javascript
const manifest = {
  id: 'builtin.logger',
  name: 'Request Logger',
  version: '1.0.0',
  apiVersion: '1.x',
  type: 'builtin',
  permissions: [
    'proxy:read',
    'storage:write',
    'config:read'
  ],
  hooks: [
    'onRequestStart',
    'onAfterResponse',
    'onError'
  ],
  priority: 50,
  dependencies: [],
  configSchema: {
    type: 'object',
    properties: {
      maxEntries: {
        type: 'number',
        default: 1000,
        description: '最大日志条目数'
      },
      enableWebSocket: {
        type: 'boolean',
        default: true,
        description: '启用 WebSocket 推送'
      }
    }
  }
}
```

---

## 4. 插件运行时接口

插件必须实现 `Plugin` 接口，其中 `manifest` 和 `setup` 是必需的。

### 4.1 完整接口定义

```typescript
export type Plugin = {
  manifest: PluginManifest
  
  // 生命周期方法
  setup(ctx: PluginContext): Promise<void> | void
  start?(): Promise<void> | void
  stop?(): Promise<void> | void
  dispose?(): Promise<void> | void
  
  // Hook 方法
  onRequestStart?(ctx: RequestContext): Promise<void> | void
  onBeforeProxy?(ctx: RequestContext): Promise<void> | void
  onBeforeResponse?(ctx: ResponseContext): Promise<void> | void
  onAfterResponse?(ctx: ResponseContext): Promise<void> | void
  onError?(ctx: ErrorContext): Promise<void> | void
}
```

### 4.2 生命周期方法

#### setup(ctx: PluginContext)

**必需方法**，在插件装配阶段调用，只执行一次。

**用途：**
- 初始化插件资源
- 读取配置
- 设置存储
- 注册事件监听器

**参数：**
- `ctx`：PluginContext，提供日志、配置、存储等能力

**示例：**
```javascript
async setup(ctx) {
  this.logger = ctx.log
  this.config = ctx.config.get('settings', {})
  this.storage = ctx.store
  
  // 初始化内部状态
  this.requestCount = 0
  
  // 监听事件
  this.unsubscribe = ctx.eventBus.on('config:changed', (newConfig) => {
    this.config = newConfig
  })
  
  this.logger.info('Plugin initialized', { config: this.config })
}
```

#### start()

**可选方法**，在插件启用时调用。

**用途：**
- 启动后台任务
- 建立外部连接
- 开始监听

**示例：**
```javascript
async start() {
  this.logger.info('Plugin starting')
  
  // 启动定时任务
  this.timer = setInterval(() => {
    this.logger.debug('Heartbeat', { count: this.requestCount })
  }, 60000)
  
  // 建立数据库连接
  if (this.config.enableDb) {
    this.db = await connectToDatabase(this.config.dbUrl)
  }
}
```

#### stop()

**可选方法**，在插件停用时调用。

**用途：**
- 停止后台任务
- 断开连接
- 保存状态

**示例：**
```javascript
async stop() {
  this.logger.info('Plugin stopping')
  
  // 停止定时任务
  if (this.timer) {
    clearInterval(this.timer)
    this.timer = null
  }
  
  // 断开数据库连接
  if (this.db) {
    await this.db.close()
    this.db = null
  }
  
  // 保存状态
  this.storage.set('lastRequestCount', this.requestCount)
}
```

#### dispose()

**可选方法**，在插件卸载时调用，释放所有资源。

**用途：**
- 清理所有资源
- 取消事件监听
- 释放内存

**示例：**
```javascript
async dispose() {
  this.logger.info('Plugin disposing')
  
  // 取消事件监听
  if (this.unsubscribe) {
    this.unsubscribe()
  }
  
  // 清理引用
  this.logger = null
  this.config = null
  this.storage = null
  this.requestCount = 0
}
```

---

## 5. Hook 协议详解

Hook 是插件介入请求生命周期的切入点。每个 Hook 都有明确的时机和用途。

### 5.1 请求生命周期

```
客户端请求
    ↓
onRequestStart ─────→ 请求进入代理
    ↓
onBeforeProxy ──────→ 即将转发前（可短路）
    ↓
    转发到上游
    ↓
onBeforeResponse ───→ 响应返回前
    ↓
onAfterResponse ────→ 响应完成后（异步）
    ↓
客户端收到响应

任意阶段发生错误 ───→ onError
```

### 5.2 Hook 方法详解

#### onRequestStart(ctx: RequestContext)

**触发时机：** 请求刚进入代理，尚未进行路由决策

**用途：**
- 生成请求 ID 和 traceId
- 记录请求开始时间
- 请求预处理
- 打点统计

**限制：**
- 不可直接写响应
- 不应修改请求内容

**示例：**
```javascript
async onRequestStart(ctx) {
  // 记录请求开始
  const startTime = Date.now()
  ctx.meta.startTime = startTime
  
  // 打点统计
  this.requestCount++
  this.logger.info('Request started', {
    requestId: ctx.requestId,
    method: ctx.request.method,
    url: ctx.request.url,
    count: this.requestCount
  })
  
  // 注入自定义 header
  ctx.request.headers['X-Request-Start-Time'] = startTime.toString()
}
```

#### onBeforeProxy(ctx: RequestContext)

**触发时机：** 即将发起上游请求之前

**用途：**
- 改写目标地址（路由）
- 修改请求头和请求体
- Mock 短路响应
- 请求拦截和验证

**限制：**
- 若调用 `ctx.respond()`，必须终止后续转发

**示例 1：路由改写**
```javascript
async onBeforeProxy(ctx) {
  // 根据规则改写目标地址
  const rule = this.matchRule(ctx.request.url)
  if (rule) {
    ctx.setTarget(rule.target)
    this.logger.info('Target rewritten', {
      requestId: ctx.requestId,
      original: ctx.request.url,
      target: rule.target
    })
  }
}
```

**示例 2：Mock 响应**
```javascript
async onBeforeProxy(ctx) {
  // 检查是否匹配 Mock 规则
  const mockData = this.findMock(ctx.request)
  if (mockData) {
    // 短路响应，不再转发
    ctx.respond({
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Mocked': 'true'
      },
      body: JSON.stringify(mockData)
    })
    
    this.logger.info('Request mocked', {
      requestId: ctx.requestId,
      url: ctx.request.url
    })
  }
}
```

**示例 3：请求头修改**
```javascript
async onBeforeProxy(ctx) {
  // 添加认证头
  if (this.config.apiKey) {
    ctx.request.headers['Authorization'] = `Bearer ${this.config.apiKey}`
  }
  
  // 添加追踪头
  ctx.request.headers['X-Trace-Id'] = ctx.traceId
  
  // 删除敏感头
  delete ctx.request.headers['Cookie']
}
```

#### onBeforeResponse(ctx: ResponseContext)

**触发时机：** 收到上游响应，返回客户端之前

**用途：**
- 响应头/体加工
- 数据脱敏
- 响应标注
- 内容转换

**限制：**
- 必须尊重响应流大小限制
- 不应执行耗时操作

**示例 1：响应头修改**
```javascript
async onBeforeResponse(ctx) {
  // 添加自定义响应头
  ctx.response.headers['X-Proxy-Time'] = (Date.now() - ctx.meta.startTime).toString()
  ctx.response.headers['X-Proxy-Version'] = '1.0.0'
  
  // 移除敏感头
  delete ctx.response.headers['Set-Cookie']
}
```

**示例 2：响应体处理**
```javascript
async onBeforeResponse(ctx) {
  // 只处理 JSON 响应
  if (ctx.response.headers['Content-Type']?.includes('application/json')) {
    try {
      const data = JSON.parse(ctx.response.body.toString())
      
      // 脱敏处理
      if (data.user && data.user.phone) {
        data.user.phone = data.user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
      }
      
      ctx.response.body = JSON.stringify(data)
    } catch (error) {
      this.logger.warn('Failed to process response body', { error: error.message })
    }
  }
}
```

#### onAfterResponse(ctx: ResponseContext)

**触发时机：** 响应完成后

**用途：**
- 日志持久化
- 异步分析
- 指标上报
- 触发通知

**限制：**
- 不得阻塞主链路
- 长任务需排入异步队列
- 不能修改响应

**示例 1：日志记录**
```javascript
async onAfterResponse(ctx) {
  const duration = Date.now() - ctx.meta.startTime
  
  // 保存请求日志
  const logEntry = {
    requestId: ctx.requestId,
    traceId: ctx.traceId,
    method: ctx.request.method,
    url: ctx.request.url,
    statusCode: ctx.response.statusCode,
    duration,
    timestamp: Date.now()
  }
  
  // 存储到本地
  this.storage.set(`log:${ctx.requestId}`, logEntry)
  
  // 如果启用 WebSocket，推送到前端
  if (this.config.enableWebSocket) {
    this.eventBus.emit('log:new', logEntry)
  }
  
  this.logger.debug('Request completed', logEntry)
}
```

**示例 2：慢请求告警**
```javascript
async onAfterResponse(ctx) {
  const duration = Date.now() - ctx.meta.startTime
  
  // 慢请求告警
  if (duration > this.config.slowThreshold) {
    this.logger.warn('Slow request detected', {
      requestId: ctx.requestId,
      url: ctx.request.url,
      duration,
      threshold: this.config.slowThreshold
    })
    
    // 发送告警通知（异步）
    setImmediate(() => {
      this.sendAlert({
        type: 'slow_request',
        url: ctx.request.url,
        duration
      })
    })
  }
}
```

#### onError(ctx: ErrorContext)

**触发时机：** 任意阶段出现错误后

**用途：**
- 错误记录
- 告警通知
- 补偿动作
- 错误分析

**限制：**
- 不得抛出未处理异常
- 不应阻塞主流程

**示例：**
```javascript
async onError(ctx) {
  // 记录错误详情
  this.logger.error('Request error', {
    requestId: ctx.requestId,
    phase: ctx.phase,
    error: ctx.error.message,
    stack: ctx.error.stack
  })
  
  // 保存错误日志
  const errorEntry = {
    requestId: ctx.requestId,
    traceId: ctx.traceId,
    phase: ctx.phase,
    error: {
      message: ctx.error.message,
      stack: ctx.error.stack
    },
    meta: ctx.meta,
    timestamp: Date.now()
  }
  
  this.storage.set(`error:${ctx.requestId}`, errorEntry)
  
  // 错误统计
  this.errorCount++
  
  // 触发告警（异步）
  if (this.shouldAlert(ctx.error)) {
    setImmediate(() => {
      this.sendErrorAlert(errorEntry)
    })
  }
}
```

---

## 6. 上下文对象

### 6.1 BaseContext

所有上下文对象的基类，包含通用字段。

```typescript
type BaseContext = {
  requestId: string    // 请求唯一标识
  traceId: string      // 追踪 ID
  now: number          // 当前时间戳
  pluginId: string     // 当前插件 ID
}
```

### 6.2 RequestContext

请求阶段的上下文对象，用于 `onRequestStart` 和 `onBeforeProxy`。

```typescript
type RequestContext = BaseContext & {
  request: {
    method: string                    // HTTP 方法
    url: string                       // 请求 URL
    headers: Record<string, string>   // 请求头
    body?: Buffer | string            // 请求体
  }
  target?: string                     // 目标地址
  meta: Record<string, unknown>       // 元数据存储
  setTarget(target: string): void     // 设置目标地址
  respond(resp: ShortCircuitResponse): void  // 短路响应
}
```

**示例：**
```javascript
async onBeforeProxy(ctx) {
  // 访问请求信息
  console.log(ctx.request.method)  // 'GET'
  console.log(ctx.request.url)     // 'http://api.example.com/users'
  
  // 修改目标
  ctx.setTarget('http://new-target.com')
  
  // 存储元数据
  ctx.meta.customData = { userId: 123 }
  
  // 短路响应
  ctx.respond({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'mocked' })
  })
}
```

### 6.3 ResponseContext

响应阶段的上下文对象，用于 `onBeforeResponse` 和 `onAfterResponse`。

```typescript
type ResponseContext = BaseContext & {
  request: RequestContext['request']  // 请求信息
  response: {
    statusCode: number                // HTTP 状态码
    headers: Record<string, string>   // 响应头
    body?: Buffer | string            // 响应体
  }
  meta: Record<string, unknown>       // 元数据存储
}
```

**示例：**
```javascript
async onBeforeResponse(ctx) {
  // 访问响应信息
  console.log(ctx.response.statusCode)  // 200
  console.log(ctx.response.headers)     // { 'Content-Type': 'application/json' }
  
  // 修改响应
  ctx.response.headers['X-Custom'] = 'value'
  
  // 读取元数据
  const startTime = ctx.meta.startTime
  const duration = Date.now() - startTime
}
```

### 6.4 ErrorContext

错误阶段的上下文对象，用于 `onError`。

```typescript
type ErrorContext = BaseContext & {
  phase: HookName                     // 发生错误的阶段
  error: Error                        // 错误对象
  meta: Record<string, unknown>       // 元数据存储
}
```

**示例：**
```javascript
async onError(ctx) {
  console.log(ctx.phase)        // 'onBeforeProxy'
  console.log(ctx.error.message) // 'Connection timeout'
  console.log(ctx.meta)         // 之前存储的元数据
}
```

---

## 7. 插件能力 API

插件通过 `PluginContext` 访问系统能力，在 `setup` 方法中获得。

### 7.1 完整接口定义

```typescript
type PluginContext = {
  log: Logger              // 日志接口
  config: ConfigAPI        // 配置接口
  store: StoreAPI          // 存储接口
  eventBus: EventBusAPI    // 事件总线
  http?: HttpAPI           // HTTP 客户端（需权限）
}
```

### 7.2 Logger 接口

结构化日志接口，自动带上插件信息。

```typescript
type Logger = {
  debug(msg: string, data?: unknown): void
  info(msg: string, data?: unknown): void
  warn(msg: string, data?: unknown): void
  error(msg: string, data?: unknown): void
}
```

**示例：**
```javascript
async setup(ctx) {
  const logger = ctx.log
  
  logger.debug('Debug message', { detail: 'value' })
  logger.info('Plugin initialized')
  logger.warn('Warning occurred', { code: 'WARN_001' })
  logger.error('Error occurred', { error: err.message })
}
```

### 7.3 Config 接口

插件配置读写接口。

```typescript
type ConfigAPI = {
  get<T = unknown>(key: string, fallback?: T): T
  set<T = unknown>(key: string, value: T): void
}
```

**权限要求：**
- `config:read` - 读取配置
- `config:write` - 写入配置

**示例：**
```javascript
async setup(ctx) {
  // 读取配置
  const timeout = ctx.config.get('timeout', 5000)
  const enabled = ctx.config.get('enabled', true)
  
  // 读取嵌套配置
  const settings = ctx.config.get('advanced.settings', {})
  
  // 写入配置（需要 config:write 权限）
  ctx.config.set('lastStartTime', Date.now())
}
```

### 7.4 Store 接口

插件私有的 KV 存储，数据不会与其他插件共享。

```typescript
type StoreAPI = {
  get<T = unknown>(key: string): T | undefined
  set<T = unknown>(key: string, value: T): void
  delete(key: string): void
}
```

**权限要求：**
- `storage:read` - 读取存储
- `storage:write` - 写入存储

**示例：**
```javascript
async setup(ctx) {
  const store = ctx.store
  
  // 读取数据
  const count = store.get('requestCount') || 0
  const cache = store.get('cache') || {}
  
  // 写入数据
  store.set('requestCount', count + 1)
  store.set('lastUpdate', Date.now())
  
  // 删除数据
  store.delete('tempData')
}

async onAfterResponse(ctx) {
  // 保存请求日志
  this.storage.set(`log:${ctx.requestId}`, {
    url: ctx.request.url,
    statusCode: ctx.response.statusCode,
    timestamp: Date.now()
  })
}
```

### 7.5 EventBus 接口

插件间通信的事件总线。

```typescript
type EventBusAPI = {
  emit(topic: string, payload: unknown): void
  on(topic: string, handler: (payload: unknown) => void): () => void
}
```

**示例：**
```javascript
async setup(ctx) {
  // 订阅事件
  const unsubscribe = ctx.eventBus.on('config:changed', (newConfig) => {
    this.logger.info('Config updated', newConfig)
    this.config = newConfig
  })
  
  // 保存取消订阅函数，在 dispose 时调用
  this.unsubscribeConfig = unsubscribe
}

async onAfterResponse(ctx) {
  // 发送事件
  ctx.eventBus.emit('request:completed', {
    requestId: ctx.requestId,
    url: ctx.request.url,
    duration: Date.now() - ctx.meta.startTime
  })
}

async dispose() {
  // 取消订阅
  if (this.unsubscribeConfig) {
    this.unsubscribeConfig()
  }
}
```

### 7.6 HTTP 接口

受控的 HTTP 客户端，用于外部请求。

```typescript
type HttpAPI = {
  fetch(input: string, init?: RequestInit): Promise<Response>
}
```

**权限要求：**
- `network:outbound` - 外部网络访问

**示例：**
```javascript
async onBeforeProxy(ctx) {
  // 需要 network:outbound 权限
  if (ctx.http) {
    try {
      const response = await ctx.http.fetch('https://api.example.com/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ctx.request.url })
      })
      
      const result = await response.json()
      
      if (!result.allowed) {
        ctx.respond({
          statusCode: 403,
          headers: { 'Content-Type': 'text/plain' },
          body: 'Request blocked by security policy'
        })
      }
    } catch (error) {
      this.logger.error('Security check failed', { error: error.message })
    }
  }
}
```

---

## 8. 错误处理与超时

### 8.1 超时机制

**默认超时：** 10ms（可按 Hook 类型配置）

**超时行为：**
1. 记录慢插件告警
2. 跳过该次插件结果并继续链路
3. 连续超时达到阈值触发自动降级（禁用插件 N 分钟）

**示例：**
```javascript
// HookDispatcher 初始化时配置超时
const dispatcher = new HookDispatcher(pluginManager, {
  logger: console,
  defaultTimeoutMs: 10  // 默认 10ms
})

// 调度时可以覆盖超时设置
await dispatcher.dispatch('onBeforeProxy', ctx, {
  timeoutMs: 50  // 允许该 Hook 50ms
})
```

### 8.2 错误处理

**错误捕获：**
- 插件异常统一捕获，不允许冒泡到内核未处理层
- 出错后继续执行同阶段后续插件（除非该错误影响链路完整性）
- 标记 `request.meta.pluginErrors` 供日志/排障查看

**错误状态：**
```javascript
// Hook 执行结果
{
  pluginId: 'builtin.logger',
  status: 'ok' | 'error' | 'timeout' | 'skipped-disabled',
  duration: 5,  // ms
  error?: 'Error message'
}
```

**生命周期错误处理：**
```javascript
// 生命周期方法出错会禁用插件
async setup(ctx) {
  try {
    // 初始化代码
    await this.initialize()
  } catch (error) {
    // 错误会被捕获，插件状态变为 disabled
    throw error
  }
}
```

### 8.3 短路响应规则

**限制：**
- 仅 `onBeforeProxy` 允许 `ctx.respond()`
- 一旦短路：
  - 停止上游请求
  - 仍可继续 `onAfterResponse` 以便日志记录

**示例：**
```javascript
async onBeforeProxy(ctx) {
  if (this.shouldMock(ctx.request)) {
    // 短路响应
    ctx.respond({
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Mocked': 'true'
      },
      body: JSON.stringify({ message: 'mocked response' })
    })
    // 返回后不再转发到上游
  }
}
```

---

## 9. 权限模型

### 9.1 权限枚举

```typescript
type Permission =
  | 'proxy:read'           // 读取请求/响应信息
  | 'proxy:write'          // 修改请求/响应
  | 'response:shortcircuit' // 短路响应
  | 'config:read'          // 读取配置
  | 'config:write'         // 写入配置
  | 'storage:read'         // 读取存储
  | 'storage:write'        // 写入存储
  | 'network:outbound'     // 外部网络访问
```

### 9.2 权限说明

| 权限 | 说明 | 用途示例 |
|------|------|----------|
| `proxy:read` | 读取请求/响应信息 | 日志记录、统计分析 |
| `proxy:write` | 修改请求/响应 | 请求改写、响应处理 |
| `response:shortcircuit` | 短路响应 | Mock、拦截 |
| `config:read` | 读取配置 | 获取插件设置 |
| `config:write` | 写入配置 | 保存状态、更新配置 |
| `storage:read` | 读取存储 | 读取缓存、历史数据 |
| `storage:write` | 写入存储 | 保存日志、缓存数据 |
| `network:outbound` | 外部网络访问 | API 调用、数据上报 |

### 9.3 执行原则

- **默认拒绝**：未声明权限不可使用对应能力
- **最小授权**：builtin 插件按需赋权，local 插件默认低权限模板
- **审计记录**：权限校验失败写入审计日志

### 9.4 权限示例

**最小权限（只读日志）：**
```javascript
permissions: ['proxy:read', 'storage:write']
```

**路由插件权限：**
```javascript
permissions: [
  'proxy:read',
  'proxy:write',
  'config:read'
]
```

**Mock 插件权限：**
```javascript
permissions: [
  'proxy:read',
  'response:shortcircuit',
  'storage:read'
]
```

**完整权限（慎用）：**
```javascript
permissions: [
  'proxy:read',
  'proxy:write',
  'response:shortcircuit',
  'config:read',
  'config:write',
  'storage:read',
  'storage:write',
  'network:outbound'
]
```

---

## 10. 完整示例

### 10.1 简单日志插件

```javascript
const simpleLoggerPlugin = {
  manifest: {
    id: 'example.simple-logger',
    name: 'Simple Logger',
    version: '1.0.0',
    apiVersion: '1.x',
    type: 'local',
    permissions: ['proxy:read', 'storage:write'],
    hooks: ['onRequestStart', 'onAfterResponse'],
    priority: 100
  },
  
  async setup(ctx) {
    this.logger = ctx.log
    this.storage = ctx.store
    this.requestCount = 0
  },
  
  async onRequestStart(ctx) {
    this.requestCount++
    ctx.meta.startTime = Date.now()
    
    this.logger.info('Request started', {
      requestId: ctx.requestId,
      method: ctx.request.method,
      url: ctx.request.url,
      count: this.requestCount
    })
  },
  
  async onAfterResponse(ctx) {
    const duration = Date.now() - ctx.meta.startTime
    
    const logEntry = {
      requestId: ctx.requestId,
      method: ctx.request.method,
      url: ctx.request.url,
      statusCode: ctx.response.statusCode,
      duration,
      timestamp: Date.now()
    }
    
    this.storage.set(`log:${ctx.requestId}`, logEntry)
    
    this.logger.info('Request completed', logEntry)
  }
}
```

### 10.2 Mock 插件

```javascript
const mockPlugin = {
  manifest: {
    id: 'example.mock',
    name: 'Mock Server',
    version: '1.0.0',
    apiVersion: '1.x',
    type: 'local',
    permissions: [
      'proxy:read',
      'response:shortcircuit',
      'config:read',
      'storage:read'
    ],
    hooks: ['onBeforeProxy'],
    priority: 10  // 高优先级，优先执行
  },
  
  async setup(ctx) {
    this.logger = ctx.log
    this.storage = ctx.store
    
    // 加载 Mock 规则
    this.mockRules = ctx.config.get('mockRules', [])
    this.logger.info('Mock plugin initialized', {
      rulesCount: this.mockRules.length
    })
  },
  
  async onBeforeProxy(ctx) {
    // 查找匹配的 Mock 规则
    const rule = this.findMatchingRule(ctx.request)
    
    if (rule) {
      this.logger.info('Mock rule matched', {
        requestId: ctx.requestId,
        url: ctx.request.url,
        ruleId: rule.id
      })
      
      // 短路响应
      ctx.respond({
        statusCode: rule.statusCode || 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Mocked': 'true',
          'X-Mock-Rule': rule.id
        },
        body: JSON.stringify(rule.data)
      })
    }
  },
  
  findMatchingRule(request) {
    return this.mockRules.find(rule => {
      // 匹配 URL
      const urlMatch = new RegExp(rule.pattern).test(request.url)
      
      // 匹配方法
      const methodMatch = !rule.method || rule.method === request.method
      
      return urlMatch && methodMatch
    })
  }
}

// Mock 规则配置示例
const mockConfig = {
  mockRules: [
    {
      id: 'mock-users',
      pattern: '/api/users',
      method: 'GET',
      statusCode: 200,
      data: {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' }
        ]
      }
    },
    {
      id: 'mock-error',
      pattern: '/api/error',
      statusCode: 500,
      data: { error: 'Internal Server Error' }
    }
  ]
}
```

### 10.3 性能监控插件

```javascript
const performanceMonitorPlugin = {
  manifest: {
    id: 'example.performance-monitor',
    name: 'Performance Monitor',
    version: '1.0.0',
    apiVersion: '1.x',
    type: 'local',
    permissions: [
      'proxy:read',
      'storage:write',
      'config:read'
    ],
    hooks: ['onRequestStart', 'onAfterResponse', 'onError'],
    priority: 50
  },
  
  async setup(ctx) {
    this.logger = ctx.log
    this.storage = ctx.store
    this.eventBus = ctx.eventBus
    
    // 配置
    this.config = {
      slowThreshold: ctx.config.get('slowThreshold', 1000),
      errorThreshold: ctx.config.get('errorThreshold', 10)
    }
    
    // 统计数据
    this.stats = {
      total: 0,
      success: 0,
      error: 0,
      totalDuration: 0,
      slowRequests: 0
    }
    
    this.logger.info('Performance monitor initialized', this.config)
  },
  
  async start() {
    // 定时上报统计数据
    this.reportTimer = setInterval(() => {
      this.reportStats()
    }, 60000)  // 每分钟
  },
  
  async stop() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer)
    }
  },
  
  async onRequestStart(ctx) {
    ctx.meta.perfStart = Date.now()
  },
  
  async onAfterResponse(ctx) {
    const duration = Date.now() - ctx.meta.perfStart
    
    // 更新统计
    this.stats.total++
    this.stats.success++
    this.stats.totalDuration += duration
    
    // 慢请求检测
    if (duration > this.config.slowThreshold) {
      this.stats.slowRequests++
      
      this.logger.warn('Slow request detected', {
        requestId: ctx.requestId,
        url: ctx.request.url,
        duration,
        threshold: this.config.slowThreshold
      })
      
      // 保存慢请求记录
      this.storage.set(`slow:${ctx.requestId}`, {
        url: ctx.request.url,
        duration,
        timestamp: Date.now()
      })
      
      // 发送告警事件
      this.eventBus.emit('performance:slow-request', {
        requestId: ctx.requestId,
        url: ctx.request.url,
        duration
      })
    }
  },
  
  async onError(ctx) {
    this.stats.total++
    this.stats.error++
    
    // 错误率检测
    const errorRate = this.stats.error / this.stats.total
    if (errorRate > this.config.errorThreshold / 100) {
      this.logger.error('High error rate detected', {
        errorRate: `${(errorRate * 100).toFixed(2)}%`,
        threshold: `${this.config.errorThreshold}%`
      })
    }
  },
  
  reportStats() {
    const avgDuration = this.stats.total > 0 
      ? this.stats.totalDuration / this.stats.total 
      : 0
    
    const report = {
      total: this.stats.total,
      success: this.stats.success,
      error: this.stats.error,
      errorRate: `${((this.stats.error / this.stats.total) * 100).toFixed(2)}%`,
      avgDuration: `${avgDuration.toFixed(2)}ms`,
      slowRequests: this.stats.slowRequests,
      timestamp: Date.now()
    }
    
    this.logger.info('Performance report', report)
    this.storage.set('lastReport', report)
    this.eventBus.emit('performance:report', report)
  }
}
```

### 10.4 路由规则插件

```javascript
const routerPlugin = {
  manifest: {
    id: 'example.router',
    name: 'Request Router',
    version: '1.0.0',
    apiVersion: '1.x',
    type: 'local',
    permissions: [
      'proxy:read',
      'proxy:write',
      'config:read'
    ],
    hooks: ['onBeforeProxy'],
    priority: 20
  },
  
  async setup(ctx) {
    this.logger = ctx.log
    
    // 加载路由规则
    this.rules = ctx.config.get('routingRules', [])
    
    this.logger.info('Router initialized', {
      rulesCount: this.rules.length
    })
  },
  
  async onBeforeProxy(ctx) {
    const matchedRule = this.matchRule(ctx.request.url)
    
    if (matchedRule) {
      // 计算目标地址
      const target = this.resolveTarget(ctx.request.url, matchedRule)
      
      this.logger.info('Route matched', {
        requestId: ctx.requestId,
        original: ctx.request.url,
        target,
        rule: matchedRule.name
      })
      
      // 设置目标
      ctx.setTarget(target)
      
      // 可选：添加自定义头
      if (matchedRule.headers) {
        Object.assign(ctx.request.headers, matchedRule.headers)
      }
      
      // 记录路由信息到元数据
      ctx.meta.routeRule = matchedRule.name
      ctx.meta.routeTarget = target
    }
  },
  
  matchRule(url) {
    for (const rule of this.rules) {
      if (rule.pattern instanceof RegExp) {
        if (rule.pattern.test(url)) return rule
      } else {
        if (url.includes(rule.pattern)) return rule
      }
    }
    return null
  },
  
  resolveTarget(url, rule) {
    if (rule.target.includes('$')) {
      // 支持变量替换
      return rule.target.replace(/\$(\d+)/g, (match, group) => {
        const matches = url.match(rule.pattern)
        return matches ? matches[parseInt(group)] : match
      })
    }
    return rule.target
  }
}

// 路由规则配置示例
const routerConfig = {
  routingRules: [
    {
      name: 'api-v1-to-v2',
      pattern: /\/api\/v1\/(.*)/,
      target: 'http://new-api.example.com/api/v2/$1'
    },
    {
      name: 'local-dev',
      pattern: 'localhost:3000',
      target: 'http://127.0.0.1:8080',
      headers: {
        'X-Dev-Mode': 'true'
      }
    }
  ]
}
```

---

## 11. 最佳实践

### 11.1 性能优化

**1. 避免阻塞操作**

```javascript
// ❌ 不好：同步阻塞
async onAfterResponse(ctx) {
  // 大量同步计算
  for (let i = 0; i < 1000000; i++) {
    // ...
  }
}

// ✅ 好：异步处理
async onAfterResponse(ctx) {
  // 将耗时任务放入异步队列
  setImmediate(() => {
    this.processLargeData(ctx)
  })
}
```

**2. 控制 Hook 执行时间**

```javascript
// 关键路径 Hook 要快速返回
async onBeforeProxy(ctx) {
  // 快速判断，避免复杂计算
  if (this.cache.has(ctx.request.url)) {
    ctx.setTarget(this.cache.get(ctx.request.url))
    return
  }
  
  // 简单规则匹配
  const rule = this.quickMatch(ctx.request.url)
  if (rule) {
    ctx.setTarget(rule.target)
  }
}

// 异步 Hook 可以做更多工作
async onAfterResponse(ctx) {
  // 可以执行较耗时的操作
  await this.saveToDatabase(ctx)
  await this.analyzeResponse(ctx)
}
```

**3. 使用缓存**

```javascript
async setup(ctx) {
  this.cache = new Map()
  this.cacheExpiry = 60000  // 60秒
}

async onBeforeProxy(ctx) {
  const cacheKey = ctx.request.url
  const cached = this.cache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
    ctx.setTarget(cached.target)
    return
  }
  
  // 计算目标
  const target = this.computeTarget(ctx.request.url)
  
  // 缓存结果
  this.cache.set(cacheKey, {
    target,
    timestamp: Date.now()
  })
  
  ctx.setTarget(target)
}
```

### 11.2 错误处理

**1. 优雅降级**

```javascript
async onBeforeProxy(ctx) {
  try {
    // 尝试高级功能
    const target = await this.advancedRouting(ctx.request)
    ctx.setTarget(target)
  } catch (error) {
    this.logger.warn('Advanced routing failed, falling back', {
      error: error.message
    })
    
    // 降级到简单路由
    const fallbackTarget = this.simpleRouting(ctx.request)
    ctx.setTarget(fallbackTarget)
  }
}
```

**2. 不要抛出未捕获异常**

```javascript
// ❌ 不好：可能抛出未捕获异常
async onAfterResponse(ctx) {
  const data = JSON.parse(ctx.response.body)  // 可能抛出异常
  await this.saveData(data)  // 可能抛出异常
}

// ✅ 好：捕获所有异常
async onAfterResponse(ctx) {
  try {
    const data = JSON.parse(ctx.response.body)
    await this.saveData(data)
  } catch (error) {
    this.logger.error('Failed to process response', {
      error: error.message,
      requestId: ctx.requestId
    })
    // 不重新抛出异常
  }
}
```

### 11.3 资源管理

**1. 正确清理资源**

```javascript
async setup(ctx) {
  this.db = await connectDatabase()
  this.timer = setInterval(() => this.cleanup(), 60000)
}

async dispose() {
  // 停止定时器
  if (this.timer) {
    clearInterval(this.timer)
    this.timer = null
  }
  
  // 关闭连接
  if (this.db) {
    await this.db.close()
    this.db = null
  }
  
  // 清空缓存
  if (this.cache) {
    this.cache.clear()
    this.cache = null
  }
}
```

**2. 避免内存泄漏**

```javascript
// ❌ 不好：无限增长的存储
async onAfterResponse(ctx) {
  this.logs.push({  // logs 会无限增长
    url: ctx.request.url,
    timestamp: Date.now()
  })
}

// ✅ 好：限制大小
async onAfterResponse(ctx) {
  this.logs.push({
    url: ctx.request.url,
    timestamp: Date.now()
  })
  
  // 保持最近 1000 条
  if (this.logs.length > 1000) {
    this.logs = this.logs.slice(-1000)
  }
}

// ✅ 更好：使用 LRU 缓存
async setup(ctx) {
  this.logs = new LRUCache({ max: 1000 })
}
```

### 11.4 配置与约定

**1. 提供默认配置**

```javascript
async setup(ctx) {
  // 总是提供默认值
  this.config = {
    enabled: ctx.config.get('enabled', true),
    timeout: ctx.config.get('timeout', 5000),
    maxRetries: ctx.config.get('maxRetries', 3),
    ...ctx.config.get('advanced', {})
  }
}
```

**2. 验证配置**

```javascript
async setup(ctx) {
  const timeout = ctx.config.get('timeout', 5000)
  
  // 验证配置
  if (typeof timeout !== 'number' || timeout < 0) {
    throw new Error('Invalid timeout configuration')
  }
  
  if (timeout > 30000) {
    this.logger.warn('Timeout is very high', { timeout })
  }
  
  this.timeout = timeout
}
```

### 11.5 日志与调试

**1. 结构化日志**

```javascript
// ✅ 好：结构化日志
this.logger.info('Request processed', {
  requestId: ctx.requestId,
  url: ctx.request.url,
  duration: 123,
  statusCode: 200
})

// ❌ 不好：字符串拼接
this.logger.info(`Request ${ctx.requestId} processed in 123ms`)
```

**2. 适当的日志级别**

```javascript
// debug: 详细的调试信息
this.logger.debug('Cache hit', { key, value })

// info: 一般信息
this.logger.info('Plugin started')

// warn: 警告信息
this.logger.warn('High latency detected', { duration })

// error: 错误信息
this.logger.error('Failed to process', { error: err.message })
```

### 11.6 测试建议

**1. 单元测试插件**

```javascript
const assert = require('assert')

describe('MockPlugin', () => {
  it('should mock matching requests', async () => {
    const plugin = createMockPlugin()
    await plugin.setup(createMockContext())
    
    const ctx = {
      request: { url: '/api/users', method: 'GET' },
      respond: (resp) => {
        assert.strictEqual(resp.statusCode, 200)
        assert.strictEqual(resp.headers['X-Mocked'], 'true')
      }
    }
    
    await plugin.onBeforeProxy(ctx)
  })
})
```

**2. 测试生命周期**

```javascript
it('should cleanup resources on dispose', async () => {
  const plugin = createPlugin()
  await plugin.setup(createMockContext())
  await plugin.start()
  
  assert.ok(plugin.timer)
  
  await plugin.dispose()
  
  assert.strictEqual(plugin.timer, null)
})
```

---

## 总结

本文档详细介绍了 Easy Proxy 插件系统的各个方面：

1. **插件 Manifest**：定义插件的元数据和能力声明
2. **生命周期**：setup、start、stop、dispose 四个阶段
3. **Hook 协议**：五个请求生命周期 Hook 的时机和用途
4. **上下文对象**：请求、响应、错误上下文的结构
5. **能力 API**：日志、配置、存储、事件、HTTP 等能力接口
6. **错误与超时**：统一的错误处理和超时机制
7. **权限模型**：细粒度的权限控制
8. **完整示例**：多个实用插件的完整实现
9. **最佳实践**：性能、错误处理、资源管理等建议

通过本文档，开发者可以完全理解插件系统的设计理念和使用方法，能够开发出高质量、高性能的 Easy Proxy 插件。
