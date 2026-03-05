import { describe, it, expect } from 'vitest'
import os from 'os'
import { createRouteLoader } from '../core/route-loader'

describe('route-loader createRouteLoader', () => {
    function makeCtx(overrides: any = {}) {
        return {
            epDir: os.homedir() + '/.ep',
            ruleMap: {},
            ...overrides,
        }
    }

    function makeServerContext(overrides: any = {}) {
        return {
            ruleMap: {},
            broadcastToAllClients: () => {},
            epDir: os.homedir() + '/.ep',
            settingsPath: os.homedir() + '/.ep/settings.json',
            ...overrides,
        }
    }

    it('returns an object with logRuleMap, reloadAllRuleFiles, initRouteRules', () => {
        const loader = createRouteLoader(makeCtx(), makeServerContext())
        expect(typeof loader.logRuleMap).toBe('function')
        expect(typeof loader.reloadAllRuleFiles).toBe('function')
        expect(typeof loader.initRouteRules).toBe('function')
    })

    it('reloadAllRuleFiles updates ctx.ruleMap and broadcasts', () => {
        let broadcasted: any = null
        const ctx = makeCtx()
        const sc = makeServerContext({
            broadcastToAllClients: (data: any) => { broadcasted = data },
        })
        const loader = createRouteLoader(ctx, sc)
        loader.reloadAllRuleFiles()
        expect(broadcasted !== null).toBeTruthy()
        expect(broadcasted.type).toBe('rulesUpdated')
        expect(Array.isArray(broadcasted.rules)).toBeTruthy()
        expect(sc.ruleMap).toBe(ctx.ruleMap)
    })
})
