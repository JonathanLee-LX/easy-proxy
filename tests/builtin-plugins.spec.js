const assert = require('assert')
const { createBuiltinRouterPlugin } = require('../dist/plugins/builtin/router-plugin')
const { createBuiltinLoggerPlugin } = require('../dist/plugins/builtin/logger-plugin')

describe('builtin router plugin', () => {
    it('rewrites target when rule matched', () => {
        const plugin = createBuiltinRouterPlugin({
            getRuleMap: () => ({ '^https://a.com': '127.0.0.1:8080' }),
        })
        const ctx = {
            request: { method: 'GET', url: 'https://a.com/path' },
            target: 'https://a.com/path',
            meta: {},
            setTarget(nextTarget) {
                this.target = nextTarget
            },
        }
        plugin.onBeforeProxy(ctx)
        assert.strictEqual(ctx.target, 'https://127.0.0.1:8080/path')
        assert.strictEqual(ctx.meta.routerMatched, true)
    })

    it('keeps target when no rule matched', () => {
        const plugin = createBuiltinRouterPlugin({
            getRuleMap: () => ({ '^https://x.com': '127.0.0.1:8080' }),
        })
        const ctx = {
            request: { method: 'GET', url: 'https://a.com/path' },
            target: 'https://a.com/path',
            meta: {},
            setTarget(nextTarget) {
                this.target = nextTarget
            },
        }
        plugin.onBeforeProxy(ctx)
        assert.strictEqual(ctx.target, 'https://a.com/path')
        assert.strictEqual(ctx.meta.routerMatched, undefined)
    })
})

describe('builtin logger plugin', () => {
    it('records response with duration', async () => {
        const plugin = createBuiltinLoggerPlugin({ maxEntries: 10 })
        const ctx = {
            request: { method: 'GET', url: 'https://a.com/path' },
            response: { statusCode: 200, headers: {}, body: '' },
            meta: {},
        }
        plugin.onRequestStart(ctx)
        await new Promise((r) => setTimeout(r, 1))
        plugin.onAfterResponse(ctx)

        const entries = plugin.getRecentEntries()
        assert.strictEqual(entries.length, 1)
        assert.strictEqual(entries[0].type, 'response')
        assert.strictEqual(entries[0].statusCode, 200)
        assert.ok(entries[0].duration >= 0)
    })

    it('records errors', () => {
        const plugin = createBuiltinLoggerPlugin({ maxEntries: 10 })
        plugin.onError({ phase: 'onBeforeProxy', error: new Error('fail') })
        const entries = plugin.getRecentEntries()
        assert.strictEqual(entries.length, 1)
        assert.strictEqual(entries[0].type, 'error')
        assert.strictEqual(entries[0].message, 'fail')
    })

    it('builds aggregate summary', () => {
        const plugin = createBuiltinLoggerPlugin({ maxEntries: 10 })
        const ctx1 = {
            request: { method: 'GET', url: 'https://a.com/path' },
            response: { statusCode: 200, headers: {}, body: '' },
            meta: { _pluginRequestStartAt: Date.now() - 10 },
        }
        const ctx2 = {
            request: { method: 'POST', url: 'https://a.com/path' },
            response: { statusCode: 404, headers: {}, body: '' },
            meta: { _pluginRequestStartAt: Date.now() - 20 },
        }
        plugin.onAfterResponse(ctx1)
        plugin.onAfterResponse(ctx2)
        plugin.onError({ phase: 'onAfterResponse', error: new Error('e1') })

        const summary = plugin.getSummary()
        assert.strictEqual(summary.totalResponses, 2)
        assert.strictEqual(summary.totalErrors, 1)
        assert.strictEqual(summary.byMethod.GET, 1)
        assert.strictEqual(summary.byMethod.POST, 1)
        assert.strictEqual(summary.byStatusBucket['2xx'], 1)
        assert.strictEqual(summary.byStatusBucket['4xx'], 1)
        assert.ok(summary.avgDuration >= 0)
    })
})

