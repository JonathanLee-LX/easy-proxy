import { describe, it, expect } from 'vitest'
import { createPipeline, normalizeMode } from '../core/pipeline'

describe('pipeline normalizeMode', () => {
    it('falls back to off for unsupported modes', () => {
        expect(normalizeMode('x')).toBe('off')
        expect(normalizeMode(undefined)).toBe('off')
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

        expect(calls.length).toBe(0)
        expect(result.response.body).toBe('https://a.com')
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

        expect(hookTargets.length >= 1).toBeTruthy()
        expect(result.response.body).toBe('https://a.com')
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

        expect(result.target).toBe('https://rewritten.example.com')
        expect(result.response.body).toBe('https://rewritten.example.com')
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

        expect(executed).toBe(false)
        expect(result.shortCircuited).toBe(true)
        expect(result.response.statusCode).toBe(201)
        expect(result.response.body).toBe('mocked')
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
        expect(decision.target).toBe('https://legacy.example.com')
        expect(decision.observedTarget).toBe('https://observed.example.com')
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
        expect(decision.shortCircuited).toBe(true)
        expect(decision.response!.statusCode).toBe(202)
    })
})
