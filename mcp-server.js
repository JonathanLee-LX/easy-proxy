#!/usr/bin/env node
/**
 * MCP Server for easy-proxy
 * 提供 start_proxy 与路由规则管理工具
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
// MCP SDK zod-compat 仅支持 zod/v3 或 zod/v4-mini 的内部结构，使用默认 zod 会报 _zod undefined
const z = require('zod/v3')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')

const epDir = path.resolve(os.homedir(), '.ep')
const mcpFile = path.join(epDir, 'mcp-proxy-url.json')
const DEFAULT_PROXY_BASE = 'http://127.0.0.1:9001'

let proxyProcess = null
let cachedProxyUrl = null

/** 获取代理 API 根地址（用于调用规则等接口） */
function getProxyBaseUrl() {
    if (cachedProxyUrl) return cachedProxyUrl
    try {
        if (fs.existsSync(mcpFile)) {
            const data = JSON.parse(fs.readFileSync(mcpFile, 'utf8'))
            if (data.proxyUrl) return data.proxyUrl
        }
    } catch (_) {}
    return DEFAULT_PROXY_BASE
}

const IP_PATTERN = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/
const URL_PATTERN = /^https?:\/\//
const FILE_PATTERN = /^file:\/\//
const LOCAL_FILE_PATTERN = /^[A-Za-z]:\\|^\/|^\\/

/** 解析规则文件内容为 pattern -> target 对象（与 helpers.parseEprc 一致） */
function parseEprc(content) {
    const acc = Object.create(null)
    content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return
        const parts = trimmed.split(/\s+/).filter(Boolean)
        if (parts.length < 2) return
        let target
        let rules
        if (FILE_PATTERN.test(parts[0]) || LOCAL_FILE_PATTERN.test(parts[0])) {
            target = parts[0]
            rules = parts.slice(1)
            if (!FILE_PATTERN.test(target) && LOCAL_FILE_PATTERN.test(target)) {
                target = 'file://' + target.replace(/\\/g, '/')
            }
        } else if (IP_PATTERN.test(parts[0]) || URL_PATTERN.test(parts[0])) {
            target = parts[0]
            rules = parts.slice(1)
        } else {
            const reversed = [...parts].reverse()
            target = reversed[0]
            rules = reversed.slice(1)
            if (LOCAL_FILE_PATTERN.test(target)) {
                target = 'file://' + target.replace(/\\/g, '/')
            }
        }
        rules.forEach((rule) => { acc[rule] = target })
    })
    return acc
}

/** 将 pattern -> target 对象转回规则文件文本（与 helpers.ruleMapToEprcText 一致） */
function ruleMapToEprcText(ruleMap) {
    const entries = Object.entries(ruleMap)
    if (entries.length === 0) return ''
    const byTarget = {}
    entries.forEach(([rule, target]) => {
        if (!byTarget[target]) byTarget[target] = []
        byTarget[target].push(rule)
    })
    return Object.entries(byTarget)
        .map(([target, rules]) => {
            const targetFirst = IP_PATTERN.test(target) || URL_PATTERN.test(target) || FILE_PATTERN.test(target)
            let displayTarget = target
            if (FILE_PATTERN.test(target)) {
                displayTarget = target.replace(/^file:\/\//, '').replace(/\//g, path.sep)
            }
            return targetFirst ? `${displayTarget} ${rules.join(' ')}` : `${rules.join(' ')} ${displayTarget}`
        })
        .join('\n')
}

/** 请求代理 API */
function proxyApi(method, pathname, body) {
    const base = getProxyBaseUrl()
    const url = base.replace(/\/$/, '') + pathname
    const opts = { method, headers: { 'Content-Type': 'application/json' } }
    if (body !== undefined) opts.body = typeof body === 'string' ? body : JSON.stringify(body)
    return fetch(url, opts).then((res) => {
        const text = () => res.text()
        if (!res.ok) return text().then((t) => { throw new Error(t || res.statusText) })
        return res.headers.get('content-type')?.includes('application/json') ? res.json() : text()
    })
}

function waitForProxyUrl(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const start = Date.now()
        const interval = 50
        const check = () => {
            try {
                if (fs.existsSync(mcpFile)) {
                    const data = JSON.parse(fs.readFileSync(mcpFile, 'utf8'))
                    if (data.proxyUrl) {
                        return resolve(data.proxyUrl)
                    }
                }
            } catch (_) {}
            if (Date.now() - start > timeoutMs) {
                return reject(new Error('等待代理启动超时'))
            }
            setTimeout(check, interval)
        }
        check()
    })
}

const mcpServer = new McpServer({
    name: 'easy-proxy',
    version: '1.0.0'
})

mcpServer.registerTool('start_proxy', {
    description: '启动 easy-proxy 代理服务器，返回代理地址。env 可指定配置（如 beta）。',
    inputSchema: {
        env: z.string().optional().describe('环境名，如 beta、eprc.beta，对应 .epconfig/.{env} 配置文件')
    }
}, async ({ env }) => {
    if (proxyProcess && proxyProcess.exitCode === null) {
        return {
            content: [{ type: 'text', text: `代理已在运行: ${cachedProxyUrl}` }]
        }
    }
    proxyProcess = null
    cachedProxyUrl = null
    const indexPath = path.join(__dirname, 'index.js')
    const spawnEnv = { ...process.env, EP_MCP: '1', DEBUG: process.env.DEBUG || '' }
    if (env) spawnEnv.EP_ENV = env
    const child = spawn(process.execPath, [indexPath], {
        env: spawnEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd()
    })
    proxyProcess = child
    child.stdout?.on('data', (d) => process.stderr.write(d))
    child.stderr?.on('data', (d) => process.stderr.write(d))
    child.on('error', (err) => {
        proxyProcess = null
        console.error('启动代理失败:', err)
    })
    child.on('exit', (code) => {
        proxyProcess = null
        cachedProxyUrl = null
    })
    try {
        cachedProxyUrl = await waitForProxyUrl()
        return {
            content: [{ type: 'text', text: cachedProxyUrl }]
        }
    } catch (err) {
        proxyProcess = null
        child.kill()
        return {
            content: [{ type: 'text', text: `启动失败: ${err.message}` }],
            isError: true
        }
    }
})

mcpServer.registerTool('get_proxy_url', {
    description: '获取当前代理服务器 URL（用于配置系统代理或调用代理 API）。来源：本会话通过 start_proxy 启动的地址、~/.ep/mcp-proxy-url.json，或默认 http://127.0.0.1:9001。',
    inputSchema: {}
}, async () => {
    const url = getProxyBaseUrl()
    return { content: [{ type: 'text', text: url }] }
})

// ---------- Mock 规则（需代理已启动） ----------

mcpServer.registerTool('mock_rule_list', {
    description: '列出所有 Mock 规则。返回 id、name、urlPattern、method、statusCode、enabled 等。',
    inputSchema: {}
}, async () => {
    try {
        const rules = await proxyApi('GET', '/api/mocks')
        return { content: [{ type: 'text', text: JSON.stringify(rules, null, 2) }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('mock_rule_add', {
    description: '添加一条 Mock 规则。匹配到的请求将返回指定状态码、响应头和响应体。',
    inputSchema: {
        name: z.string().describe('规则名称，便于识别'),
        urlPattern: z.string().describe('URL 匹配正则或字符串，如 example\\.com/api 或 .*\\.example\\.com'),
        method: z.string().optional().describe('HTTP 方法，如 GET、POST、* 表示全部，默认 *'),
        statusCode: z.number().optional().describe('响应状态码，默认 200'),
        headers: z.record(z.string()).optional().describe('响应头，如 {"content-type":"application/json"}'),
        body: z.string().optional().describe('响应体内容，默认空'),
        bodyType: z.string().optional().describe('body 类型，如 inline，默认 inline'),
        delay: z.number().optional().describe('延迟毫秒数，默认 0'),
        enabled: z.boolean().optional().describe('是否启用，默认 true')
    }
}, async (params) => {
    try {
        const body = {
            name: params.name ?? '',
            urlPattern: params.urlPattern ?? '',
            method: params.method ?? '*',
            statusCode: params.statusCode ?? 200,
            delay: params.delay ?? 0,
            bodyType: params.bodyType ?? 'inline',
            headers: params.headers ?? {},
            body: params.body ?? '',
            enabled: params.enabled !== false
        }
        const result = await proxyApi('POST', '/api/mocks', body)
        const rule = result.rule || result
        return {
            content: [{ type: 'text', text: `已添加 Mock 规则 id=${rule.id}: ${rule.name} (${rule.urlPattern})` }]
        }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('mock_rule_update', {
    description: '按 id 更新一条 Mock 规则，只传需要修改的字段。',
    inputSchema: {
        id: z.number().describe('规则 id，从 mock_rule_list 获取'),
        name: z.string().optional(),
        urlPattern: z.string().optional(),
        method: z.string().optional(),
        statusCode: z.number().optional(),
        headers: z.record(z.string()).optional(),
        body: z.string().optional(),
        bodyType: z.string().optional(),
        delay: z.number().optional(),
        enabled: z.boolean().optional()
    }
}, async (params) => {
    try {
        const id = params.id
        const updates = { ...params }
        delete updates.id
        if (Object.keys(updates).length === 0) {
            return { content: [{ type: 'text', text: '未提供要更新的字段' }], isError: true }
        }
        const result = await proxyApi('PUT', `/api/mocks/${id}`, updates)
        const rule = result.rule || result
        return {
            content: [{ type: 'text', text: `已更新 Mock 规则 id=${id}: ${rule.name ?? '(未改)'}` }]
        }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('mock_rule_delete', {
    description: '按 id 删除一条 Mock 规则。',
    inputSchema: {
        id: z.number().describe('规则 id，从 mock_rule_list 获取')
    }
}, async ({ id }) => {
    try {
        await proxyApi('DELETE', `/api/mocks/${id}`)
        return { content: [{ type: 'text', text: `已删除 Mock 规则 id=${id}` }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

// ---------- 路由规则（需代理已启动，API 地址来自 start_proxy 或 ~/.ep/mcp-proxy-url.json） ----------

mcpServer.registerTool('route_rule_list', {
    description: '列出所有路由规则文件；可选指定 ruleFile 获取该文件下的规则列表（pattern -> target）',
    inputSchema: {
        ruleFile: z.string().optional().describe('规则文件名（不含 .txt），不传则只返回文件列表')
    }
}, async ({ ruleFile }) => {
    try {
        const files = await proxyApi('GET', '/api/rule-files')
        if (!ruleFile) {
            return { content: [{ type: 'text', text: JSON.stringify(files, null, 2) }] }
        }
        const name = encodeURIComponent(ruleFile.trim())
        const content = await proxyApi('GET', `/api/rule-files/${name}/content`)
        const ruleMap = parseEprc(typeof content === 'string' ? content : String(content))
        return {
            content: [{ type: 'text', text: JSON.stringify({ ruleFile, rules: ruleMap, count: Object.keys(ruleMap).length }, null, 2) }]
        }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('route_rule_create_file', {
    description: '创建新的路由规则文件（多套规则中的一套）。文件名不含 .txt，创建后可启用并往该文件中添加规则。',
    inputSchema: {
        name: z.string().describe('规则文件名称（不含 .txt），如 dev、staging；非法字符会被替换为下划线'),
        content: z.string().optional().describe('初始规则内容，每行一条「pattern target」或「target pattern1 pattern2」，不传则为空文件'),
        enabled: z.boolean().optional().describe('是否加入当前启用的规则集，默认 true')
    }
}, async ({ name, content = '', enabled = true }) => {
    try {
        const body = { name: name.trim(), content: content.trim(), enabled }
        const result = await proxyApi('POST', '/api/rule-files', body)
        const rf = result.ruleFile || result
        return {
            content: [{
                type: 'text',
                text: `已创建规则文件: ${rf.name}（启用: ${rf.enabled}，规则数: ${rf.ruleCount ?? 0}）`
            }]
        }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('route_rule_add', {
    description: '在指定规则文件中添加一条路由规则（pattern -> target）。若 pattern 已存在则覆盖。',
    inputSchema: {
        ruleFile: z.string().describe('规则文件名（不含 .txt）'),
        pattern: z.string().describe('匹配请求 URL 的正则或主机名，如 example.com 或 .*\\.example\\.com'),
        target: z.string().describe('转发目标，如 http://localhost:3000 或 127.0.0.1:8080')
    }
}, async ({ ruleFile, pattern, target }) => {
    try {
        const name = encodeURIComponent(ruleFile.trim())
        let content
        try {
            content = await proxyApi('GET', `/api/rule-files/${name}/content`)
        } catch (err) {
            return { content: [{ type: 'text', text: `规则文件不存在或代理未启动: ${err.message}` }], isError: true }
        }
        const text = typeof content === 'string' ? content : String(content)
        const ruleMap = parseEprc(text)
        ruleMap[pattern.trim()] = target.trim()
        const newContent = ruleMapToEprcText(ruleMap)
        await proxyApi('PUT', `/api/rule-files/${name}/content`, { content: newContent })
        return { content: [{ type: 'text', text: `已添加规则: ${pattern} -> ${target}` }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('route_rule_update', {
    description: '修改指定规则文件中某条规则的 target（按 pattern 查找）',
    inputSchema: {
        ruleFile: z.string().describe('规则文件名（不含 .txt）'),
        pattern: z.string().describe('要修改的 pattern（需与现有规则完全一致）'),
        newTarget: z.string().describe('新的转发目标')
    }
}, async ({ ruleFile, pattern, newTarget }) => {
    try {
        const name = encodeURIComponent(ruleFile.trim())
        const pat = pattern.trim()
        let content
        try {
            content = await proxyApi('GET', `/api/rule-files/${name}/content`)
        } catch (err) {
            return { content: [{ type: 'text', text: `规则文件不存在或代理未启动: ${err.message}` }], isError: true }
        }
        const text = typeof content === 'string' ? content : String(content)
        const ruleMap = parseEprc(text)
        if (!Object.prototype.hasOwnProperty.call(ruleMap, pat)) {
            return { content: [{ type: 'text', text: `未找到 pattern: ${pat}` }], isError: true }
        }
        ruleMap[pat] = newTarget.trim()
        const newContent = ruleMapToEprcText(ruleMap)
        await proxyApi('PUT', `/api/rule-files/${name}/content`, { content: newContent })
        return { content: [{ type: 'text', text: `已更新规则: ${pat} -> ${newTarget}` }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('route_rule_delete', {
    description: '从指定规则文件中删除一条路由规则（按 pattern）',
    inputSchema: {
        ruleFile: z.string().describe('规则文件名（不含 .txt）'),
        pattern: z.string().describe('要删除的 pattern（需与现有规则完全一致）')
    }
}, async ({ ruleFile, pattern }) => {
    try {
        const name = encodeURIComponent(ruleFile.trim())
        const pat = pattern.trim()
        let content
        try {
            content = await proxyApi('GET', `/api/rule-files/${name}/content`)
        } catch (err) {
            return { content: [{ type: 'text', text: `规则文件不存在或代理未启动: ${err.message}` }], isError: true }
        }
        const text = typeof content === 'string' ? content : String(content)
        const ruleMap = parseEprc(text)
        if (!Object.prototype.hasOwnProperty.call(ruleMap, pat)) {
            return { content: [{ type: 'text', text: `未找到 pattern: ${pat}` }], isError: true }
        }
        delete ruleMap[pat]
        const newContent = ruleMapToEprcText(ruleMap)
        await proxyApi('PUT', `/api/rule-files/${name}/content`, { content: newContent })
        return { content: [{ type: 'text', text: `已删除规则: ${pat}` }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

async function main() {
    const transport = new StdioServerTransport()
    await mcpServer.connect(transport)
}

main().catch((err) => {
    console.error('MCP Server error:', err)
    process.exit(1)
})
