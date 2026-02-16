const assert = require('assert')
const { createBuiltinMockPlugin } = require('../plugins/builtin/mock-plugin')

describe('builtin mock plugin', () => {
    it('short-circuits inline mock response', async () => {
        const plugin = createBuiltinMockPlugin({
            findMatch: () => ({
                id: 1,
                name: 'm1',
                statusCode: 201,
                headers: { 'x-test': '1' },
                bodyType: 'inline',
                body: '{"ok":true}',
            }),
        })
        let shortRes = null
        const ctx = {
            request: { method: 'GET', url: 'https://a.com/api' },
            meta: {},
            respond(res) {
                shortRes = res
            },
        }
        await plugin.onBeforeProxy(ctx)
        assert.ok(shortRes)
        assert.strictEqual(shortRes.statusCode, 201)
        assert.strictEqual(shortRes.headers['x-test'], '1')
        assert.strictEqual(shortRes.body, '{"ok":true}')
        assert.strictEqual(ctx.meta.mockRuleId, 1)
    })

    it('skips non-inline file mock rules', async () => {
        const plugin = createBuiltinMockPlugin({
            findMatch: () => ({
                id: 2,
                bodyType: 'file',
                body: '/tmp/a.json',
            }),
        })
        let called = false
        const ctx = {
            request: { method: 'GET', url: 'https://a.com/api' },
            meta: {},
            respond() {
                called = true
            },
        }
        await plugin.onBeforeProxy(ctx)
        assert.strictEqual(called, false)
    })

    it('applies configured delay before short-circuit', async () => {
        const plugin = createBuiltinMockPlugin({
            findMatch: () => ({
                id: 3,
                bodyType: 'inline',
                delay: 15,
                body: '{"d":1}',
            }),
        })
        let calledAt = 0
        const start = Date.now()
        await plugin.onBeforeProxy({
            request: { method: 'GET', url: 'https://a.com/api' },
            meta: {},
            respond() {
                calledAt = Date.now()
            },
        })
        assert.ok(calledAt - start >= 10)
    })
})

