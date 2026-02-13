const { getPortPromise, setBasePort, setHighestPort } = require("portfinder");
const os = require('os')
const path = require('path')
const { readFileSync, existsSync } = require('fs')


/**
 * 复制一个请求对象的headers到另外一个请求对象
 * @param {http.IncomingMessage} sourceReq
 * @param {http.ClientRequest} targetReq
 * @returns {http.ClientRequest}
 */
function copyHeaders(sourceReq, targetReq) {
    for (const name in sourceReq.headers) {
        if (Object.hasOwnProperty.call(sourceReq.headers, name)) {
            if (name === 'origin') continue
            const value = sourceReq.headers[name];
            targetReq.setHeader(name, value)
        }
    }
    return targetReq
}

/**
*
* @param {string} url
* @param {{[K: string]: string}} ruleMap
* @returns {string | null}
*/
// rule                             target                      result
// https://example.com              127.0.0.1                  https://127.0.0.1/
// https://example.com?foo=bar      127.0.0.1                  https://127.0.0.1/?foo=bar
// https://a.com                    127.0.0.1:8082             https://127.0.0.1:8082
// https://a.com                    127.0.0.1:8082/a           https://127.0.0.1:8082/a
// https://a.com/a                  127.0.0.1:8082/b           https://127.0.0.1:8082/b
// https://a.com/a                  http://127.0.0.1:8082/b     http://127.0.0.1:8082/b
// https://a.com:1234/a             http://127.0.0.1:8082/b     http://127.0.0.1:8082/b
// https://a.com:1234/a             http://127.0.0.1/b          http://127.0.0.1:1234/b
function resolveTargetUrl(url, ruleMap) {
    const originUrlObj = new URL(url)
    const tK = Object.keys(ruleMap).find(pattern => new RegExp(pattern).test(url))
    if (!tK) return null
    let urlSegment = ruleMap[tK];
    if(!urlSegment.startsWith('http') && !urlSegment.startsWith('ws')) {
        urlSegment = originUrlObj.protocol + urlSegment
    }

    const targetURLObj = new URL(urlSegment)

    if(!targetURLObj.port && originUrlObj.port) {
        targetURLObj.port = originUrlObj.port
    }

    if(targetURLObj.pathname === '/' && originUrlObj.pathname !== '/') {
        targetURLObj.pathname = originUrlObj.pathname
    }

    if(targetURLObj.search === '' && originUrlObj.search) {
        targetURLObj.search = originUrlObj.search
    }

    // WebSocket 需要 ws/wss 协议，若 origin 是 wss/ws 且 target 是 https/http，则转换
    const originIsWs = /^wss?:\/\//.test(url)
    const targetIsHttp = /^https?:\/\//.test(targetURLObj.toString())
    if (originIsWs && targetIsHttp) {
        targetURLObj.protocol = originUrlObj.protocol
    }

    return targetURLObj.toString()
}

const BASE_PORT = 8989

async function getFreePort() {
    // find a free port
    setBasePort(BASE_PORT);
    setHighestPort(9999);
    return getPortPromise();
}

const CONFIG_DIR = '.epconfig'
const DEFAULT_CONFIG_PATH = path.resolve(os.homedir(), '.ep', '.eprc')

/**
 * 获取 .epconfig 目录下的配置文件候选（按扩展名优先级：.json > .js > 无扩展名即 .eprc）
 * 命名格式: .[env].[json|js]? 或 .[env]
 */
function getConfigCandidates(configDir, env) {
    const prefix = path.join(configDir, `.${env}`)
    return [
        { path: prefix + '.json', format: 'json' },
        { path: prefix + '.js', format: 'js' },
        { path: prefix, format: 'eprc' }
    ]
}

const IP_PATTERN = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/
const URL_PATTERN = /^https?:\/\//

/**
 * 解析 .eprc 格式，支持三种写法：
 * 1. hosts 格式：IP domain1 domain2（target 在前）
 * 2. URL 格式：https://localhost:8000 rule1 rule2（完整 URL 在前）
 * 3. 规则格式：rule target 或 rule1 rule2 target（target 在行末）
 * 注释：以 # 或 // 开头
 */
function parseEprc(content) {
    return content.split(/\r?\n/).reduce((acc, line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return acc
        const parts = trimmed.split(/\s+/).filter(Boolean)
        if (parts.length < 2) return acc
        let target, rules
        if (IP_PATTERN.test(parts[0]) || URL_PATTERN.test(parts[0])) {
            [target, ...rules] = parts
        } else {
            const reversed = [...parts].reverse()
            target = reversed[0]
            rules = reversed.slice(1)
        }
        rules.forEach(rule => { acc[rule] = target })
        return acc
    }, Object.create(null))
}

/**
 * 将 ruleMap 转为 .eprc 格式文本（用于 API 和保存）
 * IP/URL 类 target 输出为 target 在前，与 hosts/URL 格式一致
 */
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
            const targetFirst = IP_PATTERN.test(target) || URL_PATTERN.test(target)
            return targetFirst ? `${target} ${rules.join(' ')}` : `${rules.join(' ')} ${target}`
        })
        .join('\n')
}

/**
 * 解析配置文件路径，优先加载 cwd/.epconfig 下的配置
 * 文件命名: .[env].[json|js]? 或 .[env]
 * 通过 EP_ENV 选择环境，默认 'eprc'
 * @returns {{ path: string, format: 'eprc'|'json'|'js' } | null}
 */
function resolveConfigPath() {
    const cwd = process.cwd()
    const configDir = path.join(cwd, CONFIG_DIR)
    if (!existsSync(configDir)) return null

    const env = process.env.EP_ENV || 'eprc'
    const candidates = getConfigCandidates(configDir, env)
    for (const { path: filePath, format } of candidates) {
        if (existsSync(filePath)) {
            return { path: filePath, format }
        }
    }
    return null
}

/**
 * 根据路径加载配置，支持 .eprc / ep.config.json / ep.config.js
 * @param {string} configPath
 * @param {'eprc'|'json'|'js'} format
 * @returns {{[pattern: string]: string}}
 */
function loadConfigFromFile(configPath, format) {
    try {
        if (format === 'eprc') {
            const content = readFileSync(configPath, 'utf8')
            return parseEprc(content)
        }
        if (format === 'json') {
            const content = readFileSync(configPath, 'utf8')
            const data = JSON.parse(content)
            const rules = data.rules || data
            return typeof rules === 'object' && rules !== null ? rules : {}
        }
        if (format === 'js') {
            const mod = require(configPath)
            const rules = mod.rules ?? mod.default?.rules ?? mod
            return typeof rules === 'object' && rules !== null ? rules : {}
        }
    } catch (err) {
        console.error('加载配置失败:', configPath, err.message)
    }
    return {}
}

/**
 * @deprecated 使用 loadConfigFromFile
 * @param {string} filePath
 */
function loadConfig(filePath) {
    const content = readFileSync(filePath, 'utf8')
    return parseEprc(content)
}

module.exports = {
    copyHeaders,
    resolveTargetUrl,
    getFreePort,
    loadConfig,
    loadConfigFromFile,
    resolveConfigPath,
    ruleMapToEprcText,
    parseEprc,
    DEFAULT_CONFIG_PATH,
    CONFIG_DIR
}