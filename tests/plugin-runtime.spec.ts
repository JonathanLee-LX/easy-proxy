const assert = require('assert')
const { PluginManager, HookDispatcher } = require('../dist/core/plugin-runtime')

function createPlugin(overrides: any = {}) {
    return {
        manifest: {
            id: 'test.plugin',
            version: '1.0.0',
            apiVersion: '1.x',
            permissions: [],
            hooks: [],
            priority: 100,
            ...overrides.manifest,
        },
        async setup() {},
        ...overrides,
    }
}

describe('plugin-runtime PluginManager', () => {
    it('registers plugin and tracks state', () => {
        const manager = new PluginManager({ logger: { error() {} } })
        const plugin = createPlugin()
        manager.register(plugin)
        assert.strictEqual(manager.getState(plugin.manifest.id), 'registered')
    })

    it('disables plugin when lifecycle throws error', async () => {
        const manager = new PluginManager({ logger: { error() {} } })
        const plugin = createPlugin({
            setup: async () => {
                throw new Error('boom')
            },
        })
        manager.register(plugin)
        await manager.setup(() => ({}))
        assert.strictEqual(manager.getState(plugin.manifest.id), 'disabled')
    })
})

describe('plugin-runtime HookDispatcher', () => {
    it('dispatches hooks by priority order', async () => {
        const calls = []
        const manager = new PluginManager({ logger: { error() {} } })
        manager.register(
            createPlugin({
                manifest: {
                    id: 'plugin.low',
                    version: '1.0.0',
                    apiVersion: '1.x',
                    permissions: [],
                    hooks: ['onBeforeProxy'],
                    priority: 200,
                },
                onBeforeProxy: async () => calls.push('low'),
            })
        )
        manager.register(
            createPlugin({
                manifest: {
                    id: 'plugin.high',
                    version: '1.0.0',
                    apiVersion: '1.x',
                    permissions: [],
                    hooks: ['onBeforeProxy'],
                    priority: 10,
                },
                onBeforeProxy: async () => calls.push('high'),
            })
        )
        await manager.setup(() => ({}))
        await manager.start()
        const dispatcher = new HookDispatcher(manager, {
            logger: { error() {} },
            defaultTimeoutMs: 50,
        })

        const results = await dispatcher.dispatch('onBeforeProxy', { requestId: 'r1' })
        assert.deepStrictEqual(calls, ['high', 'low'])
        assert.strictEqual(results.length, 2)
        assert.strictEqual(results[0].status, 'ok')
        assert.strictEqual(results[1].status, 'ok')
    })

    it('marks timeout when hook exceeds time budget', async () => {
        const manager = new PluginManager({ logger: { error() {} } })
        manager.register(
            createPlugin({
                manifest: {
                    id: 'plugin.slow',
                    version: '1.0.0',
                    apiVersion: '1.x',
                    permissions: [],
                    hooks: ['onAfterResponse'],
                },
                onAfterResponse: async () => {
                    await new Promise((resolve) => setTimeout(resolve, 20))
                },
            })
        )
        await manager.setup(() => ({}))
        await manager.start()
        const dispatcher = new HookDispatcher(manager, {
            logger: { error() {} },
            defaultTimeoutMs: 5,
        })

        const results = await dispatcher.dispatch('onAfterResponse', { requestId: 'r2' })
        assert.strictEqual(results.length, 1)
        assert.strictEqual(results[0].status, 'timeout')
    })

    it('collects plugin hook stats', async () => {
        const manager = new PluginManager({ logger: { error() {} } })
        manager.register(
            createPlugin({
                manifest: {
                    id: 'plugin.stats.ok',
                    version: '1.0.0',
                    apiVersion: '1.x',
                    permissions: [],
                    hooks: ['onBeforeProxy'],
                },
                onBeforeProxy: async () => {},
            })
        )
        manager.register(
            createPlugin({
                manifest: {
                    id: 'plugin.stats.err',
                    version: '1.0.0',
                    apiVersion: '1.x',
                    permissions: [],
                    hooks: ['onBeforeProxy'],
                },
                onBeforeProxy: async () => {
                    throw new Error('boom')
                },
            })
        )
        await manager.setup(() => ({}))
        await manager.start()
        const dispatcher = new HookDispatcher(manager, {
            logger: { error() {} },
            defaultTimeoutMs: 30,
        })
        await dispatcher.dispatch('onBeforeProxy', { requestId: 'r3' })
        const stats = dispatcher.getPluginStats()
        assert.strictEqual(stats['plugin.stats.ok'].ok, 1)
        assert.strictEqual(stats['plugin.stats.err'].error, 1)
        assert.strictEqual(stats['plugin.stats.err'].lastError, 'boom')
    })
})

export {};
