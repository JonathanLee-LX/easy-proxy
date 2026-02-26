const assert = require('assert')
const { decideRoute } = require('../dist/core/route-decision')

describe('route-decision decideRoute', () => {
    it('uses pipeline path when canUse returns true', async () => {
        let calledEvaluate = 0
        const result = await decideRoute({
            source: 'https://a.com',
            method: 'GET',
            headers: {},
            reqBody: Buffer.from(''),
            legacyTarget: 'https://legacy.com',
            requestPipeline: {
                mode: 'on',
                evaluateRequest: async () => {
                    calledEvaluate += 1
                    return {
                        target: 'https://plugin.com',
                        observedTarget: 'https://plugin.com',
                        shortCircuited: false,
                        response: null,
                    }
                },
            },
            canUsePipelineExecuteForSource: () => true,
            observeShadowDecision: () => {},
            fallbackResolve: async () => ({ target: 'https://fallback.com', shortCircuited: false, response: null }),
        })
        assert.strictEqual(calledEvaluate, 1)
        assert.strictEqual(result.target, 'https://plugin.com')
    })

    it('calls fallback when pipeline path is disabled', async () => {
        const result = await decideRoute({
            source: 'https://a.com',
            method: 'GET',
            headers: {},
            reqBody: Buffer.from(''),
            legacyTarget: 'https://legacy.com',
            requestPipeline: { mode: 'off', evaluateRequest: async () => ({}) },
            canUsePipelineExecuteForSource: () => false,
            observeShadowDecision: () => {},
            fallbackResolve: async () => ({ target: 'https://fallback.com', shortCircuited: false, response: null }),
        })
        assert.strictEqual(result.target, 'https://fallback.com')
    })

    it('emits shadow observation in shadow mode', async () => {
        let observed = null
        await decideRoute({
            source: 'https://a.com',
            method: 'GET',
            headers: {},
            reqBody: Buffer.from(''),
            legacyTarget: 'https://legacy.com',
            requestPipeline: {
                mode: 'shadow',
                evaluateRequest: async () => ({
                    target: 'https://legacy.com',
                    observedTarget: 'https://plugin.com',
                    shortCircuited: false,
                    response: null,
                }),
            },
            canUsePipelineExecuteForSource: () => true,
            observeShadowDecision: (...args) => {
                observed = args
            },
            fallbackResolve: async () => ({ target: 'https://fallback.com', shortCircuited: false, response: null }),
        })
        assert.ok(Array.isArray(observed))
        assert.strictEqual(observed[1], 'https://a.com')
    })
})

