#!/usr/bin/env node
/**
 * MCP Server for easy-proxy
 * 提供 start_proxy 工具及浏览器控制工具（需先通过 start_proxy openBrowser:chrome-devtools 启动）
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const z = require('zod')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')
const browser = require('./mcp-browser')

const epDir = path.resolve(os.homedir(), '.ep')
const mcpFile = path.join(epDir, 'mcp-proxy-url.json')

let proxyProcess = null
let cachedProxyUrl = null

function updateChromeDevToolsConfig(proxyUrl, remoteDebuggingPort = 9222) {
    try {
        const mcpPath = path.join(os.homedir(), '.cursor', 'mcp.json')
        if (!fs.existsSync(mcpPath)) {
            return `代理已启动: ${proxyUrl}\n浏览器已开启远程调试端口 ${remoteDebuggingPort}。未找到 ~/.cursor/mcp.json，请手动添加 chrome-devtools --browserUrl=http://127.0.0.1:${remoteDebuggingPort}`
        }
        const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'))
        const cd = mcp.mcpServers?.['chrome-devtools']
        if (!cd || !Array.isArray(cd.args)) {
            return `代理已启动: ${proxyUrl}\n未找到 chrome-devtools 配置，请手动添加 --browserUrl=http://127.0.0.1:${remoteDebuggingPort}`
        }
        const browserUrl = `http://127.0.0.1:${remoteDebuggingPort}`
        const newArgs = cd.args
            .filter(a => !a.includes('--proxy-server=') && !a.includes('--proxyServer=') && !a.includes('--wsEndpoint=') && !a.includes('--browserUrl='))
            .concat(`--browserUrl=${browserUrl}`)
        cd.args = newArgs
        fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2), 'utf8')
        return `代理已启动: ${proxyUrl}\n已启动带代理的浏览器（远程调试端口 ${remoteDebuggingPort}），并更新 chrome-devtools 配置为连接该浏览器。请重启 Cursor 或重新加载 MCP 后即可通过 chrome-devtools 控制此浏览器。`
    } catch (e) {
        return `代理已启动: ${proxyUrl}\n更新配置失败: ${e.message}，请手动设置 chrome-devtools --browserUrl=http://127.0.0.1:${remoteDebuggingPort}`
    }
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
    description: '启动 easy-proxy 代理服务器，返回代理地址。env 指定配置（如 beta）；openBrowser: true 启动浏览器；openBrowser: "chrome-devtools" 启动带代理的浏览器并配置 chrome-devtools 连接，支持浏览器控制。',
    inputSchema: {
        env: z.string().optional().describe('环境名，如 beta、eprc.beta，对应 .epconfig/.{env} 配置文件'),
        openBrowser: z.union([z.boolean(), z.literal('chrome-devtools')]).optional().describe('true=启动浏览器；chrome-devtools=更新 Cursor chrome-devtools MCP 配置')
    }
}, async ({ env, openBrowser }) => {
    if (proxyProcess && proxyProcess.exitCode === null) {
        if (openBrowser === 'chrome-devtools') {
            const msg = updateChromeDevToolsConfig(cachedProxyUrl)
            return { content: [{ type: 'text', text: msg }] }
        }
        return {
            content: [{ type: 'text', text: `代理已在运行: ${cachedProxyUrl}` }]
        }
    }
    proxyProcess = null
    cachedProxyUrl = null
    const indexPath = path.join(__dirname, 'index.js')
    const spawnEnv = { ...process.env, EP_MCP: '1', DEBUG: process.env.DEBUG || '' }
    if (env) spawnEnv.EP_ENV = env
    if (openBrowser === true) spawnEnv.EP_OPEN = '1'
    if (openBrowser === 'chrome-devtools') spawnEnv.EP_OPEN = '1'
    if (openBrowser === 'chrome-devtools') spawnEnv.EP_OPEN_CHROMEDEVTOOLS = '1'
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
        if (openBrowser === 'chrome-devtools') {
            const msg = updateChromeDevToolsConfig(cachedProxyUrl)
            return {
                content: [{ type: 'text', text: `${cachedProxyUrl}\n\n${msg}` }]
            }
        }
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

mcpServer.registerTool('browser_list_pages', {
    description: '列出浏览器中打开的页面。需先通过 start_proxy(openBrowser:"chrome-devtools") 启动带代理的浏览器。',
    inputSchema: {}
}, async () => {
    try {
        const pages = await browser.listPages()
        return { content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('browser_navigate', {
    description: '在当前页面导航到指定 URL',
    inputSchema: {
        url: z.string().describe('目标 URL'),
        timeout: z.number().optional().describe('超时毫秒数')
    }
}, async ({ url, timeout }) => {
    try {
        const r = await browser.navigate(url, { timeout })
        return { content: [{ type: 'text', text: `已导航: ${r.url}` }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('browser_new_page', {
    description: '新建页面并打开 URL',
    inputSchema: {
        url: z.string().optional().describe('URL，默认 about:blank'),
        timeout: z.number().optional()
    }
}, async ({ url, timeout }) => {
    try {
        const r = await browser.newPage(url || 'about:blank', { timeout })
        return { content: [{ type: 'text', text: `新页面 pageId=${r.pageId}: ${r.url}` }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('browser_select_page', {
    description: '切换当前操作的页面',
    inputSchema: { pageId: z.number().describe('页面 ID，从 browser_list_pages 获取') }
}, async ({ pageId }) => {
    try {
        await browser.selectPage(pageId)
        return { content: [{ type: 'text', text: `已切换到页面 ${pageId}` }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('browser_snapshot', {
    description: '获取当前页面的可访问性树快照，包含元素 ref（用于 click/fill）。先调用此方法再操作元素。',
    inputSchema: { verbose: z.boolean().optional().describe('是否包含完整树') }
}, async ({ verbose }) => {
    try {
        const r = await browser.takeSnapshot({ verbose })
        return { content: [{ type: 'text', text: r.snapshot }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('browser_screenshot', {
    description: '截取当前页面截图',
    inputSchema: {
        filePath: z.string().optional().describe('保存路径'),
        fullPage: z.boolean().optional(),
        format: z.enum(['png', 'jpeg', 'webp']).optional()
    }
}, async ({ filePath, fullPage, format }) => {
    try {
        const r = await browser.takeScreenshot({ filePath, fullPage, format })
        if (r.saved) {
            return { content: [{ type: 'text', text: `已保存: ${r.saved}` }] }
        }
        return { content: [{ type: 'text', text: `data:image/${r.format};base64,${r.image}` }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('browser_click', {
    description: '点击元素。需先调用 browser_snapshot 获取 ref（如 e1, e2）',
    inputSchema: { ref: z.string().describe('元素 ref，如 e1') }
}, async ({ ref }) => {
    try {
        await browser.click(ref)
        return { content: [{ type: 'text', text: `已点击 ${ref}` }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('browser_fill', {
    description: '在输入框中填入文本。需先调用 browser_snapshot 获取 ref',
    inputSchema: {
        ref: z.string().describe('元素 ref'),
        value: z.string().describe('要填入的文本')
    }
}, async ({ ref, value }) => {
    try {
        await browser.fill(ref, value)
        return { content: [{ type: 'text', text: `已填入 ${ref}` }] }
    } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
    }
})

mcpServer.registerTool('browser_evaluate', {
    description: '在当前页面执行 JavaScript',
    inputSchema: {
        function: z.string().describe('函数体，如 () => document.title'),
        args: z.array(z.any()).optional()
    }
}, async ({ function: fn, args }) => {
    try {
        const r = await browser.evaluate(fn, args || [])
        return { content: [{ type: 'text', text: JSON.stringify(r.result) }] }
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
