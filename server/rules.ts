import { Application, Request, Response } from 'express'
import { ServerContext } from './index'
import { ruleMapToEprcText } from '../helpers'

export function registerRulesRoutes(app: Application, ctx: ServerContext): void {
    app.get('/api/rules', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.write(ruleMapToEprcText(ctx.ruleMap))
        res.end()
    })
}
