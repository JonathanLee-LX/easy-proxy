const http = require('http')
const https = require('https')
const { connect } = require('net')
const { crtMgr } = require('./cert')
const { WebSocket, WebSocketServer } = require('ws')
const { copyHeaders, resolveTargetUrl, getFreePort, loadConfig, ENV_FILE } = require('./helpers')
const chokidar = require('chokidar')
const { statSync, readFileSync, mkdirSync, writeFileSync } = require('fs')
const chalk = require('chalk')
const { resolve } = require('path')
const _debug = require('debug')

const proxyDebug = _debug('proxy')
const log = _debug('log')

let ruleMap = {
};

const proxyRecordArr = []

/**
 * @param {string} path
 */
function ensureConfigFile(path) {
    try {
        const stat = statSync(path)
        if (stat.isFile()) {
            ruleMap = loadConfig(path)
            const watcher = chokidar.watch(path)
            logRuleMap()

            watcher.on('change', (path, stats) => {
                log(chalk.green('config file changed.'))
                ruleMap = loadConfig(path)
                logRuleMap()
            })
        }
    } catch (error) {
        if(error) console.error(error)
        mkdirSync(path, { recursive: true })
        log('create envs directory.')
        ensureConfigFile(path)
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
            res.write(readFileSync(resolve(__dirname, './index.html'), 'utf8'))
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
                    writeFileSync(ENV_FILE, text)
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
                res.write(readFileSync(ENV_FILE))
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


getFreePort().then(port => {
    proxyServer.listen(port, () => proxyDebug('proxy-server start on ' + chalk.green(`${'http://127.0.0.1:' + port}`)))
})

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
