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
const { copyHeaders, resolveTargetUrl, getFreePort, loadConfig, ENV_FILE } = require('./helpers')
const chokidar = require('chokidar')
const chalk = require('chalk')
const { execSync } = require('child_process')
const _debug = require('debug')

const proxyDebug = _debug('proxy')
const log = _debug('log')

// 是否启用启动后自动打开浏览器并设置代理（--open 或 EP_OPEN=1）
const AUTO_OPEN = process.argv.includes('--open') || process.env.EP_OPEN === '1'

let ruleMap = {
};

const MAX_RECORD_SIZE = process.env.MAX_RECORD_SIZE ? parseInt(process.env.MAX_RECORD_SIZE) : 10000
const proxyRecordArr = []

/**
 * @param {string} configPath 配置文件路径
 */
function ensureConfigFile(configPath) {
    const configDir = path.dirname(configPath)

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
        log('create config directory:', configDir)
    }

    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, '', 'utf8')
        log('create config file:', configPath)
    }

    try {
        const stat = fs.statSync(configPath)
        if (stat.isFile()) {
            ruleMap = loadConfig(configPath)
            const watcher = chokidar.watch(configPath)
            logRuleMap()

            watcher.on('change', (changedPath, stats) => {
                log(chalk.green('config file changed.'))
                ruleMap = loadConfig(changedPath)
                logRuleMap()
            })
        }
    } catch (error) {
        if (error) console.error(error)
    }
}

ensureConfigFile(ENV_FILE)

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
        if(req.url === '/') {
            // request for proxy server
            res.writeHead(200)
            res.write(fs.readFileSync(path.resolve(__dirname, './index.html'), 'utf8'))
            res.end()
        } else if(req.url.startsWith('/api/rules')) {
            const method = req.method.toLocaleLowerCase()
            if(method === 'put') {
                // update rules config
                res.setHeader('Content-Type', 'application/json')
                let text = ''

                req.on('data', chunk => {
                    text += chunk
                })
                req.on('end', () => {
                    fs.writeFileSync(ENV_FILE, text)
                    res.write(JSON.stringify({ status: 'success' }))
                    res.end()
                })

                res.on('error', () => {
                    res.statusCode = 500
                    res.statusMessage = 'Internal error'
                })

            } else {
                // send default rules config
                res.setHeader('Content-Type', 'text')
                res.write(fs.readFileSync(ENV_FILE))
                res.end()
            }
        } else if (req.url.startsWith('/api/logs')) {
            res.setHeader('Content-Type', 'application/json')
            res.write(JSON.stringify(proxyRecordArr))
            res.end()
        } else {
            res.writeHead(404)
            res.end()
        }
    } else {
        // proxy http request over http
        const url = new URL(req.url, 'http://' + req.headers.host)
        const proxyReq = http.request(url, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers)

            proxyRes.pipe(res)
        })
        copyHeaders(req, proxyReq)
        req.pipe(proxyReq)
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
 * @returns {boolean} 是否成功启动
 */
function openBrowserWithProxy(url, proxyServer) {
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
    const proxyArgs = `--user-data-dir="${userDataDir}" --proxy-server=${proxyServer}`
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
        proxyDebug('proxy-server start on ' + chalk.green(`http://127.0.0.1:${port}`))
        if (AUTO_OPEN) {
            const proxyUrl = `http://127.0.0.1:${port}`
            const proxyServer = `127.0.0.1:${port}`
            if (openBrowserWithProxy(proxyUrl, proxyServer)) {
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

                    // resolve targetUrl by against ruleMap
                    // 1. if targetUrl is ip address 127.0.0.1. Reuse current protocol
                    // 2. If targetURL is start with protocol url http://127.0.0.1
                    let target = resolveTargetUrl(source, ruleMap)
                    if(!target) {
                        target = source
                    }

                    const request = target.startsWith('https') ? https.request : http.request;

                    const proxyReq = request(target, {
                        method: req.method,
                        rejectUnauthorized: false,
                        headers: req.headers
                    }, (proxyRes) => {
                        // run beforeSendResponse hook
                        // plugins.forEach(plugin => plugin.beforeSendResponse(res))
                        let data

                        proxyRes.on('data', chunk => data += chunk)

                        proxyRes.on('end', () => {
                            const logData = {
                                method: req.method,
                                source,
                                target,
                                time: new Date().toLocaleTimeString()
                            }
                            localWSServer.clients.forEach(client => client.send(JSON.stringify(logData)))
                            proxyRecordArr.push(logData)
                            if (proxyRecordArr.length > MAX_RECORD_SIZE) {
                                proxyRecordArr.shift()
                            }
                            console.table(logData)
                        })
                        res.writeHead(proxyRes.statusCode, proxyRes.statusMessage, proxyRes.headers)
                        proxyRes.pipe(res)
                    })

                    req.pipe(proxyReq)

                    proxyReq.on('error', (error) => {
                        console.error('[error debug]', originHost + req.url, error)
                        res.statusCode = 500

                        // run beforeSendResponse hook
                        plugins.forEach(plugin => plugin.beforeSendResponse(res))

                        res.write(JSON.stringify(error))

                        res.end()
                    })
                })

                const wsServer = new WebSocketServer({
                    server
                })

                wsServer.on('connection', (ws, req) => {
                    const targetUrl = resolveTargetUrl('wss://' + req.headers.host + req.url, ruleMap)

                    const proxyWs = new WebSocket(targetUrl, ws.protocol, {
                        rejectUnauthorized: false,
                        headers: req.headers
                    });

                    proxyWs.on('message', (code, reason) => {
                        ws.send(code.toString(), (err) => {
                            if(err) console.error(err)
                        })
                    })


                    ws.on('message', (msg) => {
                        proxyDebug(msg)
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
