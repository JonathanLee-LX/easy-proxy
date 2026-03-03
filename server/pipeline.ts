import { Application, Request, Response } from 'express'
import { ServerContext } from './index'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { evaluateShadowReadiness, buildReadinessAdvice } = require('../core/shadow-readiness')

export function registerPipelineRoutes(app: Application, ctx: ServerContext): void {
    // API: /api/pipeline/mode - Get/set plugin pipeline mode
    app.route('/api/pipeline/mode')
        .get((_req: Request, res: Response) => {
            res.json({ mode: ctx.requestPipeline.mode })
        })
        .put((req: Request, res: Response) => {
            const { mode } = req.body || {}
            if (!mode || !['off', 'shadow', 'on'].includes(mode)) {
                res.status(400).json({ error: '无效的模式，可选值: off, shadow, on' })
                return
            }
            const oldMode = ctx.requestPipeline.mode
            ctx.requestPipeline.setMode(mode)
            ctx.onModeGate.setMode(mode)
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require('fs')
            try {
                let settings: Record<string, unknown> = {}
                if (fs.existsSync(ctx.settingsPath)) {
                    settings = JSON.parse(fs.readFileSync(ctx.settingsPath, 'utf8'))
                }
                settings.pluginMode = mode
                fs.writeFileSync(ctx.settingsPath, JSON.stringify(settings, null, 2), 'utf8')
            } catch (e: unknown) {
                console.warn('持久化 pluginMode 失败:', e instanceof Error ? e.message : e)
            }
            console.log(`插件模式已切换: ${oldMode} → ${mode}`)
            res.json({ status: 'success', oldMode, mode: ctx.requestPipeline.mode })
        })
        .post((req: Request, res: Response) => {
            const { mode } = req.body || {}
            if (!mode || !['off', 'shadow', 'on'].includes(mode)) {
                res.status(400).json({ error: '无效的模式，可选值: off, shadow, on' })
                return
            }
            const oldMode = ctx.requestPipeline.mode
            ctx.requestPipeline.setMode(mode)
            ctx.onModeGate.setMode(mode)
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require('fs')
            try {
                let settings: Record<string, unknown> = {}
                if (fs.existsSync(ctx.settingsPath)) {
                    settings = JSON.parse(fs.readFileSync(ctx.settingsPath, 'utf8'))
                }
                settings.pluginMode = mode
                fs.writeFileSync(ctx.settingsPath, JSON.stringify(settings, null, 2), 'utf8')
            } catch (e: unknown) {
                console.warn('持久化 pluginMode 失败:', e instanceof Error ? e.message : e)
            }
            console.log(`插件模式已切换: ${oldMode} → ${mode}`)
            res.json({ status: 'success', oldMode, mode: ctx.requestPipeline.mode })
        })

    // API: /api/pipeline/shadow-stats - Get/reset shadow comparison stats
    app.route('/api/pipeline/shadow-stats')
        .get((_req: Request, res: Response) => {
            res.setHeader('Content-Type', 'application/json')
            res.write(JSON.stringify({
                ...ctx.shadowCompareTracker.getStats(),
                onModeGate: ctx.onModeGate.getStats(),
            }))
            res.end()
        })
        .post((_req: Request, res: Response) => {
            res.setHeader('Content-Type', 'application/json')
            ctx.shadowCompareTracker.reset()
            ctx.onModeGate.reset()
            res.write(JSON.stringify({
                status: 'success',
                stats: ctx.shadowCompareTracker.getStats(),
                onModeGate: ctx.onModeGate.getStats(),
            }))
            res.end()
        })
        .delete((_req: Request, res: Response) => {
            res.setHeader('Content-Type', 'application/json')
            ctx.shadowCompareTracker.reset()
            ctx.onModeGate.reset()
            res.write(JSON.stringify({
                status: 'success',
                stats: ctx.shadowCompareTracker.getStats(),
                onModeGate: ctx.onModeGate.getStats(),
            }))
            res.end()
        })

    // API: /api/pipeline/readiness - Get pipeline readiness info
    app.get('/api/pipeline/readiness', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        const shadowStats = ctx.shadowCompareTracker.getStats()
        const readiness = evaluateShadowReadiness(shadowStats, {
            minSamples: 10, // Should come from REFACTOR_CONFIG
            maxDiffRate: 0.1, // Should come from REFACTOR_CONFIG
        })
        const gateStats = ctx.onModeGate.getStats()
        const advice = buildReadinessAdvice({
            mode: ctx.requestPipeline.mode,
            readiness,
            allowlist: [], // Should come from REFACTOR_CONFIG
            onModeGate: gateStats as { mode: string; allowed: number; denied: number; total: number },
        })
        res.write(JSON.stringify({
            mode: ctx.requestPipeline.mode,
            readiness,
            advice,
            shadowStats,
            onModeGate: gateStats,
            allowlist: [], // Should come from REFACTOR_CONFIG
        }))
        res.end()
    })

    // API: /api/pipeline/config - Get pipeline configuration
    app.get('/api/pipeline/config', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json')
        res.write(JSON.stringify({
            mode: ctx.requestPipeline.mode,
            allowlist: [], // Should come from REFACTOR_CONFIG
            plugins: {
                router: true, // Should come from REFACTOR_CONFIG
                logger: true, // Should come from REFACTOR_CONFIG
                mock: true, // Should come from REFACTOR_CONFIG
            },
            thresholds: {
                shadowWarnMinSamples: 10, // Should come from REFACTOR_CONFIG
                shadowWarnDiffRate: 0.1, // Should come from REFACTOR_CONFIG
            },
            onModeGate: ctx.onModeGate.getStats(),
        }))
        res.end()
    })
}
