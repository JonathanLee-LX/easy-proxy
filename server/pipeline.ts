import { Application, Request, Response } from 'express'
import { ServerContext } from './index'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { evaluateShadowReadiness, buildReadinessAdvice } = require('../core/shadow-readiness')

export function registerPipelineRoutes(app: Application, ctx: ServerContext): void {
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
