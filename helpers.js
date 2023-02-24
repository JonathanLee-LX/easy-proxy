const { getPortPromise, setBasePort, setHighestPort } = require("portfinder");
const os = require('os')
const path = require('path')
const { readFileSync } = require('fs')


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


    return targetURLObj.toString()
}

const BASE_PORT = 8989

async function getFreePort() {
    // find a free port
    setBasePort(BASE_PORT);
    setHighestPort(9999);
    return getPortPromise();
}

/**
 *@param  {string} path
 */
function loadConfig(path) {
    const configFile = readFileSync(path, 'utf8')
    try {
        return configFile.split(/\r?\n/).reduce((acc, line) => {
            if (line.startsWith('//')) return acc
            const [target, ...rules] = line.split(' ').reverse()
            rules.forEach(rule => acc[rule] = target)
            return acc
        }, Object.create(null))
    } catch (error) {
        return {}
    }
}

const ENV_FILE = path.resolve(os.homedir(), './.jlx/.eprc')


// exports.copyHeaders = copyHeaders
module.exports = {
    copyHeaders,
    resolveTargetUrl,
    getFreePort,
    loadConfig,
    ENV_FILE
}