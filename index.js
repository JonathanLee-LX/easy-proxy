const http = require('http')
const https = require('https')
const http2 = require('http2')
const { connect } = require('net')
const fs = require('fs')
const os = require('os')
const path = require('path')

// 创建 .ep 目录和 ca 证书目录
const epDir = path.resolve(os.homedir(), '.ep')
const certDir = path.resolve(epDir, 'ca')
if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true })
}

// 系统设置文件路径（统一放在 .ep 目录下）
const settingsPath = path.resolve(epDir, 'settings.json')

const { crtMgr, ensureRootCA } = require('./dist/cert')
const { WebSocket, WebSocketServer } = require('ws')
const { copyHeaders, resolveTargetUrl, getFreePort, loadConfigFromFile, resolveConfigPath, ruleMapToEprcText, DEFAULT_CONFIG_PATH } = require('./dist/helpers')
const { PluginManager, HookDispatcher } = require('./dist/core/plugin-runtime')
const { bootstrapPlugins } = require('./dist/core/plugin-bootstrap')
const { createPipeline, normalizeMode } = require('./dist/core/pipeline')
const { createShadowCompareTracker } = require('./dist/core/shadow-compare')
const { evaluateShadowReadiness, buildReadinessAdvice } = require('./dist/core/shadow-readiness')
const { decideRoute } = require('./dist/core/route-decision')
const { sendShortResponse } = require('./dist/core/short-response')
const { safeBodyToString } = require('./dist/core/body-utils')
const { buildRefactorStatus } = require('./dist/core/refactor-status')
const { buildPluginHealth } = require('./dist/core/plugin-health')
const { parseHostAllowlist, createOnModeGate } = require('./dist/core/on-mode-gate')
const { createPipelineGate } = require('./dist/core/pipeline-gate')
const { buildRefactorConfig } = require('./dist/core/refactor-config')
const { createBuiltinPlugins } = require('./dist/plugins/builtin')
const { createBuiltinRouterPlugin } = require('./dist/plugins/builtin/router-plugin')
const { createBuiltinLoggerPlugin } = require('./dist/plugins/builtin/logger-plugin')
const { createBuiltinMockPlugin } = require('./dist/plugins/builtin/mock-plugin')
const chokidar = require('chokidar')
const chalk = require('chalk')
const { execSync } = require('child_process')
const _debug = require('debug')

const proxyDebug = _debug('proxy')
const log = _debug('log')

// 是否启用启动后自动打开浏览器并设置代理（--open 或 EP_OPEN=1）
const AUTO_OPEN = process.argv.includes('--open') || process.env.EP_OPEN === '1'
const REFACTOR_CONFIG = buildRefactorConfig(process.env, {
    normalizeMode,
    parseHostAllowlist,
})
const PLUGIN_MODE = REFACTOR_CONFIG.pluginMode
const SHADOW_WARN_MIN_SAMPLES = REFACTOR_CONFIG.shadowWarnMinSamples
const SHADOW_WARN_DIFF_RATE = REFACTOR_CONFIG.shadowWarnDiffRate
const PLUGIN_ON_HOSTS = REFACTOR_CONFIG.pluginOnHosts
const ENABLE_BUILTIN_ROUTER_PLUGIN = REFACTOR_CONFIG.enableBuiltinRouter
const ENABLE_BUILTIN_LOGGER_PLUGIN = REFACTOR_CONFIG.enableBuiltinLogger
const ENABLE_BUILTIN_MOCK_PLUGIN = REFACTOR_CONFIG.enableBuiltinMock

// Phase 1 骨架：先挂载运行时与 pipeline，默认 off 不改变现有行为
const pluginManager = new PluginManager({ logger: console })
const hookDispatcher = new HookDispatcher(pluginManager, { logger: console })
const requestPipeline = createPipeline({
    mode: PLUGIN_MODE,
    pluginManager,
    dispatcher: hookDispatcher,
    logger: console,
})

let ruleMap = {}
let currentConfig = null // { path, format } 当前生效的配置
let currentMocksPath = null // 当前 Mock 配置文件路径

const MAX_RECORD_SIZE = process.env.MAX_RECORD_SIZE ? parseInt(process.env.MAX_RECORD_SIZE) : 10000
const MAX_DETAIL_SIZE = 200
const MAX_BODY_SIZE = 5 * 1024 * 1024 // 5MB
const proxyRecordArr = []
let recordIdSeq = 0
const proxyRecordDetailMap = new Map()
const builtinLoggerPlugin = createBuiltinLoggerPlugin({ maxEntries: MAX_RECORD_SIZE })
const shadowCompareTracker = createShadowCompareTracker({ maxSamples: 30 })
const onModeGate = createOnModeGate({
    mode: PLUGIN_MODE,
    allowlist: PLUGIN_ON_HOSTS,
})
const pipelineGate = createPipelineGate({
    requestPipeline,
    onModeGate,
    enableBuiltinMockPlugin: ENABLE_BUILTIN_MOCK_PLUGIN,
})

/**
 * 从 settings.json 加载自定义配置文件路径
 */
function loadCustomPathsFromSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
            return {
                rulesFilePath: settings.rulesFilePath || null,
                mocksFilePath: settings.mocksFilePath || null
            }
        }
    } catch (error) {
        console.error('加载自定义配置路径失败:', error)
    }
    return { rulesFilePath: null, mocksFilePath: null }
}

/**
 * 执行配置文件诊断
 */
function performConfigDiagnostics() {
    const diagnostics = {
        status: 'ok',
        checks: [],
        errors: [],
        warnings: []
    }
    
    // 检查配置目录
    if (fs.existsSync(epDir)) {
        diagnostics.checks.push({
            name: '配置目录',
            status: 'ok',
            path: epDir
        })
    } else {
        diagnostics.errors.push('配置目录不存在: ' + epDir)
        diagnostics.status = 'error'
    }
    
    // 检查系统设置
    if (fs.existsSync(settingsPath)) {
        try {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
            diagnostics.checks.push({
                name: '系统设置',
                status: 'ok',
                path: settingsPath,
                details: {
                    theme: settings.theme,
                    fontSize: settings.fontSize,
                    aiEnabled: settings.aiConfig?.enabled || false,
                    customRulesPath: settings.rulesFilePath || null,
                    customMocksPath: settings.mocksFilePath || null
                }
            })
        } catch (error) {
            diagnostics.errors.push('系统设置文件格式错误: ' + error.message)
            diagnostics.status = 'error'
        }
    } else {
        diagnostics.warnings.push('系统设置文件不存在，将使用默认设置')
    }
    
    // 检查路由规则文件
    const customPaths = loadCustomPathsFromSettings()
    const rulesPath = customPaths.rulesFilePath || (currentConfig?.path || defaultRulesPath)
    
    if (fs.existsSync(rulesPath)) {
        try {
            const content = fs.readFileSync(rulesPath, 'utf8')
            const lines = content.split('\n').filter(line => {
                const trimmed = line.trim()
                return trimmed && !trimmed.startsWith('#')
            })
            diagnostics.checks.push({
                name: '路由规则文件',
                status: 'ok',
                path: rulesPath,
                details: {
                    rules: lines.length,
                    size: content.length
                }
            })
        } catch (error) {
            diagnostics.errors.push('路由规则文件读取失败: ' + error.message)
            diagnostics.status = 'error'
        }
    } else {
        diagnostics.warnings.push('路由规则文件不存在: ' + rulesPath)
    }
    
    // 检查 Mock 规则文件
    const mocksPath = customPaths.mocksFilePath || getMockFilePath()
    
    if (fs.existsSync(mocksPath)) {
        try {
            const content = fs.readFileSync(mocksPath, 'utf8')
            const data = JSON.parse(content)
            const enabledRules = (data.rules || []).filter(r => r.enabled).length
            diagnostics.checks.push({
                name: 'Mock 规则文件',
                status: 'ok',
                path: mocksPath,
                details: {
                    total: (data.rules || []).length,
                    enabled: enabledRules,
                    size: content.length
                }
            })
        } catch (error) {
            diagnostics.errors.push('Mock 规则文件格式错误: ' + error.message)
            diagnostics.status = 'error'
        }
    } else {
        diagnostics.warnings.push('Mock 规则文件不存在: ' + mocksPath)
    }
    
    // 检查证书文件
    const certChecks = []
    if (fs.existsSync(certDir)) {
        certChecks.push('证书目录存在')
        
        if (fs.existsSync(path.join(certDir, 'rootCA.crt'))) {
            certChecks.push('根证书存在')
        } else {
            diagnostics.warnings.push('根证书不存在，HTTPS 代理可能无法使用')
        }
        
        if (fs.existsSync(path.join(certDir, 'rootCA.key'))) {
            certChecks.push('根证书私钥存在')
        }
        
        diagnostics.checks.push({
            name: 'SSL 证书',
            status: certChecks.length >= 2 ? 'ok' : 'warning',
            path: certDir,
            details: {
                checks: certChecks
            }
        })
    } else {
        diagnostics.warnings.push('证书目录不存在')
    }
    
    // 设置最终状态
    if (diagnostics.errors.length > 0) {
        diagnostics.status = 'error'
    } else if (diagnostics.warnings.length > 0) {
        diagnostics.status = 'warning'
    }
    
    return diagnostics
}

// ===== HTTP/2 代理支持 =====
const h2SessionPool = new Map() // origin -> http2.ClientHttp2Session

// HTTP/2 中需要移除的逐跳头部
const HOP_BY_HOP_HEADERS = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade', 'host'
])

/**
 * 清理请求头，移除 HTTP/2 不兼容的逐跳头部
 */
function cleanHeadersForH2(headers) {
    const cleaned = {}
    for (const [key, value] of Object.entries(headers)) {
        const lk = key.toLowerCase()
        if (!HOP_BY_HOP_HEADERS.has(lk) && !lk.startsWith(':')) {
            cleaned[lk] = value
        }
    }
    return cleaned
}

/**
 * 获取或创建指定 origin 的 HTTP/2 会话（带连接池复用）
 * @param {string} origin - 如 https://example.com 或 https://120.92.124.158
 * @param {string} [servername] - TLS SNI 主机名（域名转 IP 时保留原始域名用于路由）
 * @returns {Promise<http2.ClientHttp2Session>}
 */
function getOrCreateH2Session(origin, servername) {
    // 使用 origin + servername 作为缓存 key，避免不同域名共享同一 IP 会话时 SNI 冲突
    const poolKey = servername ? `${origin}#${servername}` : origin
    const cached = h2SessionPool.get(poolKey)
    if (cached && !cached.closed && !cached.destroyed) {
        return Promise.resolve(cached)
    }
    h2SessionPool.delete(poolKey)

    return new Promise((resolve, reject) => {
        const connectOpts = { rejectUnauthorized: false }
        if (servername) connectOpts.servername = servername
        const session = http2.connect(origin, connectOpts)

        const timeout = setTimeout(() => {
            session.destroy()
            reject(new Error('HTTP/2 connection timeout'))
        }, 5000)

        session.once('connect', () => {
            clearTimeout(timeout)
            h2SessionPool.set(poolKey, session)
            resolve(session)
        })

        session.once('error', (err) => {
            clearTimeout(timeout)
            h2SessionPool.delete(poolKey)
            reject(err)
        })

        session.on('close', () => {
            h2SessionPool.delete(poolKey)
        })

        session.on('goaway', () => {
            h2SessionPool.delete(poolKey)
            if (!session.destroyed) session.destroy()
        })

        // 空闲 60s 自动关闭
        session.setTimeout(60000, () => {
            h2SessionPool.delete(poolKey)
            if (!session.destroyed) session.close()
        })
    })
}

/**
 * 通过 HTTP/2 发起代理请求（流式）
 * @returns {Promise<{statusCode, statusMessage, headers, stream, protocol}>}
 */
function proxyViaH2(target, method, headers, reqBody) {
    const url = new URL(target)
    const origin = url.origin
    // 保留原始 Host 作为 :authority（规则将域名映射到 IP 时，目标服务器仍需原始域名来路由）
    // HTTP/2 入站请求 headers 中 host 可能不存在，需同时检查 :authority 伪头
    const originalHost = headers.host || headers.Host || headers[':authority'] || url.host
    const originalHostname = originalHost.split(':')[0]
    // 如果目标主机名与原始域名不同（如 IP 地址），传入 servername 以设置正确的 TLS SNI
    const servername = (url.hostname !== originalHostname) ? originalHostname : undefined

    return getOrCreateH2Session(origin, servername).then(session => {
        return new Promise((resolve, reject) => {
            try {
                const h2Headers = cleanHeadersForH2(headers)
                h2Headers[':method'] = method
                h2Headers[':path'] = url.pathname + url.search
                h2Headers[':authority'] = originalHost
                h2Headers[':scheme'] = url.protocol.replace(':', '')

                const h2Stream = session.request(h2Headers)

                h2Stream.on('response', (resHeaders) => {
                    const statusCode = resHeaders[':status']
                    const cleanHeaders = {}
                    for (const [k, v] of Object.entries(resHeaders)) {
                        if (!k.startsWith(':')) cleanHeaders[k] = v
                    }
                    resolve({
                        statusCode,
                        statusMessage: '',
                        headers: cleanHeaders,
                        stream: h2Stream,
                        protocol: 'h2'
                    })
                })

                h2Stream.on('error', reject)

                if (reqBody && reqBody.length > 0) h2Stream.write(reqBody)
                h2Stream.end()
            } catch (err) {
                reject(err)
            }
        })
    })
}

/**
 * 通过 HTTP/1.1 发起代理请求（流式）
 * @returns {Promise<{statusCode, statusMessage, headers, stream, protocol}>}
 */
function proxyViaH1(target, method, headers, reqBody) {
    const url = new URL(target)
    const requestFn = url.protocol === 'https:' ? https.request : http.request

    // 清除 HTTP/2 伪头（:method, :path, :authority, :scheme），这些在 HTTP/1.1 中不合法
    // 同时确保 host 头存在（HTTP/2 入站时只有 :authority 没有 host）
    const h1Headers = {}
    const originalHost = headers[':authority'] || headers.host || headers.Host || url.host
    for (const [key, value] of Object.entries(headers)) {
        if (!key.startsWith(':')) {
            h1Headers[key] = value
        }
    }
    if (!h1Headers.host && !h1Headers.Host) {
        h1Headers.host = originalHost
    }

    return new Promise((resolve, reject) => {
        const proxyReq = requestFn(target, {
            method,
            headers: h1Headers,
            rejectUnauthorized: false
        }, (proxyRes) => {
            resolve({
                statusCode: proxyRes.statusCode,
                statusMessage: proxyRes.statusMessage || '',
                headers: proxyRes.headers,
                stream: proxyRes,
                protocol: 'h1.1'
            })
        })
        proxyReq.on('error', reject)
        if (reqBody && reqBody.length > 0) proxyReq.write(reqBody)
        proxyReq.end()
    })
}

/**
 * 智能代理请求：HTTPS 目标优先尝试 HTTP/2，失败回退 HTTP/1.1；HTTP 目标直接用 HTTP/1.1
 * @returns {Promise<{statusCode, statusMessage, headers, stream, protocol}>}
 */
async function makeProxyRequest(target, method, headers, reqBody) {
    if (target.startsWith('https')) {
        try {
            return await proxyViaH2(target, method, headers, reqBody)
        } catch (err) {
            proxyDebug('HTTP/2 请求失败，回退到 HTTP/1.1:', err.message)
            return proxyViaH1(target, method, headers, reqBody)
        }
    }
    return proxyViaH1(target, method, headers, reqBody)
}

// ===== Mock 功能 =====
const DEFAULT_MOCK_FILE = path.join(epDir, 'mocks.json')
let mockRules = [] // [{ id, urlPattern, method, statusCode, headers, body, enabled, name }]
let mockIdSeq = 1

/**
 * 获取当前 Mock 文件路径（从 settings.json 读取或使用默认）
 */
function getMockFilePath() {
    if (currentMocksPath) {
        return currentMocksPath
    }
    const customPaths = loadCustomPathsFromSettings()
    if (customPaths.mocksFilePath && fs.existsSync(customPaths.mocksFilePath)) {
        currentMocksPath = customPaths.mocksFilePath
        return currentMocksPath
    }
    currentMocksPath = DEFAULT_MOCK_FILE
    return DEFAULT_MOCK_FILE
}

function loadMockRules() {
    try {
        const mockFile = getMockFilePath()
        if (fs.existsSync(mockFile)) {
            const data = JSON.parse(fs.readFileSync(mockFile, 'utf8'))
            mockRules = Array.isArray(data.rules) ? data.rules : []
            mockIdSeq = (data.nextId || Math.max(0, ...mockRules.map(r => r.id || 0))) + 1
            proxyDebug(`已加载 ${mockRules.length} 条 Mock 规则 (${mockFile})`)
        }
    } catch (err) {
        console.error('加载 mock 规则失败:', err.message)
        mockRules = []
    }
}

function saveMockRules() {
    try {
        const mockFile = getMockFilePath()
        fs.writeFileSync(mockFile, JSON.stringify({ nextId: mockIdSeq, rules: mockRules }, null, 2), 'utf8')
        proxyDebug(`Mock 规则已保存到 ${mockFile}`)
    } catch (err) {
        console.error('保存 mock 规则失败:', err.message)
    }
}

/**
 * 检查请求是否匹配 mock 规则，返回匹配的规则或 null
 * @param {string} url - 完整请求 URL
 * @param {string} method - HTTP 方法
 * @returns {object|null}
 */
function matchMockRule(url, method) {
    return mockRules.find(rule => {
        if (!rule.enabled) return false
        if (rule.method && rule.method !== '*' && rule.method.toUpperCase() !== method.toUpperCase()) return false
        try {
            return new RegExp(rule.urlPattern).test(url)
        } catch {
            return url.includes(rule.urlPattern)
        }
    }) || null
}

/**
 * 发送 mock 响应
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {object} rule - mock 规则
 * @param {object} logInfo - 日志信息 { method, source, target }
 */
function sendMockResponse(req, res, rule, logInfo) {
    const statusCode = rule.statusCode || 200
    const delay = rule.delay || 0
    const startTime = Date.now()
    const mockRuleName = rule.name || rule.id.toString()
    const isFileBody = rule.bodyType === 'file' && rule.body

    // 排空请求体（避免 keep-alive 连接残留数据）
    req.on('error', () => {})
    req.resume()

    const doSend = () => {
        const duration = Date.now() - startTime
        let responseBody = ''
        // 将 mock 规则的 headers key 转换为大写（HTTP header 不区分大小写）
        const ruleHeaders = {}
        for (const [key, value] of Object.entries(rule.headers || {})) {
            ruleHeaders[key.toLowerCase()] = value
        }
        let responseHeaders = {
            'X-Mock-Rule': encodeURIComponent(mockRuleName),
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': '*',
            'Access-Control-Allow-Headers': '*',
            ...ruleHeaders
        }
        let finalStatusCode = statusCode
        let statusMessage = 'OK (Mock)'

        if (isFileBody) {
            // bodyType === 'file'：读取本地文件作为响应体
            let filePath = rule.body
            // 处理 file:// 前缀
            if (filePath.startsWith('file://')) filePath = filePath.replace(/^file:\/\//, '')
            // Windows 路径修正
            if (/^\/[A-Za-z]:\//.test(filePath)) filePath = filePath.substring(1)
            filePath = decodeURIComponent(filePath)

            if (!fs.existsSync(filePath)) {
                finalStatusCode = 404
                statusMessage = 'Not Found (Mock File)'
                responseHeaders['Content-Type'] = 'text/plain; charset=utf-8'
                responseBody = 'Mock file not found: ' + filePath
            } else {
                const stat = fs.statSync(filePath)
                if (stat.isDirectory()) {
                    finalStatusCode = 403
                    statusMessage = 'Forbidden (Mock File)'
                    responseHeaders['Content-Type'] = 'text/plain; charset=utf-8'
                    responseBody = 'Is a directory: ' + filePath
                } else {
                    try {
                        const fileContent = fs.readFileSync(filePath)
                        const mimeType = getMimeType(filePath)
                        responseHeaders['Content-Type'] = mimeType
                        responseHeaders['Content-Length'] = fileContent.length
                        // 发送二进制内容
                        try {
                            res.writeHead(finalStatusCode, responseHeaders)
                            res.end(fileContent)
                        } catch (err) {
                            console.error('Mock 文件响应发送失败:', err.message)
                            try { if (!res.headersSent) { res.writeHead(finalStatusCode); res.end(fileContent) } } catch (_) {}
                        }
                        // 记录详情（文本文件记录内容，二进制记录大小）
                        responseBody = mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/javascript' || mimeType === 'application/xml'
                            ? fileContent.toString('utf8').substring(0, MAX_BODY_SIZE)
                            : `(binary, ${fileContent.length} bytes)`
                        // 跳到日志记录（不再走下面的通用 res.end）
                        logMockRecord()
                        return
                    } catch (err) {
                        finalStatusCode = 500
                        statusMessage = 'Error (Mock File)'
                        responseHeaders['Content-Type'] = 'text/plain; charset=utf-8'
                        responseBody = 'Error reading file: ' + err.message
                    }
                }
            }
        } else {
            // bodyType === 'inline'（默认）：使用 rule.body 作为响应体
            responseHeaders['Content-Type'] = responseHeaders['content-type'] || 'application/json'
            responseBody = rule.body || ''
        }

        try {
            res.writeHead(finalStatusCode, responseHeaders)
            res.end(responseBody)
        } catch (err) {
            console.error('Mock 响应发送失败:', err.message)
            try { if (!res.headersSent) { res.writeHead(finalStatusCode); res.end(responseBody) } } catch (_) {}
        }

        logMockRecord()

        function logMockRecord() {
            const recordId = recordIdSeq++
            const logData = {
                id: recordId,
                method: logInfo.method,
                source: logInfo.source,
                target: `[MOCK: ${rule.name || rule.urlPattern}]`,
                time: new Date().toLocaleTimeString(),
                mock: true,
                statusCode: finalStatusCode,
                duration
            }
            try {
                localWSServer.clients.forEach(client => client.send(JSON.stringify(logData)))
            } catch (_) {}
            proxyRecordArr.push(logData)
            if (proxyRecordArr.length > MAX_RECORD_SIZE) {
                const removed = proxyRecordArr.shift()
                if (removed.id !== undefined) proxyRecordDetailMap.delete(removed.id)
            }
            const detail = {
                requestHeaders: req.headers || {},
                requestBody: '',
                responseHeaders: responseHeaders,
                responseBody: responseBody,
                statusCode: finalStatusCode,
                statusMessage,
                method: logInfo.method,
                url: logInfo.source,
            }
            proxyRecordDetailMap.set(recordId, detail)
            if (proxyRecordDetailMap.size > MAX_DETAIL_SIZE) {
                const firstKey = proxyRecordDetailMap.keys().next().value
                proxyRecordDetailMap.delete(firstKey)
            }
        }
    }

    if (delay > 0) {
        setTimeout(doSend, delay)
    } else {
        doSend()
    }
}

loadMockRules()

// ===== Map Local 功能 =====
/**
 * 根据文件扩展名获取 MIME 类型
 * @param {string} filePath
 * @returns {string}
 */
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes = {
        '.html': 'text/html',
        '.htm': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip',
        '.tar': 'application/x-tar',
        '.gz': 'application/gzip',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.webp': 'image/webp',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'font/otf',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.wasm': 'application/wasm',
        '.swf': 'application/x-shockwave-flash',
    }
    return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * 处理 Map Local 请求
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} source - 原始请求 URL
 * @param {string} fileUrl - file:// URL
 */
function handleMapLocalRequest(req, res, source, fileUrl) {
    // 解析 file:// URL 获取文件路径
    let filePath = fileUrl.replace(/^file:\/\//, '')
    // 处理 Windows 路径（如 /C:/Users/...）
    if (/^\/[A-Za-z]:\//.test(filePath)) {
        filePath = filePath.substring(1)
    }
    // URL 解码
    filePath = decodeURIComponent(filePath)

    const startTime = Date.now()
    const recordId = recordIdSeq++

    // 排空请求体
    req.on('error', () => {})
    req.resume()

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
        const duration = Date.now() - startTime
        const statusCode = 404
        const errorBody = 'File not found: ' + filePath

        res.writeHead(statusCode, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
        })
        res.end(errorBody)

        // 记录日志
        const logData = {
            id: recordId,
            method: req.method,
            source,
            target: fileUrl,
            time: new Date().toLocaleTimeString(),
            mapLocal: true,
            statusCode,
            duration
        }
        try {
            localWSServer.clients.forEach(client => client.send(JSON.stringify(logData)))
        } catch (_) {}
        proxyRecordArr.push(logData)
        if (proxyRecordArr.length > MAX_RECORD_SIZE) {
            const removed = proxyRecordArr.shift()
            if (removed.id !== undefined) proxyRecordDetailMap.delete(removed.id)
        }
        const detail = {
            requestHeaders: req.headers || {},
            requestBody: '',
            responseHeaders: { 'Content-Type': 'text/plain; charset=utf-8' },
            responseBody: errorBody,
            statusCode,
            statusMessage: 'Not Found',
            method: req.method,
            url: source,
        }
        proxyRecordDetailMap.set(recordId, detail)
        if (proxyRecordDetailMap.size > MAX_DETAIL_SIZE) {
            const firstKey = proxyRecordDetailMap.keys().next().value
            proxyRecordDetailMap.delete(firstKey)
        }
        return
    }

    // 检查是否是目录
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
        const duration = Date.now() - startTime
        const statusCode = 403
        const errorBody = 'Is a directory: ' + filePath

        res.writeHead(statusCode, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
        })
        res.end(errorBody)

        const logData = {
            id: recordId,
            method: req.method,
            source,
            target: fileUrl,
            time: new Date().toLocaleTimeString(),
            mapLocal: true,
            statusCode,
            duration
        }
        try {
            localWSServer.clients.forEach(client => client.send(JSON.stringify(logData)))
        } catch (_) {}
        proxyRecordArr.push(logData)
        if (proxyRecordArr.length > MAX_RECORD_SIZE) {
            const removed = proxyRecordArr.shift()
            if (removed.id !== undefined) proxyRecordDetailMap.delete(removed.id)
        }
        return
    }

    // 读取文件
    try {
        const fileContent = fs.readFileSync(filePath)
        const mimeType = getMimeType(filePath)
        const duration = Date.now() - startTime
        const statusCode = 200

        // 设置响应头
        const headers = {
            'Content-Type': mimeType,
            'Content-Length': fileContent.length,
            'Access-Control-Allow-Origin': '*'
        }

        // 对于某些 MIME 类型，设置额外的缓存头
        if (mimeType.startsWith('image/') || mimeType.startsWith('font/')) {
            headers['Cache-Control'] = 'public, max-age=31536000'
        }

        res.writeHead(statusCode, headers)
        res.end(fileContent)

        // 记录日志
        const logData = {
            id: recordId,
            method: req.method,
            source,
            target: fileUrl,
            time: new Date().toLocaleTimeString(),
            mapLocal: true,
            statusCode,
            duration
        }
        try {
            localWSServer.clients.forEach(client => client.send(JSON.stringify(logData)))
        } catch (_) {}
        proxyRecordArr.push(logData)
        if (proxyRecordArr.length > MAX_RECORD_SIZE) {
            const removed = proxyRecordArr.shift()
            if (removed.id !== undefined) proxyRecordDetailMap.delete(removed.id)
        }

        // 保存详情
        const detail = {
            requestHeaders: req.headers || {},
            requestBody: '',
            responseHeaders: headers,
            responseBody: mimeType.startsWith('text/') || mimeType === 'application/json'
                ? fileContent.toString('utf8')
                : `(binary, ${fileContent.length} bytes)`,
            statusCode,
            statusMessage: 'OK',
            method: req.method,
            url: source,
        }
        proxyRecordDetailMap.set(recordId, detail)
        if (proxyRecordDetailMap.size > MAX_DETAIL_SIZE) {
            const firstKey = proxyRecordDetailMap.keys().next().value
            proxyRecordDetailMap.delete(firstKey)
        }
    } catch (err) {
        const duration = Date.now() - startTime
        const statusCode = 500
        const errorBody = 'Error reading file: ' + err.message

        res.writeHead(statusCode, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
        })
        res.end(errorBody)

        const logData = {
            id: recordId,
            method: req.method,
            source,
            target: fileUrl,
            time: new Date().toLocaleTimeString(),
            mapLocal: true,
            statusCode,
            duration
        }
        try {
            localWSServer.clients.forEach(client => client.send(JSON.stringify(logData)))
        } catch (_) {}
        proxyRecordArr.push(logData)
        if (proxyRecordArr.length > MAX_RECORD_SIZE) {
            const removed = proxyRecordArr.shift()
            if (removed.id !== undefined) proxyRecordDetailMap.delete(removed.id)
        }
        const detail = {
            requestHeaders: req.headers || {},
            requestBody: '',
            responseHeaders: { 'Content-Type': 'text/plain; charset=utf-8' },
            responseBody: errorBody,
            statusCode,
            statusMessage: 'Internal Server Error',
            method: req.method,
            url: source,
        }
        proxyRecordDetailMap.set(recordId, detail)
        if (proxyRecordDetailMap.size > MAX_DETAIL_SIZE) {
            const firstKey = proxyRecordDetailMap.keys().next().value
            proxyRecordDetailMap.delete(firstKey)
        }
    }
}

/**
 * 加载配置并启动文件监听
 */
function loadAndWatchConfig(configPath, format) {
    ruleMap = loadConfigFromFile(configPath, format)
    currentConfig = { path: configPath, format }
    logRuleMap()

    if (format !== 'js') {
        const watcher = chokidar.watch(configPath)
        watcher.on('change', (changedPath) => {
            log(chalk.green('config file changed.'))
            ruleMap = loadConfigFromFile(changedPath, format)
            logRuleMap()
        })
    }
}

/**
 * 解析并加载配置，优先使用当前工作目录的 .eprc / ep.config.json / ep.config.js
 * 或从 settings.json 读取自定义路径
 */
function ensureConfigFile() {
    // 首先检查 settings.json 中是否有自定义路径
    const customPaths = loadCustomPathsFromSettings()
    
    if (customPaths.rulesFilePath && fs.existsSync(customPaths.rulesFilePath)) {
        // 使用自定义路由规则文件
        const ext = path.extname(customPaths.rulesFilePath)
        let format = 'eprc'
        if (ext === '.json') format = 'json'
        else if (ext === '.js') format = 'js'
        
        loadAndWatchConfig(customPaths.rulesFilePath, format)
        proxyDebug('使用自定义路由配置:', customPaths.rulesFilePath)
        return
    }
    
    // 检查项目目录配置
    const resolved = resolveConfigPath()
    if (resolved) {
        loadAndWatchConfig(resolved.path, resolved.format)
        proxyDebug('使用项目配置:', resolved.path)
        return
    }

    // 使用默认配置
    const configPath = DEFAULT_CONFIG_PATH
    const configDir = path.dirname(configPath)
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
        log('create config directory:', configDir)
    }
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, '', 'utf8')
        log('create config file:', configPath)
    }
    loadAndWatchConfig(configPath, 'eprc')
    proxyDebug('使用默认配置:', configPath)
}

ensureConfigFile()

const httpsServerMap = new Map()

const plugins = [{
    name: 'Plugin:Cross-Origin',
    /**
     *
     * @param {http.ServerResponse<http.IncomingMessage>} res
     */
    beforeSendResponse(res) {
        res.setHeader('Access-Control-Allow-Origin', '*')
    }
}]


const proxyServer = http.createServer((req, res) => {
    const [hostname, port] = req.headers.host.split(':')

    const serverPort = proxyServer.address().port
    if ((hostname === '127.0.0.1' || hostname === 'localhost')  && parseInt(port) === serverPort) {
        // Serve React build or fallback to index.html
        const webDistDir = path.resolve(__dirname, './web/dist')
        const hasReactBuild = fs.existsSync(path.resolve(webDistDir, 'index.html'))

        // API: 获取当前配置文件路径
        if (req.url === '/api/config-path') {
            res.setHeader('Content-Type', 'application/json')
            res.write(JSON.stringify({ 
                path: currentConfig?.path || '',
                mocksPath: getMockFilePath()
            }))
            res.end()
            return
        }

        // API: 刷新配置文件
        if (req.url === '/api/refresh-config' && req.method === 'POST') {
            res.setHeader('Content-Type', 'application/json')
            try {
                // 重新读取自定义路径配置
                const customPaths = loadCustomPathsFromSettings()
                
                // 刷新路由规则
                if (customPaths.rulesFilePath && fs.existsSync(customPaths.rulesFilePath)) {
                    const ext = path.extname(customPaths.rulesFilePath)
                    let format = 'eprc'
                    if (ext === '.json') format = 'json'
                    else if (ext === '.js') format = 'js'
                    
                    ruleMap = loadConfigFromFile(customPaths.rulesFilePath, format)
                    currentConfig = { path: customPaths.rulesFilePath, format }
                    logRuleMap()
                } else if (currentConfig && currentConfig.path) {
                    ruleMap = loadConfigFromFile(currentConfig.path, currentConfig.format)
                    logRuleMap()
                } else {
                    res.statusCode = 400
                    res.write(JSON.stringify({ error: '无当前配置文件' }))
                    res.end()
                    return
                }
                
                // 刷新 Mock 规则
                currentMocksPath = null // 清除缓存，强制重新读取
                loadMockRules()
                
                res.write(JSON.stringify({ 
                    status: 'success', 
                    message: '配置已刷新',
                    rulesPath: currentConfig?.path,
                    mocksPath: getMockFilePath()
                }))
            } catch (error) {
                res.statusCode = 500
                res.write(JSON.stringify({ error: error.message }))
            }
            res.end()
            return
        }

        // API: 获取系统设置
        if (req.url === '/api/settings' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json')
            try {
                if (fs.existsSync(settingsPath)) {
                    const settingsData = fs.readFileSync(settingsPath, 'utf8')
                    res.write(settingsData)
                } else {
                    // 返回默认设置
                    res.write(JSON.stringify({
                        theme: 'system',
                        fontSize: 'medium',
                        aiConfig: {
                            enabled: false,
                            provider: 'openai',
                            apiKey: '',
                            baseUrl: '',
                            model: '',
                            models: []
                        }
                    }))
                }
            } catch (error) {
                res.statusCode = 500
                res.write(JSON.stringify({ error: error.message }))
            }
            res.end()
            return
        }

        // API: 保存系统设置
        if (req.url === '/api/settings' && req.method === 'POST') {
            res.setHeader('Content-Type', 'application/json')
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
                try {
                    const settings = JSON.parse(body)
                    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
                    res.write(JSON.stringify({ status: 'success', message: '设置已保存' }))
                } catch (error) {
                    res.statusCode = 500
                    res.write(JSON.stringify({ error: error.message }))
                }
                res.end()
            })
            return
        }

        // API: 配置文件健康检查
        if (req.url === '/api/config-doctor' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json')
            try {
                const result = performConfigDiagnostics()
                res.write(JSON.stringify(result))
            } catch (error) {
                res.statusCode = 500
                res.write(JSON.stringify({ error: error.message }))
            }
            res.end()
            return
        }

        // API: 生成插件代码（流式）
        if (req.url === '/api/plugins/generate-stream' && req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body)
                    const { generatePluginStream } = require('./dist/core/plugin-generator')
                    
                    // 设置 SSE 响应头
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Access-Control-Allow-Origin': '*'
                    })
                    
                    // 发送初始事件
                    res.write('event: start\n')
                    res.write('data: {"status":"generating"}\n\n')
                    
                    let accumulatedCode = ''
                    
                    // 生成插件，实时发送chunk
                    const result = await generatePluginStream(
                        data.requirement, 
                        data.aiConfig,
                        (chunk) => {
                            accumulatedCode += chunk
                            res.write('event: chunk\n')
                            res.write(`data: ${JSON.stringify({ chunk, accumulated: accumulatedCode })}\n\n`)
                        }
                    )
                    
                    // 发送完成事件
                    res.write('event: complete\n')
                    res.write(`data: ${JSON.stringify({ status: 'success', plugin: result })}\n\n`)
                    res.end()
                } catch (error) {
                    res.write('event: error\n')
                    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
                    res.end()
                }
            })
            return
        }

        // API: 生成插件代码（非流式，向后兼容）
        if (req.url === '/api/plugins/generate' && req.method === 'POST') {
            res.setHeader('Content-Type', 'application/json')
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body)
                    const { generatePlugin } = require('./dist/core/plugin-generator')
                    const result = await generatePlugin(data.requirement, data.aiConfig)
                    res.write(JSON.stringify({ status: 'success', plugin: result }))
                } catch (error) {
                    res.statusCode = 500
                    res.write(JSON.stringify({ error: error.message }))
                }
                res.end()
            })
            return
        }

        // API: 保存插件到配置目录
        if (req.url === '/api/plugins/save' && req.method === 'POST') {
            res.setHeader('Content-Type', 'application/json')
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body)
                    const pluginsDir = path.resolve(epDir, 'plugins')
                    
                    // 创建 plugins 目录
                    if (!fs.existsSync(pluginsDir)) {
                        fs.mkdirSync(pluginsDir, { recursive: true })
                    }
                    
                    const filePath = path.resolve(pluginsDir, data.filename)
                    fs.writeFileSync(filePath, data.code, 'utf8')
                    
                    // 如果是TypeScript文件，自动编译为JavaScript
                    let compiled = false
                    let compileError = null
                    
                    if (data.filename.endsWith('.ts')) {
                        try {
                            const { compilePluginFile } = require('./dist/core/plugin-compiler')
                            const compileResult = await compilePluginFile(filePath)
                            
                            if (compileResult.success) {
                                compiled = true
                                console.log(chalk.green(`已编译插件: ${data.filename} -> ${data.filename.replace('.ts', '.js')}`))
                            } else {
                                compileError = compileResult.error
                                console.warn(chalk.yellow(`插件编译失败: ${compileResult.error}`))
                            }
                        } catch (error) {
                            compileError = error.message
                            console.error(chalk.red('编译插件时出错:', error.message))
                        }
                    }
                    
                    res.write(JSON.stringify({ 
                        status: 'success', 
                        message: compiled ? '插件已保存并编译' : '插件已保存',
                        path: filePath,
                        compiled,
                        compileError
                    }))
                } catch (error) {
                    res.statusCode = 500
                    res.write(JSON.stringify({ error: error.message }))
                }
                res.end()
            })
            return
        }

        // API: 列出自定义插件
        if (req.url === '/api/plugins/custom' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json')
            try {
                const pluginsDir = path.resolve(epDir, 'plugins')
                
                if (!fs.existsSync(pluginsDir)) {
                    res.write(JSON.stringify({ plugins: [] }))
                    res.end()
                    return
                }
                
                const files = fs.readdirSync(pluginsDir)
                const pluginInfo = []
                
                // 收集.ts和.js文件信息
                const tsFiles = files.filter(f => f.endsWith('.ts'))
                const jsFiles = files.filter(f => f.endsWith('.js'))
                
                // 处理每个.ts文件
                tsFiles.forEach(tsFile => {
                    const baseName = tsFile.replace(/\.ts$/, '')
                    const jsFile = baseName + '.js'
                    const hasCompiled = jsFiles.includes(jsFile)
                    
                    const tsPath = path.resolve(pluginsDir, tsFile)
                    const tsStat = fs.statSync(tsPath)
                    
                    let compiledTime = null
                    if (hasCompiled) {
                        const jsPath = path.resolve(pluginsDir, jsFile)
                        const jsStat = fs.statSync(jsPath)
                        compiledTime = jsStat.mtime
                    }
                    
                    pluginInfo.push({
                        filename: tsFile,
                        path: tsPath,
                        modified: tsStat.mtime,
                        compiled: hasCompiled,
                        compiledTime: compiledTime,
                        needsRecompile: hasCompiled && compiledTime < tsStat.mtime
                    })
                })
                
                // 添加独立的.js文件（没有对应.ts的）
                jsFiles.forEach(jsFile => {
                    const baseName = jsFile.replace(/\.js$/, '')
                    const tsFile = baseName + '.ts'
                    
                    if (!tsFiles.includes(tsFile)) {
                        const jsPath = path.resolve(pluginsDir, jsFile)
                        const jsStat = fs.statSync(jsPath)
                        
                        pluginInfo.push({
                            filename: jsFile,
                            path: jsPath,
                            modified: jsStat.mtime,
                            compiled: true,
                            compiledTime: jsStat.mtime,
                            needsRecompile: false
                        })
                    }
                })
                
                res.write(JSON.stringify({ plugins: pluginInfo }))
            } catch (error) {
                res.statusCode = 500
                res.write(JSON.stringify({ error: error.message }))
            }
            res.end()
            return
        }

        // API: 删除自定义插件
        if (req.url.startsWith('/api/plugins/custom/') && req.method === 'DELETE') {
            res.setHeader('Content-Type', 'application/json')
            try {
                const filename = decodeURIComponent(req.url.replace('/api/plugins/custom/', ''))
                const pluginsDir = path.resolve(epDir, 'plugins')
                const filePath = path.resolve(pluginsDir, filename)
                
                // 安全检查：确保文件在 plugins 目录内
                if (!filePath.startsWith(pluginsDir)) {
                    res.statusCode = 403
                    res.write(JSON.stringify({ error: '非法的文件路径' }))
                    res.end()
                    return
                }
                
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath)
                    res.write(JSON.stringify({ 
                        status: 'success', 
                        message: '插件已删除' 
                    }))
                } else {
                    res.statusCode = 404
                    res.write(JSON.stringify({ error: '插件文件不存在' }))
                }
            } catch (error) {
                res.statusCode = 500
                res.write(JSON.stringify({ error: error.message }))
            }
            res.end()
            return
        }

        if(req.url.startsWith('/api/rules')) {
            const method = req.method.toLocaleLowerCase()
            if(method === 'put') {
                if (!currentConfig || currentConfig.format === 'js') {
                    res.statusCode = 405
                    res.setHeader('Content-Type', 'application/json')
                    res.write(JSON.stringify({ error: '.js 配置文件为只读，无法通过界面保存' }))
                    res.end()
                    return
                }
                res.setHeader('Content-Type', 'application/json')
                let text = ''
                req.on('data', chunk => { text += chunk })
                req.on('end', () => {
                    try {
                        const { parseEprc } = require('./dist/helpers')
                        const newRuleMap = parseEprc(text)
                        if (currentConfig.format === 'json') {
                            // 对于JSON格式，需要保留完整的规则信息（包括禁用的规则）
                            // 解析带有启用/禁用状态的规则
                            const rulesWithStatus = text.split(/\r?\n/).filter(line => line.trim()).map(line => {
                                let enabled = true
                                let trimmedLine = line.trim()
                                if (trimmedLine.startsWith('//')) {
                                    enabled = false
                                    trimmedLine = trimmedLine.replace(/^\/\//, '').trim()
                                }
                                return { line: trimmedLine, enabled }
                            })
                            
                            // 构建包含启用状态的JSON结构
                            const rulesObj = {}
                            rulesWithStatus.forEach(({ line, enabled }) => {
                                const parts = line.split(/\s+/).filter(Boolean)
                                if (parts.length < 2) return
                                
                                const IP_PATTERN = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/
                                const URL_PATTERN = /^https?:\/\//
                                const isTargetFirst = IP_PATTERN.test(parts[0]) || URL_PATTERN.test(parts[0])
                                
                                if (isTargetFirst) {
                                    const [target, ...rules] = parts
                                    rules.forEach(rule => {
                                        const key = enabled ? rule : `//${rule}`
                                        rulesObj[key] = target
                                    })
                                } else {
                                    const target = parts[parts.length - 1]
                                    const rules = parts.slice(0, -1)
                                    rules.forEach(rule => {
                                        const key = enabled ? rule : `//${rule}`
                                        rulesObj[key] = target
                                    })
                                }
                            })
                            
                            const content = JSON.stringify({ rules: rulesObj }, null, 2)
                            fs.writeFileSync(currentConfig.path, content, 'utf8')
                        } else {
                            fs.writeFileSync(currentConfig.path, text, 'utf8')
                        }
                        ruleMap = newRuleMap
                        res.write(JSON.stringify({ status: 'success' }))
                    } catch (err) {
                        res.statusCode = 500
                        res.write(JSON.stringify({ error: err.message }))
                    }
                    res.end()
                })
                req.on('error', () => {
                    res.statusCode = 500
                    res.statusMessage = 'Internal error'
                })
            } else {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8')
                // 读取完整的配置文件内容（包括禁用的规则）
                if (currentConfig && fs.existsSync(currentConfig.path)) {
                    const content = fs.readFileSync(currentConfig.path, 'utf8')
                    // 对于JSON格式，需要转换为EPRC格式
                    if (currentConfig.format === 'json') {
                        try {
                            const json = JSON.parse(content)
                            const rulesObj = json.rules || {}
                            const lines = []
                            for (const [rule, target] of Object.entries(rulesObj)) {
                                const prefix = rule.startsWith('//') ? '//' : ''
                                const cleanRule = rule.replace(/^\/\//, '')
                                lines.push(`${prefix}${cleanRule} ${target}`)
                            }
                            res.write(lines.join('\n'))
                        } catch (err) {
                            res.write(ruleMapToEprcText(ruleMap))
                        }
                    } else {
                        res.write(content)
                    }
                } else {
                    res.write(ruleMapToEprcText(ruleMap))
                }
                res.end()
            }
        } else if (req.url.startsWith('/api/logs')) {
            const match = req.url.match(/^\/api\/logs\/(\d+)$/)
            if (match) {
                const id = parseInt(match[1], 10)
                const detail = proxyRecordDetailMap.get(id)
                res.setHeader('Content-Type', 'application/json')
                if (detail) {
                    res.write(JSON.stringify(detail))
                } else {
                    res.statusCode = 404
                    res.write(JSON.stringify({ error: 'Not found' }))
                }
                res.end()
            } else {
                res.setHeader('Content-Type', 'application/json')
                // Sort logs by time - newest to oldest (reverse chronological order)
                res.write(JSON.stringify([...proxyRecordArr].reverse()))
                res.end()
            }
        } else if (req.url.startsWith('/api/mocks')) {
            res.setHeader('Content-Type', 'application/json')
            const method = req.method.toUpperCase()

            // DELETE /api/mocks/:id
            const deleteMatch = req.url.match(/^\/api\/mocks\/(\d+)$/)
            if (method === 'DELETE' && deleteMatch) {
                const id = parseInt(deleteMatch[1], 10)
                const idx = mockRules.findIndex(r => r.id === id)
                if (idx !== -1) {
                    mockRules.splice(idx, 1)
                    saveMockRules()
                    res.write(JSON.stringify({ status: 'success' }))
                } else {
                    res.statusCode = 404
                    res.write(JSON.stringify({ error: 'Not found' }))
                }
                res.end()
                return
            }

            // PUT /api/mocks/:id - 更新规则
            const putMatch = req.url.match(/^\/api\/mocks\/(\d+)$/)
            if (method === 'PUT' && putMatch) {
                const id = parseInt(putMatch[1], 10)
                let body = ''
                req.on('data', chunk => { body += chunk })
                req.on('end', () => {
                    try {
                        const data = JSON.parse(body)
                        const idx = mockRules.findIndex(r => r.id === id)
                        if (idx === -1) {
                            res.statusCode = 404
                            res.write(JSON.stringify({ error: 'Not found' }))
                        } else {
                            mockRules[idx] = { ...mockRules[idx], ...data, id }
                            saveMockRules()
                            res.write(JSON.stringify({ status: 'success', rule: mockRules[idx] }))
                        }
                    } catch (err) {
                        res.statusCode = 400
                        res.write(JSON.stringify({ error: err.message }))
                    }
                    res.end()
                })
                return
            }

            // POST /api/mocks - 创建规则
            if (method === 'POST') {
                let body = ''
                req.on('data', chunk => { body += chunk })
                req.on('end', () => {
                    try {
                        const data = JSON.parse(body)
                        const rule = {
                            id: mockIdSeq++,
                            name: data.name || '',
                            urlPattern: data.urlPattern || '',
                            method: data.method || '*',
                            statusCode: data.statusCode || 200,
                            delay: data.delay || 0,
                            bodyType: data.bodyType || 'inline',
                            headers: data.headers || {},
                            body: data.body || '',
                            enabled: data.enabled !== false
                        }
                        mockRules.push(rule)
                        saveMockRules()
                        res.write(JSON.stringify({ status: 'success', rule }))
                    } catch (err) {
                        res.statusCode = 400
                        res.write(JSON.stringify({ error: err.message }))
                    }
                    res.end()
                })
                return
            }

            // GET /api/mocks - 列出规则
            res.write(JSON.stringify(mockRules))
            res.end()
        } else if (req.url.startsWith('/api/replay')) {
            // POST /api/replay/:id - 重放请求
            res.setHeader('Content-Type', 'application/json')
            const replayMatch = req.url.match(/^\/api\/replay\/(\d+)$/)
            if (req.method === 'POST' && replayMatch) {
                const id = parseInt(replayMatch[1], 10)
                const record = proxyRecordArr.find(r => r.id === id)
                const detail = proxyRecordDetailMap.get(id)
                if (!detail) {
                    res.statusCode = 404
                    res.write(JSON.stringify({ error: '请求详情已过期或不存在' }))
                    res.end()
                    return
                }
                // 优先使用代理后的实际目标地址（如 IP），确保重放到相同服务器
                // Mock/Replay 等合成目标以 '[' 开头，此时回退到源地址
                let replayUrl
                if (record && record.target && !record.target.startsWith('[')) {
                    replayUrl = record.target
                } else {
                    replayUrl = detail.url || (record && record.source)
                }
                const replayMethod = detail.method || (record && record.method) || 'GET'
                const sourceUrl = detail.url || (record && record.source) || replayUrl
                if (!replayUrl) {
                    res.statusCode = 400
                    res.write(JSON.stringify({ error: '无法获取原始请求 URL' }))
                    res.end()
                    return
                }
                try {
                    const parsedUrl = new URL(replayUrl)
                    const isHttps = parsedUrl.protocol === 'https:'
                    const requestFn = isHttps ? https.request : http.request
                    // 清理 headers，移除 HTTP/2 伪头
                    const replayHeaders = { ...detail.requestHeaders }
                    delete replayHeaders[':method']
                    delete replayHeaders[':path']
                    delete replayHeaders[':authority']
                    delete replayHeaders[':scheme']
                    // 保留原始 Host 头（用于服务器路由），若不存在才用目标 URL 的 host
                    if (!replayHeaders['host'] && !replayHeaders['Host']) {
                        replayHeaders['host'] = parsedUrl.host
                    }
                    const startTime = Date.now()
                    const replayReq = requestFn(replayUrl, {
                        method: replayMethod,
                        headers: replayHeaders,
                        rejectUnauthorized: false
                    }, (replayRes) => {
                        const chunks = []
                        replayRes.on('data', chunk => chunks.push(chunk))
                        replayRes.on('end', () => {
                            const duration = Date.now() - startTime
                            const resBody = Buffer.concat(chunks)
                            const newRecordId = recordIdSeq++
                            const logData = {
                                id: newRecordId,
                                method: replayMethod,
                                source: sourceUrl,
                                target: `[REPLAY] ${replayUrl}`,
                                time: new Date().toLocaleTimeString(),
                                statusCode: replayRes.statusCode,
                                duration
                            }
                            try {
                                localWSServer.clients.forEach(client => client.send(JSON.stringify(logData)))
                            } catch (_) {}
                            proxyRecordArr.push(logData)
                            if (proxyRecordArr.length > MAX_RECORD_SIZE) {
                                const removed = proxyRecordArr.shift()
                                if (removed.id !== undefined) proxyRecordDetailMap.delete(removed.id)
                            }
                            const responseEncoding = replayRes.headers && replayRes.headers['content-encoding']
                            const newDetail = {
                                requestHeaders: detail.requestHeaders,
                                requestBody: detail.requestBody,
                                responseHeaders: replayRes.headers,
                                responseBody: safeBodyToString(resBody, MAX_BODY_SIZE, responseEncoding),
                                statusCode: replayRes.statusCode,
                                statusMessage: replayRes.statusMessage,
                                method: replayMethod,
                                url: sourceUrl,
                            }
                            proxyRecordDetailMap.set(newRecordId, newDetail)
                            if (proxyRecordDetailMap.size > MAX_DETAIL_SIZE) {
                                const firstKey = proxyRecordDetailMap.keys().next().value
                                proxyRecordDetailMap.delete(firstKey)
                            }
                            res.write(JSON.stringify({ status: 'success', recordId: newRecordId, logData }))
                            res.end()
                        })
                    })
                    replayReq.on('error', (err) => {
                        res.statusCode = 502
                        res.write(JSON.stringify({ error: '重放请求失败: ' + err.message }))
                        res.end()
                    })
                    if (detail.requestBody) {
                        replayReq.write(detail.requestBody)
                    }
                    replayReq.end()
                } catch (err) {
                    res.statusCode = 500
                    res.write(JSON.stringify({ error: '重放失败: ' + err.message }))
                    res.end()
                }
            } else {
                res.statusCode = 405
                res.write(JSON.stringify({ error: 'Method not allowed' }))
                res.end()
            }
        } else if (req.url.startsWith('/api/pipeline/shadow-stats')) {
            res.setHeader('Content-Type', 'application/json')
            if (req.method === 'DELETE' || req.method === 'POST') {
                shadowCompareTracker.reset()
                onModeGate.reset()
                res.write(JSON.stringify({
                    status: 'success',
                    stats: shadowCompareTracker.getStats(),
                    onModeGate: onModeGate.getStats(),
                }))
            } else {
                res.write(JSON.stringify({
                    ...shadowCompareTracker.getStats(),
                    onModeGate: onModeGate.getStats(),
                }))
            }
            res.end()
        } else if (req.url.startsWith('/api/pipeline/readiness')) {
            res.setHeader('Content-Type', 'application/json')
            const shadowStats = shadowCompareTracker.getStats()
            const readiness = evaluateShadowReadiness(shadowStats, {
                minSamples: SHADOW_WARN_MIN_SAMPLES,
                maxDiffRate: SHADOW_WARN_DIFF_RATE,
            })
            const gateStats = onModeGate.getStats()
            const advice = buildReadinessAdvice({
                mode: requestPipeline.mode,
                readiness,
                allowlist: Array.from(PLUGIN_ON_HOSTS),
                onModeGate: gateStats,
            })
            res.write(JSON.stringify({
                mode: requestPipeline.mode,
                readiness,
                advice,
                shadowStats,
                onModeGate: gateStats,
                allowlist: Array.from(PLUGIN_ON_HOSTS),
            }))
            res.end()
        } else if (req.url.startsWith('/api/refactor/status')) {
            res.setHeader('Content-Type', 'application/json')
            const shadowStats = shadowCompareTracker.getStats()
            const readiness = evaluateShadowReadiness(shadowStats, {
                minSamples: SHADOW_WARN_MIN_SAMPLES,
                maxDiffRate: SHADOW_WARN_DIFF_RATE,
            })
            const gateStats = onModeGate.getStats()
            const advice = buildReadinessAdvice({
                mode: requestPipeline.mode,
                readiness,
                allowlist: Array.from(PLUGIN_ON_HOSTS),
                onModeGate: gateStats,
            })
            const pluginStats = hookDispatcher.getPluginStats ? hookDispatcher.getPluginStats() : {}
            const plugins = pluginManager.getAll().map((plugin) => ({
                id: plugin.manifest.id,
                name: plugin.manifest.name,
                version: plugin.manifest.version,
                state: pluginManager.getState(plugin.manifest.id),
                stats: pluginStats[plugin.manifest.id] || null,
            }))
            const payload = buildRefactorStatus({
                runtime: {
                    pid: process.pid,
                    uptimeSec: Math.floor(process.uptime()),
                },
                mode: requestPipeline.mode,
                allowlist: Array.from(PLUGIN_ON_HOSTS),
                readiness,
                advice,
                shadowStats,
                onModeGate: gateStats,
                plugins,
                loggerSummary: typeof builtinLoggerPlugin.getSummary === 'function'
                    ? builtinLoggerPlugin.getSummary()
                    : null,
            })
            res.write(JSON.stringify(payload))
            res.end()
        } else if (req.url.startsWith('/api/pipeline/config')) {
            res.setHeader('Content-Type', 'application/json')
            res.write(JSON.stringify({
                mode: requestPipeline.mode,
                allowlist: Array.from(PLUGIN_ON_HOSTS),
                plugins: {
                    router: ENABLE_BUILTIN_ROUTER_PLUGIN,
                    logger: ENABLE_BUILTIN_LOGGER_PLUGIN,
                    mock: ENABLE_BUILTIN_MOCK_PLUGIN,
                },
                thresholds: {
                    shadowWarnMinSamples: SHADOW_WARN_MIN_SAMPLES,
                    shadowWarnDiffRate: SHADOW_WARN_DIFF_RATE,
                },
                onModeGate: onModeGate.getStats(),
            }))
            res.end()
        } else if (req.url.startsWith('/api/plugins/logger')) {
            res.setHeader('Content-Type', 'application/json')
            const pluginStats = hookDispatcher.getPluginStats ? hookDispatcher.getPluginStats() : {}
            res.write(JSON.stringify({
                pluginId: 'builtin.logger',
                mode: requestPipeline.mode,
                stats: pluginStats['builtin.logger'] || null,
                summary: typeof builtinLoggerPlugin.getSummary === 'function'
                    ? builtinLoggerPlugin.getSummary()
                    : null,
                recent: typeof builtinLoggerPlugin.getRecentEntries === 'function'
                    ? builtinLoggerPlugin.getRecentEntries()
                    : [],
            }))
            res.end()
        } else if (req.url.startsWith('/api/plugins/mock')) {
            res.setHeader('Content-Type', 'application/json')
            const pluginStats = hookDispatcher.getPluginStats ? hookDispatcher.getPluginStats() : {}
            res.write(JSON.stringify({
                pluginId: 'builtin.mock',
                enabled: ENABLE_BUILTIN_MOCK_PLUGIN,
                mode: requestPipeline.mode,
                stats: pluginStats['builtin.mock'] || null,
                takeoverRule: 'only inline mock in on mode and host-gated',
                allowlist: Array.from(PLUGIN_ON_HOSTS),
            }))
            res.end()
        } else if (req.url.startsWith('/api/plugins/health')) {
            res.setHeader('Content-Type', 'application/json')
            const pluginStats = hookDispatcher.getPluginStats ? hookDispatcher.getPluginStats() : {}
            const pluginStates = {}
            const manifests = pluginManager.getAll().map((plugin) => {
                pluginStates[plugin.manifest.id] = pluginManager.getState(plugin.manifest.id)
                return plugin.manifest
            })
            const health = buildPluginHealth({
                plugins: manifests,
                pluginStates,
                pluginStats,
            })
            res.write(JSON.stringify({
                mode: requestPipeline.mode,
                ...health,
            }))
            res.end()
        } else if (req.url.startsWith('/api/plugins')) {
            res.setHeader('Content-Type', 'application/json')
            const pluginStats = hookDispatcher.getPluginStats ? hookDispatcher.getPluginStats() : {}
            const plugins = pluginManager.getAll().map((plugin) => ({
                id: plugin.manifest.id,
                name: plugin.manifest.name,
                version: plugin.manifest.version,
                hooks: plugin.manifest.hooks,
                permissions: plugin.manifest.permissions,
                priority: plugin.manifest.priority,
                state: pluginManager.getState(plugin.manifest.id),
                stats: pluginStats[plugin.manifest.id] || null,
            }))
            res.write(JSON.stringify({
                mode: requestPipeline.mode,
                total: plugins.length,
                plugins,
            }))
            res.end()
        } else if (hasReactBuild) {
            // Serve static files from React build
            let filePath = req.url === '/' ? '/index.html' : req.url
            // Remove query string
            filePath = filePath.split('?')[0]
            const fullPath = path.resolve(webDistDir, '.' + filePath)
            // Security: ensure the resolved path is within webDistDir
            if (!fullPath.startsWith(webDistDir)) {
                res.writeHead(403)
                res.end()
                return
            }
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                const ext = path.extname(fullPath).toLowerCase()
                const mimeTypes = {
                    '.html': 'text/html',
                    '.js': 'application/javascript',
                    '.css': 'text/css',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.svg': 'image/svg+xml',
                    '.ico': 'image/x-icon',
                    '.woff': 'font/woff',
                    '.woff2': 'font/woff2',
                }
                res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
                res.writeHead(200)
                fs.createReadStream(fullPath).pipe(res)
            } else {
                // SPA fallback: serve index.html for non-file routes
                res.setHeader('Content-Type', 'text/html')
                res.writeHead(200)
                res.write(fs.readFileSync(path.resolve(webDistDir, 'index.html'), 'utf8'))
                res.end()
            }
        } else {
            // Fallback to legacy index.html
            if (req.url === '/' || !req.url.startsWith('/api')) {
                const legacyHtml = path.resolve(__dirname, './index.html')
                if (fs.existsSync(legacyHtml)) {
                    res.setHeader('Content-Type', 'text/html')
                    res.writeHead(200)
                    res.write(fs.readFileSync(legacyHtml, 'utf8'))
                    res.end()
                } else {
                    res.writeHead(404)
                    res.end()
                }
            } else {
                res.writeHead(404)
                res.end()
            }
        }
    } else {
        // proxy http request over http
        const source = req.url

        // 检查 mock 规则
        const mockRule = matchMockRule(source, req.method)
        if (mockRule && !shouldUsePluginMockForRequest(source, mockRule)) {
            return sendMockResponse(req, res, mockRule, { method: req.method, source, target: source })
        }

        const reqChunks = []
        req.on('data', chunk => reqChunks.push(chunk))
        req.on('end', async () => {
            const reqBody = Buffer.concat(reqChunks)
            const legacyResolvedTarget = resolveTargetUrl(source, ruleMap)
            if (legacyResolvedTarget && legacyResolvedTarget.startsWith('file://')) {
                return handleMapLocalRequest(req, res, source, legacyResolvedTarget)
            }
            const legacyTarget = legacyResolvedTarget || source
            const routeDecision = await decideRoute({
                source,
                method: req.method,
                headers: req.headers,
                reqBody,
                legacyTarget,
                requestPipeline,
                canUsePipelineExecuteForSource,
                observeShadowDecision,
                fallbackResolve: async () => ({
                    target: legacyTarget,
                    shortCircuited: false,
                    response: null,
                }),
            })
            let target = routeDecision.target
            if (routeDecision.shortCircuited) {
                sendShortResponse(res, routeDecision.response)
                return
            }
            const url = new URL(target.startsWith('http') ? target : req.url, 'http://' + req.headers.host)
            const startTime = Date.now()
            const proxyReq = http.request(url, {
                method: req.method,
                headers: req.headers
            }, (proxyRes) => {
                const resChunks = []
                res.writeHead(proxyRes.statusCode, proxyRes.headers)
                proxyRes.on('data', chunk => {
                    resChunks.push(chunk)
                    res.write(chunk)
                })
                proxyRes.on('end', () => {
                    res.end()
                    const resBody = Buffer.concat(resChunks)
                    const recordId = recordIdSeq++
                    const logData = {
                        id: recordId,
                        method: req.method,
                        source,
                        target: url.href,
                        time: new Date().toLocaleTimeString(),
                        statusCode: proxyRes.statusCode,
                        duration: Date.now() - startTime
                    }
                    emitLegacyResponseToPlugins(logData)
                    localWSServer.clients.forEach(client => client.send(JSON.stringify(logData)))
                    proxyRecordArr.push(logData)
                    if (proxyRecordArr.length > MAX_RECORD_SIZE) {
                        const removed = proxyRecordArr.shift()
                        if (removed.id !== undefined) proxyRecordDetailMap.delete(removed.id)
                    }
                    // 获取响应编码，用于解压
                    const responseEncoding = proxyRes.headers && proxyRes.headers['content-encoding']
                    const detail = {
                        requestHeaders: req.headers,
                        requestBody: safeBodyToString(reqBody, MAX_BODY_SIZE),
                        responseHeaders: proxyRes.headers,
                        responseBody: safeBodyToString(resBody, MAX_BODY_SIZE, responseEncoding),
                        statusCode: proxyRes.statusCode,
                        statusMessage: proxyRes.statusMessage,
                        method: req.method,
                        url: source,
                    }
                    proxyRecordDetailMap.set(recordId, detail)
                    if (proxyRecordDetailMap.size > MAX_DETAIL_SIZE) {
                        const firstKey = proxyRecordDetailMap.keys().next().value
                        proxyRecordDetailMap.delete(firstKey)
                    }
                })
            })
            proxyReq.on('error', (err) => {
                emitLegacyErrorToPlugins('onBeforeResponse', err)
                console.error('HTTP proxy error:', err.message)
                if (!res.headersSent) {
                    res.writeHead(502)
                }
                res.end()
            })
            proxyReq.write(reqBody)
            proxyReq.end()
        })
    }
})

const localWSServer = new WebSocketServer({
    server: proxyServer
})

localWSServer.addListener('connection', (client, req) => {
    // client.send(JSON.stringify(proxyRecordArr), err => {
    //     if(err) console.error(err)
    // })
})

/**
 * 使用代理启动全新的浏览器实例（独立用户数据目录，不复用已运行的浏览器）
 * @param {string} url - 初始打开的 URL
 * @param {string} proxyServer - 代理地址，如 127.0.0.1:8989
 * @param {number} [remoteDebuggingPort] - 可选，开启远程调试端口供 chrome-devtools 连接
 * @returns {boolean} 是否成功启动
 */
function openBrowserWithProxy(url, proxyServer, remoteDebuggingPort) {
    const platform = os.platform()
    const userDataDir = path.join(epDir, 'chrome-proxy')
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true })
    }
    const browsers = platform === 'darwin'
        ? ['Google Chrome', 'Microsoft Edge', 'Chromium']
        : platform === 'win32'
            ? ['chrome', 'msedge', 'chromium']
            : ['google-chrome', 'chromium', 'chromium-browser']
    let proxyArgs = `--user-data-dir="${userDataDir}" --proxy-server=${proxyServer} --window-size=1920,1080`
    if (remoteDebuggingPort) {
        proxyArgs += ` --remote-debugging-port=${remoteDebuggingPort}`
    }
    for (const app of browsers) {
        try {
            if (platform === 'darwin') {
                execSync(`open -a "${app}" --args ${proxyArgs} "${url}"`, { stdio: 'ignore' })
                return true
            } else if (platform === 'win32') {
                execSync(`start "" "${app}" ${proxyArgs} "${url}"`, { stdio: 'ignore' })
                return true
            } else {
                execSync(`${app} ${proxyArgs} "${url}"`, { stdio: 'ignore' })
                return true
            }
        } catch (err) {
            continue
        }
    }
    try {
        if (platform === 'darwin') {
            execSync(`open "${url}"`, { stdio: 'ignore' })
        } else if (platform === 'win32') {
            execSync(`start "" "${url}"`, { stdio: 'ignore' })
        } else {
            execSync(`xdg-open "${url}"`, { stdio: 'ignore' })
        }
        console.log(chalk.yellow('未找到 Chrome/Edge，已用默认浏览器打开，请手动设置代理:', proxyServer))
        return true
    } catch (err) {
        console.error(chalk.red('浏览器并未启动:'), err.message)
        return false
    }
}

;(async () => {
    await ensureRootCA()
    await bootstrapBuiltinPlugins()
    const port = await getFreePort()
    proxyServer.listen(port, () => {
        const proxyUrl = `http://127.0.0.1:${port}`
        proxyDebug('proxy-server start on ' + chalk.green(proxyUrl))
        proxyDebug('plugin pipeline mode: ' + chalk.cyan(requestPipeline.mode))
        if (requestPipeline.mode === 'on') {
            proxyDebug('plugin on host allowlist: ' + (PLUGIN_ON_HOSTS.size > 0 ? Array.from(PLUGIN_ON_HOSTS).join(',') : '(all)'))
        }
        if (process.env.EP_MCP) {
            const mcpFile = path.join(epDir, 'mcp-proxy-url.json')
            const mcpData = { proxyUrl }
            if (process.env.EP_OPEN_CHROMEDEVTOOLS) {
                mcpData.remoteDebuggingPort = 9222
            }
            fs.writeFileSync(mcpFile, JSON.stringify(mcpData), 'utf8')
        }
        if (AUTO_OPEN) {
            const proxyServer = `127.0.0.1:${port}`
            const remotePort = process.env.EP_OPEN_CHROMEDEVTOOLS ? 9222 : undefined
            if (openBrowserWithProxy(proxyUrl, proxyServer, remotePort)) {
                console.log(chalk.green('已启动浏览器（代理:'), proxyServer + chalk.green(')'))
            } else {
                console.log(chalk.yellow('浏览器并未启动，请手动打开'), chalk.cyan(proxyUrl), chalk.yellow('并设置代理'), proxyServer)
            }
        }
    })
})()

// proxy https request over http
// 仅对配置了反向代理规则的请求进行解密（MITM），其余 HTTPS 直接隧道转发以提升性能
proxyServer.on('connect', async (req, socket, header) => {
    const originHost = req.url.split(':')[0]
    const needDecrypt = !!resolveTargetUrl('https://' + req.url + '/', ruleMap)
    proxyDebug('received connect request....', needDecrypt ? '(decrypt)' : '(tunnel)')

    socket.on('end', () => {
        // proxyDebug('end')
    })

    socket.on('error', (err) => {
        console.error(err)
    })

    // 无反向代理规则：直接隧道转发，不解密，减轻性能开销
    if (!needDecrypt) {
        const parts = req.url.split(':')
        const host = parts[0]
        const port = parts[1] ? parseInt(parts[1], 10) : 443
        const connection = connect({ host, port }, () => {
            socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
            socket.pipe(connection)
            connection.pipe(socket)
        })
        connection.on('error', (err) => {
            proxyDebug('tunnel connect error', host + ':' + port, err.message)
            if (!socket.destroyed) {
                try { socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n') } catch (_) {}
            }
        })
        return
    }

    // 有反向代理规则：解密并走代理逻辑
    socket.write('HTTP/1.1 200 Connection Established\r\n' +
        'Proxy-Agent: Node.js-Proxy\r\n' +
        '\r\n')

    function createHttpsServerByCert() {
        return new Promise((resolve, reject) => {
            crtMgr.getCertificate(originHost, (error, key, crt) => {
                if (error) return reject(error)
                // 使用 HTTP/2 安全服务器，同时兼容 HTTP/1.1（用于 WebSocket Upgrade 等）
                const server = http2.createSecureServer({ cert: crt, key, allowHTTP1: true }, (req, res) => {
                    const source = 'https://' + (req.headers.host || req.authority || originHost) + req.url

                    // 检查 mock 规则
                    const mockRule = matchMockRule(source, req.method)
                    if (mockRule && !shouldUsePluginMockForRequest(source, mockRule)) {
                        return sendMockResponse(req, res, mockRule, { method: req.method, source, target: source })
                    }

                    const reqChunks = []
                    req.on('data', chunk => reqChunks.push(chunk))
                    req.on('end', async () => {
                        const reqBody = Buffer.concat(reqChunks)
                        const legacyResolvedTarget = resolveTargetUrl(source, ruleMap)
                        if (legacyResolvedTarget && legacyResolvedTarget.startsWith('file://')) {
                            return handleMapLocalRequest(req, res, source, legacyResolvedTarget)
                        }
                        const legacyTarget = legacyResolvedTarget || source
                        const routeDecision = await decideRoute({
                            source,
                            method: req.method,
                            headers: req.headers,
                            reqBody,
                            legacyTarget,
                            requestPipeline,
                            canUsePipelineExecuteForSource,
                            observeShadowDecision,
                            fallbackResolve: async () => ({
                                target: legacyTarget,
                                shortCircuited: false,
                                response: null,
                            }),
                        })
                        let target = routeDecision.target
                        if (routeDecision.shortCircuited) {
                            sendShortResponse(res, routeDecision.response)
                            return
                        }
                        const startTime = Date.now()
                        try {
                            const proxyRes = await makeProxyRequest(target, req.method, req.headers, reqBody)
                            const resChunks = []
                            // HTTP/2 不允许逐跳头（如 transfer-encoding），需过滤后再写入
                            res.writeHead(proxyRes.statusCode, cleanHeadersForH2(proxyRes.headers))

                            proxyRes.stream.on('data', chunk => {
                                resChunks.push(chunk)
                                res.write(chunk)
                            })
                            proxyRes.stream.on('end', () => {
                                res.end()
                                const resBody = Buffer.concat(resChunks)
                                const recordId = recordIdSeq++
                                const logData = {
                                    id: recordId,
                                    method: req.method,
                                    source,
                                    target,
                                    time: new Date().toLocaleTimeString(),
                                    protocol: proxyRes.protocol,
                                    statusCode: proxyRes.statusCode,
                                    duration: Date.now() - startTime
                                }
                                emitLegacyResponseToPlugins(logData)
                                localWSServer.clients.forEach(client => client.send(JSON.stringify(logData)))
                                proxyRecordArr.push(logData)
                                if (proxyRecordArr.length > MAX_RECORD_SIZE) {
                                    const removed = proxyRecordArr.shift()
                                    if (removed.id !== undefined) proxyRecordDetailMap.delete(removed.id)
                                }
                                // 获取响应编码，用于解压
                                const responseEncoding = proxyRes.headers && proxyRes.headers['content-encoding']
                                const detail = {
                                    requestHeaders: req.headers,
                                    requestBody: safeBodyToString(reqBody, MAX_BODY_SIZE),
                                    responseHeaders: proxyRes.headers,
                                    responseBody: safeBodyToString(resBody, MAX_BODY_SIZE, responseEncoding),
                                    statusCode: proxyRes.statusCode,
                                    statusMessage: proxyRes.statusMessage,
                                    method: req.method,
                                    url: source,
                                }
                                proxyRecordDetailMap.set(recordId, detail)
                                if (proxyRecordDetailMap.size > MAX_DETAIL_SIZE) {
                                    const ids = Array.from(proxyRecordDetailMap.keys()).sort((a, b) => a - b)
                                    proxyRecordDetailMap.delete(ids[0])
                                }
                                console.table(logData)
                            })
                        } catch (err) {
                            const code = err.code || ''
                            const isConnReset = code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED'
                            if (isConnReset) {
                                console.error('[proxy] upstream %s %s: %s', originHost + req.url, code, err.message)
                            } else {
                                console.error('[error debug]', originHost + req.url, err)
                            }
                            emitLegacyErrorToPlugins('onBeforeResponse', err)
                            if (!res.headersSent) {
                                try { res.writeHead(502) } catch (_) {}
                            }
                            try { res.end() } catch (_) {}
                        }
                    })
                })

                const wsServer = new WebSocketServer({
                    server
                })

                wsServer.on('connection', (ws, req) => {
                    const sourceWsUrl = 'wss://' + req.headers.host + req.url
                    let targetUrl = resolveTargetUrl(sourceWsUrl, ruleMap)
                    if (!targetUrl) targetUrl = sourceWsUrl

                    const proxyWs = new WebSocket(targetUrl, ws.protocol, {
                        rejectUnauthorized: false,
                        headers: req.headers
                    });

                    proxyWs.on('message', (data) => {
                        ws.send(data, (err) => {
                            if (err) console.error(err)
                        })
                    })

                    ws.on('message', (data) => {
                        proxyWs.send(data, (err) => {
                            if (err) console.error(err)
                        })
                    });

                    ws.on('error', (e) => {
                        console.error('error in ws:', e);
                    });
                    ws.on('close', (code, reason) => {
                        log('ws close', code, reason);
                    });

                })

                resolve(server)
            })
        })
    }


    let server = httpsServerMap.get(originHost)

    if (!server) {
        const port = await getFreePort()
        server = await createHttpsServerByCert()
        server.listen(port, () => {
            proxyDebug('listening on ' + port)
        })
        httpsServerMap.set(originHost, server)
    }

    if (server.listening) {
        connectToLocalHttpsServer(server)
    } else {
        server.on('listening', () => {
            connectToLocalHttpsServer(server)
        })
    }

    /**
     *
     * @param {import('https').Server} server
     */
    function connectToLocalHttpsServer(server) {
        const connection = connect({
            host: server.address().address,
            port: server.address().port,
        }, (res) => {
            socket.pipe(connection)
            connection.pipe(socket)
        })
    }

})

proxyServer.on('upgrade', (req, socket, header) => {
    // proxyDebug(req, socket)
})

process.on('uncaughtException', function (err) {
    console.error(err.stack);
});

function logRuleMap() {
    const ruleCount = Object.keys(ruleMap).length
    const configFile = currentConfig ? currentConfig.path : '未知'
    console.log(chalk.green(`已加载配置文件: ${configFile} (${ruleCount} 条规则)`))
}

function observeShadowDecision(method, source, baseTarget, observedTarget) {
    const isDiff = shadowCompareTracker.record({ method, source, baseTarget, observedTarget })
    if (isDiff) {
        proxyDebug('pipeline shadow target diff:', baseTarget, '->', observedTarget)
    }
    const stats = shadowCompareTracker.getStats()
    if (
        stats.total >= SHADOW_WARN_MIN_SAMPLES &&
        stats.diffRate >= SHADOW_WARN_DIFF_RATE &&
        stats.total % SHADOW_WARN_MIN_SAMPLES === 0
    ) {
        console.warn(
            '[shadow-compare] diff rate is high: total=%d diff=%d diffRate=%s threshold=%s',
            stats.total,
            stats.diff,
            stats.diffRate,
            SHADOW_WARN_DIFF_RATE
        )
    }
    if (stats.total > 0 && stats.total % 200 === 0) {
        proxyDebug(
            'pipeline shadow compare stats total=%d diff=%d diffRate=%s',
            stats.total,
            stats.diff,
            stats.diffRate
        )
    }
}

function emitLegacyResponseToPlugins(logData) {
    const startContext = {
        request: {
            method: logData.method,
            url: logData.source,
            headers: {},
            body: '',
        },
        meta: {
            _pluginRequestStartAt: Date.now() - (logData.duration || 0),
            source: 'legacy-bridge',
        },
    }
    const responseContext = {
        request: {
            method: logData.method,
            url: logData.source,
            headers: {},
            body: '',
        },
        response: {
            statusCode: logData.statusCode,
            headers: {},
            body: '',
        },
        meta: {
            _pluginRequestStartAt: Date.now() - (logData.duration || 0),
            source: 'legacy-bridge',
        },
    }
    hookDispatcher.dispatch('onRequestStart', startContext)
        .then(() => hookDispatcher.dispatch('onAfterResponse', responseContext))
        .catch(() => {})
}

function emitLegacyErrorToPlugins(phase, error) {
    const ctx = {
        phase,
        error,
        meta: {
            source: 'legacy-bridge',
        },
    }
    hookDispatcher.dispatch('onError', ctx).catch(() => {})
}

function shouldApplyPipelineOnForSource(source) {
    return pipelineGate.shouldApplyPipelineOnForSource(source)
}

function canUsePipelineExecuteForSource(source) {
    return pipelineGate.canUsePipelineExecuteForSource(source)
}

async function bootstrapBuiltinPlugins() {
    const plugins = createBuiltinPlugins({
        enableMock: ENABLE_BUILTIN_MOCK_PLUGIN,
        enableRouter: ENABLE_BUILTIN_ROUTER_PLUGIN,
        enableLogger: ENABLE_BUILTIN_LOGGER_PLUGIN,
        createMockPlugin: createBuiltinMockPlugin,
        createRouterPlugin: createBuiltinRouterPlugin,
        findMockMatch: (url, method) => matchMockRule(url, method),
        getRuleMap: () => ruleMap,
        loggerPlugin: builtinLoggerPlugin,
    })
    
    // 加载自定义插件
    const customPluginsDir = path.resolve(epDir, 'plugins')
    let customPlugins = []
    try {
        const { loadCustomPlugins } = require('./dist/core/custom-plugin-loader')
        customPlugins = await loadCustomPlugins({
            pluginsDir: customPluginsDir,
            logger: console,
        })
        console.log(chalk.green(`已加载 ${customPlugins.length} 个自定义插件`))
    } catch (error) {
        console.warn(chalk.yellow('加载自定义插件失败:'), error.message)
    }
    
    // 合并内置插件和自定义插件
    const allPlugins = [...plugins, ...customPlugins]
    
    await bootstrapPlugins({
        pluginManager,
        plugins: allPlugins,
        contextFactory: (manifest) => ({
            manifest,
            log: console,
        }),
    })
}

function shouldUsePluginMockForRequest(source, rule) {
    return pipelineGate.shouldUsePluginMockForRequest(source, rule)
}
