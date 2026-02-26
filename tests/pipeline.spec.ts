const assert = require('assert')
const { createPipeline, normalizeMode } = require('../dist/core/pipeline')

describe('pipeline normalizeMode', () => {
    it('falls back to off for unsupported modes', () => {
        assert.strictEqual(normalizeMode('x'), 'off')
        assert.strictEqual(normalizeMode(undefined), 'off')
    })
})

describe('pipeline execute', () => {
    it('off mode bypasses dispatcher and keeps target', async () => {
        const calls = []
        const pipeline = createPipeline({
            mode: 'off',
            dispatcher: {
                async dispatch() {
                    calls.push('dispatch')
                },
            },
            pluginManager: {},
            logger: { error() {} },
        })

        const result = await pipeline.execute({
            request: { method: 'GET', url: 'https://a.com' },
            initialTarget: 'https://a.com',
            executeUpstream: async (target) => ({ response: { statusCode: 200, headers: {}, body: target } }),
        })

        assert.strictEqual(calls.length, 0)
        assert.strictEqual(result.response.body, 'https://a.com')
    })

    it('shadow mode runs hooks but does not alter upstream target', async () => {
        const hookTargets = []
        const pipeline = createPipeline({
            mode: 'shadow',
            dispatcher: {
                async dispatch(_hook, ctx) {
                    ctx.setTarget('https://modified.example.com')
                    hookTargets.push(ctx.target)
                },
            },
            pluginManager: {},
            logger: { error() {} },
        })

        const result = await pipeline.execute({
            request: { method: 'GET', url: 'https://a.com' },
            initialTarget: 'https://a.com',
            executeUpstream: async (target) => ({ response: { statusCode: 200, headers: {}, body: target } }),
        })

        assert.ok(hookTargets.length >= 1)
        assert.strictEqual(result.response.body, 'https://a.com')
    })

    it('on mode applies target rewrite before upstream', async () => {
        const pipeline = createPipeline({
            mode: 'on',
            dispatcher: {
                async dispatch(hook, ctx) {
                    if (hook === 'onBeforeProxy') {
                        ctx.setTarget('https://rewritten.example.com')
                    }
                },
            },
            pluginManager: {},
            logger: { error() {} },
        })

        const result = await pipeline.execute({
            request: { method: 'GET', url: 'https://a.com' },
            initialTarget: 'https://a.com',
            executeUpstream: async (target) => ({ response: { statusCode: 200, headers: {}, body: target } }),
        })

        assert.strictEqual(result.target, 'https://rewritten.example.com')
        assert.strictEqual(result.response.body, 'https://rewritten.example.com')
    })

    it('on mode supports short-circuit responses', async () => {
        const pipeline = createPipeline({
            mode: 'on',
            dispatcher: {
                async dispatch(hook, ctx) {
                    if (hook === 'onBeforeProxy') {
                        ctx.respond({ statusCode: 201, headers: { 'x-mock': '1' }, body: 'mocked' })
                    }
                },
            },
            pluginManager: {},
            logger: { error() {} },
        })

        let executed = false
        const result = await pipeline.execute({
            request: { method: 'GET', url: 'https://a.com' },
            initialTarget: 'https://a.com',
            executeUpstream: async () => {
                executed = true
                return { response: { statusCode: 200, headers: {}, body: 'upstream' } }
            },
        })

        assert.strictEqual(executed, false)
        assert.strictEqual(result.shortCircuited, true)
        assert.strictEqual(result.response.statusCode, 201)
        assert.strictEqual(result.response.body, 'mocked')
    })
})

describe('pipeline evaluateRequest', () => {
    it('returns observed target in shadow mode', async () => {
        const pipeline = createPipeline({
            mode: 'shadow',
            dispatcher: {
                async dispatch(hook, ctx) {
                    if (hook === 'onBeforeProxy') {
                        ctx.setTarget('https://observed.example.com')
                    }
                },
            },
            pluginManager: {},
            logger: { error() {} },
        })
        const decision = await pipeline.evaluateRequest(
            { method: 'GET', url: 'https://a.com' },
            'https://legacy.example.com'
        )
        assert.strictEqual(decision.target, 'https://legacy.example.com')
        assert.strictEqual(decision.observedTarget, 'https://observed.example.com')
    })

    it('returns short-circuit decision in on mode', async () => {
        const pipeline = createPipeline({
            mode: 'on',
            dispatcher: {
                async dispatch(hook, ctx) {
                    if (hook === 'onBeforeProxy') {
                        ctx.respond({ statusCode: 202, headers: {}, body: 'ok' })
                    }
                },
            },
            pluginManager: {},
            logger: { error() {} },
        })
        const decision = await pipeline.evaluateRequest(
            { method: 'GET', url: 'https://a.com' },
            'https://a.com'
        )
        assert.strictEqual(decision.shortCircuited, true)
        assert.strictEqual(decision.response.statusCode, 202)
    })
})

export {};
