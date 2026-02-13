/**
 * 浏览器控制模块 - 连接 easy-proxy 启动的 Chrome，提供 CDP 操作
 */
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')
const os = require('os')

const epDir = path.resolve(os.homedir(), '.ep')
const mcpFile = path.join(epDir, 'mcp-proxy-url.json')
const REMOTE_PORT = 9222

let browser = null
let selectedPageIndex = 0
let lastRefMap = {}

function getBrowserUrl() {
    try {
        if (fs.existsSync(mcpFile)) {
            const data = JSON.parse(fs.readFileSync(mcpFile, 'utf8'))
            if (data.remoteDebuggingPort) {
                return `http://127.0.0.1:${data.remoteDebuggingPort}`
            }
        }
    } catch (_) {}
    return `http://127.0.0.1:${REMOTE_PORT}`
}

async function ensureBrowser() {
    if (browser && browser.connected) return browser
    const url = getBrowserUrl()
    try {
        browser = await puppeteer.connect({ browserURL: url })
        return browser
    } catch (e) {
        throw new Error(`无法连接浏览器，请先通过 start_proxy(openBrowser:"chrome-devtools") 启动: ${e.message}`)
    }
}

function buildAxSnapshot(node, refMap = {}, counter = { n: 0 }) {
    if (!node) return ''
    const ref = `e${++counter.n}`
    const role = node.role || 'unknown'
    const name = node.name ? ` "${node.name}"` : ''
    const value = node.value ? ` [value]` : ''
    refMap[ref] = { role, name: node.name, value: node.value, index: counter.n }
    let line = `${ref}: ${role}${name}${value}`
    const children = node.children || []
    const childLines = children.map(c => buildAxSnapshot(c, refMap, counter)).filter(Boolean)
    return [line, ...childLines].join('\n')
}

async function clickByRoleName(page, role, name, index) {
    return page.evaluate(({ r, n, idx }) => {
        const candidates = Array.from(document.querySelectorAll(`[role="${r}"], button, a, input[type="submit"], input[type="button"]`))
            .filter(e => !n || (e.textContent?.trim() || e.getAttribute('aria-label') || e.value || '').includes(n))
        const el = candidates[idx] || candidates[0]
        if (el) { el.scrollIntoView(); el.click() }
        else throw new Error(`未找到 role=${r} name=${n} 的元素`)
    }, { r: role, n: name, idx: (index || 1) - 1 })
}

async function getPage() {
    const b = await ensureBrowser()
    const allPages = await b.pages()
    if (allPages.length === 0) throw new Error('浏览器中无页面')
    if (selectedPageIndex >= allPages.length) selectedPageIndex = 0
    return allPages[selectedPageIndex]
}

module.exports = {
    async listPages() {
        const b = await ensureBrowser()
        const allPages = await b.pages()
        return Promise.all(allPages.map(async (p, i) => ({
            id: i,
            url: p.url(),
            title: await p.title().catch(() => ''),
            selected: i === selectedPageIndex
        })))
    },

    async selectPage(pageId) {
        const b = await ensureBrowser()
        const allPages = await b.pages()
        if (pageId < 0 || pageId >= allPages.length) {
            throw new Error(`无效的 pageId: ${pageId}，可用范围 0-${allPages.length - 1}`)
        }
        selectedPageIndex = pageId
        return { selected: pageId }
    },

    async navigate(url, opts = {}) {
        const page = await getPage()
        await page.goto(url, { timeout: opts.timeout || 30000, waitUntil: 'domcontentloaded' })
        return { url: page.url(), title: await page.title() }
    },

    async newPage(url = 'about:blank', opts = {}) {
        const b = await ensureBrowser()
        const page = await b.newPage()
        if (url && url !== 'about:blank') {
            await page.goto(url, { timeout: opts.timeout || 30000 })
        }
        const allPages = await b.pages()
        selectedPageIndex = allPages.indexOf(page)
        return { pageId: selectedPageIndex, url: page.url() }
    },

    async setViewport(width, height) {
        const page = await getPage()
        await page.setViewport({ width, height })
        return { width, height }
    },

    async takeScreenshot(opts = {}) {
        const page = await getPage()
        if (opts.width && opts.height) {
            await page.setViewport({ width: opts.width, height: opts.height })
        }
        const buf = await page.screenshot({
            type: opts.format || 'png',
            fullPage: opts.fullPage || false,
            quality: opts.quality
        })
        if (opts.filePath) {
            fs.writeFileSync(opts.filePath, buf)
            return { saved: opts.filePath }
        }
        return { image: buf.toString('base64'), format: opts.format || 'png' }
    },

    async takeSnapshot(opts = {}) {
        const page = await getPage()
        const snapshot = await page.accessibility.snapshot({ interestingOnly: !opts.verbose })
        lastRefMap = {}
        const text = buildAxSnapshot(snapshot, lastRefMap)
        return { snapshot: text, refMap: lastRefMap }
    },

    async click(ref) {
        const page = await getPage()
        const info = lastRefMap[ref]
        if (info?.role) {
            await clickByRoleName(page, info.role, info.name, info.index)
        } else {
            await page.click(ref)
        }
        return { clicked: ref }
    },

    async fill(ref, value) {
        const page = await getPage()
        const info = lastRefMap[ref]
        if (info?.role) {
            await page.evaluate(({ r, n, idx }) => {
                const candidates = Array.from(document.querySelectorAll(`[role="${r}"], input, textarea, [contenteditable]`))
                    .filter(e => !n || (e.placeholder || e.getAttribute('aria-label') || '').includes(n))
                const el = candidates[idx] || candidates[0]
                if (el) { el.focus(); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })) }
            }, { r: info.role, n: info.name, idx: (info.index || 1) - 1 })
        } else {
            await page.click(ref)
        }
        await page.keyboard.type(value, { delay: 0 })
        return { filled: ref }
    },

    async evaluate(fn, args = []) {
        const page = await getPage()
        const result = await page.evaluate(new Function(`return (${fn})(...arguments)`), ...args)
        return { result }
    }
}
