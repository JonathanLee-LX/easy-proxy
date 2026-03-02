import { Application, Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { ServerContext } from './index'
import { loadConfigFromFile } from '../helpers'

export function registerConfigRoutes(app: Application, ctx: ServerContext): void {
    // API: 获取当前配置文件路径
    app.get('/api/config-path', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        res.write(JSON.stringify({
            path: ctx.currentConfig?.path || '',
            mocksPath: ctx.getMockFilePath()
        }))
        res.end()
    })

    // API: 刷新配置文件
    app.post('/api/refresh-config', async (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        try {
            // 重新读取自定义路径配置
            const customPaths = ctx.loadCustomPathsFromSettings()

            // 刷新路由规则
            if (customPaths.rulesFilePath && fs.existsSync(customPaths.rulesFilePath)) {
                const ext = path.extname(customPaths.rulesFilePath)
                let format: 'eprc' | 'json' | 'js' = 'eprc'
                if (ext === '.json') format = 'json'
                else if (ext === '.js') format = 'js'

                const newRuleMap = loadConfigFromFile(customPaths.rulesFilePath, format)
                ctx.ruleMap = newRuleMap
                ctx.currentConfig = { path: customPaths.rulesFilePath, format }
                ctx.logRuleMap()
            } else if (ctx.currentConfig && ctx.currentConfig.path) {
                const format = ctx.currentConfig.format as 'eprc' | 'json' | 'js'
                const newRuleMap = loadConfigFromFile(ctx.currentConfig.path, format)
                ctx.ruleMap = newRuleMap
                ctx.logRuleMap()
            } else {
                res.statusCode = 400
                res.write(JSON.stringify({ error: '无当前配置文件' }))
                res.end()
                return
            }

            // 刷新 Mock 规则
            ctx.currentMocksPath = null // 清除缓存，强制重新读取
            ctx.loadMockRules()

            res.write(JSON.stringify({
                status: 'success',
                message: '配置已刷新',
                rulesPath: ctx.currentConfig?.path,
                mocksPath: ctx.getMockFilePath()
            }))
        } catch (error) {
            res.statusCode = 500
            res.write(JSON.stringify({ error: (error as Error).message }))
        }
        res.end()
    })

    // API: 获取系统设置
    app.get('/api/settings', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        try {
            if (fs.existsSync(ctx.settingsPath)) {
                const settingsData = fs.readFileSync(ctx.settingsPath, 'utf8')
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
            res.write(JSON.stringify({ error: (error as Error).message }))
        }
        res.end()
    })

    // API: 保存系统设置
    app.post('/api/settings', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        try {
            const settings = req.body
            fs.writeFileSync(ctx.settingsPath, JSON.stringify(settings, null, 2), 'utf8')
            res.write(JSON.stringify({ status: 'success', message: '设置已保存' }))
        } catch (error) {
            res.statusCode = 500
            res.write(JSON.stringify({ error: (error as Error).message }))
        }
        res.end()
    })

    // API: 配置文件健康检查
    app.get('/api/config-doctor', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        try {
            const result = ctx.performConfigDiagnostics()
            res.write(JSON.stringify(result))
        } catch (error) {
            res.statusCode = 500
            res.write(JSON.stringify({ error: (error as Error).message }))
        }
        res.end()
    })
}
