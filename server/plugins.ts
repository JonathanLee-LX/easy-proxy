import { Application, Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { ServerContext } from './index'

export function registerPluginsRoutes(app: Application, ctx: ServerContext): void {
    const epDir = ctx.epDir

    // API: 生成插件代码（流式）
    app.post('/api/plugins/generate-stream', async (req: Request, res: Response) => {
        try {
            const data = req.body
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { generatePluginStream } = require('../core/plugin-generator')

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
                (chunk: string) => {
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
            res.write(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`)
            res.end()
        }
    })

    // API: 生成插件代码（非流式，向后兼容）
    app.post('/api/plugins/generate', async (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        try {
            const data = req.body
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { generatePlugin } = require('../core/plugin-generator')
            const result = await generatePlugin(data.requirement, data.aiConfig)
            res.write(JSON.stringify({ status: 'success', plugin: result }))
        } catch (error) {
            res.statusCode = 500
            res.write(JSON.stringify({ error: (error as Error).message }))
        }
        res.end()
    })

    // API: 保存插件到配置目录
    app.post('/api/plugins/save', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        try {
            const data = req.body
            const pluginsDir = path.resolve(epDir, 'plugins')

            // 创建 plugins 目录
            if (!fs.existsSync(pluginsDir)) {
                fs.mkdirSync(pluginsDir, { recursive: true })
            }

            const filePath = path.resolve(pluginsDir, data.filename)
            fs.writeFileSync(filePath, data.code, 'utf8')

            console.log(`已保存插件: ${data.filename}`)

            res.write(JSON.stringify({
                status: 'success',
                message: '插件已保存',
                path: filePath
            }))
        } catch (error) {
            res.statusCode = 500
            res.write(JSON.stringify({ error: (error as Error).message }))
        }
        res.end()
    })

    // API: 列出自定义插件
    app.get('/api/plugins/custom', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        try {
            const pluginsDir = path.resolve(epDir, 'plugins')

            if (!fs.existsSync(pluginsDir)) {
                res.write(JSON.stringify({ plugins: [] }))
                res.end()
                return
            }

            const files = fs.readdirSync(pluginsDir)
            const pluginInfo: Array<{ filename: string; path: string; modified: Date }> = []

            // 只列出.js文件
            const jsFiles = files.filter(f => f.endsWith('.js'))

            jsFiles.forEach(jsFile => {
                const jsPath = path.resolve(pluginsDir, jsFile)
                const jsStat = fs.statSync(jsPath)

                pluginInfo.push({
                    filename: jsFile,
                    path: jsPath,
                    modified: jsStat.mtime
                })
            })

            res.write(JSON.stringify({ plugins: pluginInfo }))
        } catch (error) {
            res.statusCode = 500
            res.write(JSON.stringify({ error: (error as Error).message }))
        }
        res.end()
    })

    // API: 删除自定义插件
    app.delete('/api/plugins/custom/:filename', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        try {
            const filename = decodeURIComponent(req.params.filename as string)
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

                // 同时删除编译后的.js文件
                if (filename.endsWith('.ts')) {
                    const jsPath = filePath.replace(/\.ts$/, '.js')
                    if (fs.existsSync(jsPath)) {
                        fs.unlinkSync(jsPath)
                    }
                }

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
            res.write(JSON.stringify({ error: (error as Error).message }))
        }
        res.end()
    })

    // API: 热加载自定义插件
    app.post('/api/plugins/reload', async (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        try {
            const plugins = await ctx.reloadCustomPlugins()
            res.write(JSON.stringify({
                status: 'success',
                message: `已重新加载 ${plugins.length} 个自定义插件`,
                count: plugins.length,
                plugins: plugins.map((p: unknown) => {
                    const plugin = p as { manifest: { id: string; name: string; version: string } }
                    return {
                        id: plugin.manifest.id,
                        name: plugin.manifest.name,
                        version: plugin.manifest.version
                    }
                })
            }))
        } catch (error) {
            res.statusCode = 500
            res.write(JSON.stringify({ error: (error as Error).message }))
        }
        res.end()
    })

    // API: AI自动修复插件
    app.post('/api/plugins/fix', async (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        try {
            const data = req.body
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { fixPluginWithAI } = require('../core/plugin-generator')
            const fixedCode = await fixPluginWithAI(
                data.originalCode,
                data.testError,
                data.requirement,
                data.aiConfig
            )
            res.write(JSON.stringify({ status: 'success', fixedCode }))
        } catch (error) {
            res.statusCode = 500
            res.write(JSON.stringify({ error: (error as Error).message }))
        }
        res.end()
    })

    // API: 测试插件功能
    app.post('/api/plugins/test', async (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        try {
            const data = req.body
            const pluginId = data.pluginId
            const testType = data.testType || 'request'

            const allPlugins = ctx.pluginManager.getAll()
            const targetPlugin = allPlugins.find(p => p.manifest.id === pluginId)

            if (!targetPlugin) {
                res.statusCode = 404
                res.write(JSON.stringify({ error: '插件不存在' }))
                res.end()
                return
            }

            const testLogs: Array<{ level: string; message: string }> = []
            const testLogger = {
                log: (...args: unknown[]) => testLogs.push({ level: 'log', message: args.join(' ') }),
                info: (...args: unknown[]) => testLogs.push({ level: 'info', message: args.join(' ') }),
                warn: (...args: unknown[]) => testLogs.push({ level: 'warn', message: args.join(' ') }),
                error: (...args: unknown[]) => testLogs.push({ level: 'error', message: args.join(' ') }),
            }

            const testResults = {
                pluginId,
                pluginName: targetPlugin.manifest.name,
                testType,
                hooks: targetPlugin.manifest.hooks,
                logs: testLogs,
                hookResults: {} as Record<string, unknown>
            }

            // 测试各个hook
            const hooks = targetPlugin.manifest.hooks || []

            for (const hookName of hooks) {
                const hookFn = (targetPlugin as Record<string, unknown>)[hookName]
                if (typeof hookFn !== 'function') continue

                try {
                    let testContext: Record<string, unknown>

                    if (hookName === 'onRequestStart' || hookName === 'onBeforeProxy') {
                        testContext = {
                            log: testLogger,
                            request: {
                                method: data.method || 'GET',
                                url: data.url || 'http://example.com/test',
                                headers: data.headers || { 'user-agent': 'test' },
                                body: data.body || ''
                            },
                            target: data.url || 'http://example.com/test',
                            meta: { _test: true, _pluginRequestStartAt: Date.now() },
                            shortCircuited: false,
                            shortCircuitResponse: null,
                            setTarget: (newTarget: string) => { testContext.target = newTarget },
                            respond: (response: unknown) => {
                                testContext.shortCircuited = true
                                testContext.shortCircuitResponse = response
                            }
                        }
                    } else if (hookName === 'onBeforeResponse' || hookName === 'onAfterResponse') {
                        testContext = {
                            log: testLogger,
                            request: {
                                method: data.method || 'GET',
                                url: data.url || 'http://example.com/test',
                                headers: data.headers || {},
                                body: data.body || ''
                            },
                            target: data.url || 'http://example.com/test',
                            meta: { _test: true, _pluginRequestStartAt: Date.now() },
                            response: {
                                statusCode: data.statusCode || 200,
                                headers: data.responseHeaders || { 'content-type': 'text/plain' },
                                body: data.responseBody || 'test response'
                            }
                        }
                    } else if (hookName === 'onError') {
                        testContext = {
                            log: testLogger,
                            phase: 'test',
                            error: new Error(data.errorMessage || 'Test error'),
                            meta: { _test: true }
                        }
                    } else {
                        continue
                    }

                    const startTime = Date.now()
                    await (hookFn as (ctx: unknown) => Promise<void>).call(targetPlugin, testContext)
                    const duration = Date.now() - startTime

                    testResults.hookResults[hookName] = {
                        status: 'success',
                        duration,
                        context: testContext
                    }
                } catch (error) {
                    testResults.hookResults[hookName] = {
                        status: 'error',
                        error: (error as Error).message,
                        stack: (error as Error).stack
                    }
                }
            }

            res.write(JSON.stringify({
                status: 'success',
                results: testResults
            }))
        } catch (error) {
            res.statusCode = 500
            res.write(JSON.stringify({ error: (error as Error).message }))
        }
        res.end()
    })

    // API: 获取所有插件列表
    app.get('/api/plugins', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        const pluginStats = ctx.hookDispatcher.getPluginStats ? ctx.hookDispatcher.getPluginStats() : {}
        const plugins = ctx.pluginManager.getAll().map((plugin) => ({
            id: plugin.manifest.id,
            name: plugin.manifest.name,
            version: plugin.manifest.version,
            hooks: plugin.manifest.hooks,
            permissions: plugin.manifest.permissions,
            priority: plugin.manifest.priority,
            state: ctx.pluginManager.getState(plugin.manifest.id),
            stats: pluginStats[plugin.manifest.id] || null,
        }))
        res.write(JSON.stringify({
            mode: ctx.requestPipeline.mode,
            total: plugins.length,
            plugins,
        }))
        res.end()
    })

    // API: Logger 插件信息
    app.get('/api/plugins/logger', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        const pluginStats = ctx.hookDispatcher.getPluginStats ? ctx.hookDispatcher.getPluginStats() : {}
        res.write(JSON.stringify({
            pluginId: 'builtin.logger',
            mode: ctx.requestPipeline.mode,
            stats: pluginStats['builtin.logger'] || null,
            summary: typeof ctx.builtinLoggerPlugin.getSummary === 'function'
                ? ctx.builtinLoggerPlugin.getSummary()
                : null,
            recent: typeof ctx.builtinLoggerPlugin.getRecentEntries === 'function'
                ? ctx.builtinLoggerPlugin.getRecentEntries()
                : [],
        }))
        res.end()
    })

    // API: Mock 插件信息
    app.get('/api/plugins/mock', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        const pluginStats = ctx.hookDispatcher.getPluginStats ? ctx.hookDispatcher.getPluginStats() : {}
        const ENABLE_BUILTIN_MOCK_PLUGIN = true // This should come from REFACTOR_CONFIG
        res.write(JSON.stringify({
            pluginId: 'builtin.mock',
            enabled: ENABLE_BUILTIN_MOCK_PLUGIN,
            mode: ctx.requestPipeline.mode,
            stats: pluginStats['builtin.mock'] || null,
            takeoverRule: 'only inline mock in on mode and host-gated',
            allowlist: [], // Should come from context
        }))
        res.end()
    })

    // API: 插件健康检查
    app.get('/api/plugins/health', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        const pluginStats = ctx.hookDispatcher.getPluginStats ? ctx.hookDispatcher.getPluginStats() : {}
        const pluginStates: Record<string, string> = {}
        const manifests = ctx.pluginManager.getAll().map((plugin) => {
            pluginStates[plugin.manifest.id] = ctx.pluginManager.getState(plugin.manifest.id)
            return plugin.manifest
        })
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { buildPluginHealth } = require('../core/plugin-health')
        const health = buildPluginHealth({
            plugins: manifests,
            pluginStates,
            pluginStats,
        })
        res.write(JSON.stringify({
            mode: ctx.requestPipeline.mode,
            ...health,
        }))
        res.end()
    })
}
