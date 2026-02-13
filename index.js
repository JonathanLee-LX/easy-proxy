const http = require('http')
const https = require('https')
const { connect } = require('net')
const fs = require('fs')
const os = require('os')
const path = require('path')

// 必须在加载 cert 模块前创建证书目录（node-easy-cert 在加载时会检查）
const epDir = path.resolve(os.homedir(), '.ep')
const certDir = path.resolve(epDir, 'ca')
if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true })
}

const { crtMgr, ensureRootCA } = require('./cert')
const { WebSocket, WebSocketServer } = require('ws')
const { copyHeaders, resolveTargetUrl, getFreePort, loadConfigFromFile, resolveConfigPath, ruleMapToEprcText, DEFAULT_CONFIG_PATH } = require('./helpers')
const chokidar = require('chokidar')
const chalk = require('chalk')
const { execSync } = require('child_process')
const _debug = require('debug')

const proxyDebug = _debug('proxy')
const log = _debug('log')

// 是否启用启动后自动打开浏览器并设置代理（--open 或 EP_OPEN=1）
const AUTO_OPEN = process.argv.includes('--open') || process.env.EP_OPEN === '1'

let ruleMap = {}
let currentConfig = null // { path, format } 当前生效的配置

const MAX_RECORD_SIZE = process.env.MAX_RECORD_SIZE ? parseInt(process.env.MAX_RECORD_SIZE) : 10000
const MAX_DETAIL_SIZE = 200
const MAX_BODY_SIZE = 100 * 1024 // 100KB
const proxyRecordArr = []
let recordIdSeq = 0
const proxyRecordDetailMap = new Map()

// ===== Mock 功能 =====
const MOCK_FILE = path.join(epDir, 'mocks.json')
let mockRules = [] // [{ id, urlPattern, method, statusCode, headers, body, enabled, name }]
let mockIdSeq = 1

function loadMockRules() {
    try {
        if (fs.existsSync(MOCK_FILE)) {
            const data = JSON.parse(fs.readFileSync(MOCK_FILE, 'utf8'))
            mockRules = Array.isArray(data.rules) ? data.rules : []
            mockIdSeq = (data.nextId || Math.max(0, ...mockRules.map(r => r.id || 0))) + 1
        }
    } catch (err) {
        console.error('加载 mock 规则失败:', err.message)
        mockRules = []
    }
}

function saveMockRules() {
    try {
        fs.writeFileSync(MOCK_FILE, JSON.stringify({ nextId: mockIdSeq, rules: mockRules }, null, 2), 'utf8')
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
    // X-Mock-Rule 值可能含非 ASCII 字符（如中文），需要 encodeURI
    const mockRuleName = rule.name || rule.id.toString()
    const headers = {
        'Content-Type': 'application/json',
        'X-Mock-Rule': encodeURIComponent(mockRuleName),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*',
        ...rule.headers
    }

    // 排空请求体（避免 keep-alive 连接残留数据），同时立即发送响应
    req.on('error', () => {})
    req.resume()
    try {
        res.writeHead(statusCode, headers)
        res.end(rule.body || '')
    } catch (err) {
        console.error('Mock 响应发送失败:', err.message)
        try {
            if (!res.headersSent) res.writeHead(statusCode)
            res.end(rule.body || '')
        } catch (_) {}
    }

    // 记录日志
    const recordId = recordIdSeq++
    const logData = {
        id: recordId,
        method: logInfo.method,
        source: logInfo.source,
        target: `[MOCK: ${rule.name || rule.urlPattern}]`,
        time: new Date().toLocaleTimeString(),
        mock: true
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
        responseHeaders: headers,
        responseBody: rule.body || '',
        statusCode,
        statusMessage: 'OK (Mock)'
    }
    proxyRecordDetailMap.set(recordId, detail)
    if (proxyRecordDetailMap.size > MAX_DETAIL_SIZE) {
        const firstKey = proxyRecordDetailMap.keys().next().value
        proxyRecordDetailMap.delete(firstKey)
    }
}

loadMockRules()

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
 */
function ensureConfigFile() {
    const resolved = resolveConfigPath()
    if (resolved) {
        loadAndWatchConfig(resolved.path, resolved.format)
        proxyDebug('使用项目配置:', resolved.path)
        return
    }

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
                        const { parseEprc } = require('./helpers')
                        const newRuleMap = parseEprc(text)
                        if (currentConfig.format === 'json') {
                            const content = JSON.stringify({ rules: newRuleMap }, null, 2)
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
                res.write(ruleMapToEprcText(ruleMap))
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
                res.write(JSON.stringify(proxyRecordArr))
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
        if (mockRule) {
            return sendMockResponse(req, res, mockRule, { method: req.method, source, target: source })
        }

        const target = resolveTargetUrl(source, ruleMap) || source
        const url = new URL(target.startsWith('http') ? target : req.url, 'http://' + req.headers.host)
        const reqChunks = []
        req.on('data', chunk => reqChunks.push(chunk))
        req.on('end', () => {
            const reqBody = Buffer.concat(reqChunks)
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
                        time: new Date().toLocaleTimeString()
                    }
                    localWSServer.clients.forEach(client => client.send(JSON.stringify(logData)))
                    proxyRecordArr.push(logData)
                    if (proxyRecordArr.length > MAX_RECORD_SIZE) {
                        const removed = proxyRecordArr.shift()
                        if (removed.id !== undefined) proxyRecordDetailMap.delete(removed.id)
                    }
                    const safeStr = (buf, max) => {
                        if (buf.length === 0) return ''
                        if (buf.length > max) return `(truncated, ${buf.length} bytes)\n` + buf.slice(0, max).toString('utf8')
                        try { return buf.toString('utf8') } catch { return '(binary)' }
                    }
                    const detail = {
                        requestHeaders: req.headers,
                        requestBody: safeStr(reqBody, MAX_BODY_SIZE),
                        responseHeaders: proxyRes.headers,
                        responseBody: safeStr(resBody, MAX_BODY_SIZE),
                        statusCode: proxyRes.statusCode,
                        statusMessage: proxyRes.statusMessage
                    }
                    proxyRecordDetailMap.set(recordId, detail)
                    if (proxyRecordDetailMap.size > MAX_DETAIL_SIZE) {
                        const firstKey = proxyRecordDetailMap.keys().next().value
                        proxyRecordDetailMap.delete(firstKey)
                    }
                })
            })
            proxyReq.on('error', (err) => {
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
    const port = await getFreePort()
    proxyServer.listen(port, () => {
        const proxyUrl = `http://127.0.0.1:${port}`
        proxyDebug('proxy-server start on ' + chalk.green(proxyUrl))
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
proxyServer.on('connect', async (req, socket, header) => {
    const originHost = req.url.split(':')[0]
    proxyDebug('received connect request....')
    // Send success response header
    socket.write('HTTP/1.1 200 Connection Established\r\n' +
        'Proxy-Agent: Node.js-Proxy\r\n' +
        '\r\n');
    socket.on('end', () => {
        // proxyDebug('end')
    })

    socket.on('error', (err) => {
        console.error(err)
    })

    function createHttpsServerByCert() {
        return new Promise((resolve, reject) => {
            crtMgr.getCertificate(originHost, (error, key, crt) => {
                if (error) return reject(error)
                const server = https.createServer({ cert: crt, key }, (req, res) => {
                    const source = 'https://' + req.headers.host + req.url

                    // 检查 mock 规则
                    const mockRule = matchMockRule(source, req.method)
                    if (mockRule) {
                        return sendMockResponse(req, res, mockRule, { method: req.method, source, target: source })
                    }

                    // resolve targetUrl by against ruleMap
                    // 1. if targetUrl is ip address 127.0.0.1. Reuse current protocol
                    // 2. If targetURL is start with protocol url http://127.0.0.1
                    let target = resolveTargetUrl(source, ruleMap)
                    if(!target) {
                        target = source
                    }

                    const request = target.startsWith('https') ? https.request : http.request;
                    const reqChunks = []

                    req.on('data', chunk => reqChunks.push(chunk))
                    req.on('end', () => {
                        const reqBody = Buffer.concat(reqChunks)
                        const proxyReq = request(target, {
                            method: req.method,
                            rejectUnauthorized: false,
                            headers: req.headers
                        }, (proxyRes) => {
                            const resChunks = []
                            res.writeHead(proxyRes.statusCode, proxyRes.statusMessage, proxyRes.headers)

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
                                    target,
                                    time: new Date().toLocaleTimeString()
                                }
                                localWSServer.clients.forEach(client => client.send(JSON.stringify(logData)))
                                proxyRecordArr.push(logData)
                                if (proxyRecordArr.length > MAX_RECORD_SIZE) {
                                    const removed = proxyRecordArr.shift()
                                    if (removed.id !== undefined) proxyRecordDetailMap.delete(removed.id)
                                }
                                const safeStr = (buf, max) => {
                                    if (buf.length === 0) return ''
                                    if (buf.length > max) return `(truncated, ${buf.length} bytes)\n` + buf.slice(0, max).toString('utf8')
                                    try { return buf.toString('utf8') } catch { return '(binary)' }
                                }
                                const detail = {
                                    requestHeaders: req.headers,
                                    requestBody: safeStr(reqBody, MAX_BODY_SIZE),
                                    responseHeaders: proxyRes.headers,
                                    responseBody: safeStr(resBody, MAX_BODY_SIZE),
                                    statusCode: proxyRes.statusCode,
                                    statusMessage: proxyRes.statusMessage
                                }
                                proxyRecordDetailMap.set(recordId, detail)
                                if (proxyRecordDetailMap.size > MAX_DETAIL_SIZE) {
                                    const ids = Array.from(proxyRecordDetailMap.keys()).sort((a, b) => a - b)
                                    proxyRecordDetailMap.delete(ids[0])
                                }
                                console.table(logData)
                            })
                        })

                        proxyReq.write(reqBody)
                        proxyReq.end()

                        proxyReq.on('error', (error) => {
                            console.error('[error debug]', originHost + req.url, error)
                            res.statusCode = 500
                            plugins.forEach(plugin => plugin.beforeSendResponse(res))
                            res.write(JSON.stringify(error))
                            res.end()
                        })
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
    const ruleArr = Object.entries(ruleMap).reduce((arr, [r, t]) => {
        arr.push({
            rule: r,
            target: t
        })
        return arr
    }, [])
    console.table(ruleArr)
}
