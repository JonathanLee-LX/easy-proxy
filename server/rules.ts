import { Application, Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { ServerContext, RuleMap } from './index'
import { parseEprc, ruleMapToEprcText } from '../helpers'

export function registerRulesRoutes(app: Application, ctx: ServerContext): void {
    // API: /api/rules - Handle GET, POST, PUT
    app.all('/api/rules', (req: Request, res: Response) => {
        const method = req.method.toLowerCase()

        // POST - 加载外部规则文件
        if (method === 'post') {
            res.setHeader('Content-Type', 'application/json')
            const { filePath, content } = req.body

            // 解析规则内容
            let ruleContent = ''
            let ext = ''

            if (content !== undefined) {
                // 前端直接发送文件内容
                ruleContent = content
                ext = path.extname(filePath || '').toLowerCase()
            } else if (filePath) {
                // 通过文件路径加载（旧模式）
                if (!fs.existsSync(filePath)) {
                    res.statusCode = 404
                    res.write(JSON.stringify({ error: '文件不存在' }))
                    res.end()
                    return
                }
                ruleContent = fs.readFileSync(filePath, 'utf8')
                ext = path.extname(filePath).toLowerCase()
            } else {
                res.statusCode = 400
                res.write(JSON.stringify({ error: '缺少文件路径或文件内容' }))
                res.end()
                return
            }

            // 解析规则
            let newRuleMap: RuleMap
            if (ext === '.json') {
                // JSON 格式
                const json = JSON.parse(ruleContent)
                newRuleMap = {}
                const rulesObj = json.rules || {}
                for (const [rule, target] of Object.entries(rulesObj)) {
                    const cleanRule = rule.replace(/^\/\//, '')
                    newRuleMap[cleanRule] = target as string
                }
            } else if (ext === '.eprc' || ext === '.txt' || ext === '.rules' || ext === '') {
                // EPRC 格式或其他文本格式
                newRuleMap = parseEprc(ruleContent)
            } else {
                res.statusCode = 400
                res.write(JSON.stringify({ error: '不支持的文件格式，请使用 .eprc、.json、.txt 或 .rules 文件' }))
                res.end()
                return
            }

            // 更新规则
            ctx.ruleMap = newRuleMap

            // 通知所有客户端规则已更新
            ctx.broadcastToAllClients({
                type: 'rulesUpdated',
                rules: Object.entries(ctx.ruleMap).map(([rule, target]) => ({ rule, target, enabled: true }))
            })

            res.write(JSON.stringify({ status: 'success', message: '规则已从文件加载' }))
            res.end()
            return
        }

        // PUT - 保存规则到文件
        if (method === 'put') {
            if (!ctx.currentConfig || ctx.currentConfig.format === 'js') {
                res.statusCode = 405
                res.setHeader('Content-Type', 'application/json')
                res.write(JSON.stringify({ error: '.js 配置文件为只读，无法通过界面保存' }))
                res.end()
                return
            }
            res.setHeader('Content-Type', 'application/json')
            const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)

            try {
                const newRuleMap = parseEprc(text)
                if (ctx.currentConfig.format === 'json') {
                    // 对于JSON格式，需要保留完整的规则信息（包括禁用的规则）
                    // 解析带有启用/禁用状态的规则
                    const rulesWithStatus = text.split(/\r?\n/).filter((line: string) => line.trim()).map((line: string) => {
                        let enabled = true
                        let trimmedLine = line.trim()
                        if (trimmedLine.startsWith('//')) {
                            enabled = false
                            trimmedLine = trimmedLine.replace(/^\/\//, '').trim()
                        }
                        return { line: trimmedLine, enabled }
                    })

                    // 构建包含启用状态的JSON结构
                    const rulesObj: Record<string, string> = {}
                    rulesWithStatus.forEach(({ line, enabled }: { line: string; enabled: boolean }) => {
                        const parts = line.split(/\s+/).filter(Boolean)
                        if (parts.length < 2) return

                        const IP_PATTERN = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/
                        const URL_PATTERN = /^https?:\/\//
                        const isTargetFirst = IP_PATTERN.test(parts[0]) || URL_PATTERN.test(parts[0])

                        if (isTargetFirst) {
                            const [target, ...rules] = parts
                            rules.forEach((rule: string) => {
                                const key = enabled ? rule : `//${rule}`
                                rulesObj[key] = target
                            })
                        } else {
                            const target = parts[parts.length - 1]
                            const rules = parts.slice(0, -1)
                            rules.forEach((rule: string) => {
                                const key = enabled ? rule : `//${rule}`
                                rulesObj[key] = target
                            })
                        }
                    })

                    const content = JSON.stringify({ rules: rulesObj }, null, 2)
                    fs.writeFileSync(ctx.currentConfig.path, content, 'utf8')
                } else {
                    fs.writeFileSync(ctx.currentConfig.path, text, 'utf8')
                }
                ctx.ruleMap = newRuleMap
                res.write(JSON.stringify({ status: 'success' }))
            } catch (err) {
                res.statusCode = 500
                res.write(JSON.stringify({ error: (err as Error).message }))
            }
            res.end()
            return
        }

        // GET - 读取配置文件内容
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        // 读取完整的配置文件内容（包括禁用的规则）
        if (ctx.currentConfig && fs.existsSync(ctx.currentConfig.path)) {
            const content = fs.readFileSync(ctx.currentConfig.path, 'utf8')
            // 对于JSON格式，需要转换为EPRC格式
            if (ctx.currentConfig.format === 'json') {
                try {
                    const json = JSON.parse(content)
                    const rulesObj = json.rules || {}
                    const lines: string[] = []
                    for (const [rule, target] of Object.entries(rulesObj)) {
                        const prefix = rule.startsWith('//') ? '//' : ''
                        const cleanRule = rule.replace(/^\/\//, '')
                        lines.push(`${prefix}${cleanRule} ${target}`)
                    }
                    res.write(lines.join('\n'))
                } catch (err) {
                    res.write(ruleMapToEprcText(ctx.ruleMap))
                }
            } else {
                res.write(content)
            }
        } else {
            res.write(ruleMapToEprcText(ctx.ruleMap))
        }
        res.end()
    })
}
