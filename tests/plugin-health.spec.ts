const assert = require('assert')
const { buildPluginHealth } = require('../dist/core/plugin-health')

describe('plugin-health buildPluginHealth', () => {
    it('returns healthy overall when all running without failures', () => {
        const result = buildPluginHealth({
            plugins: [
                { id: 'builtin.router', name: 'router', version: '1.0.0' },
                { id: 'builtin.logger', name: 'logger', version: '1.0.0' },
            ],
            pluginStates: {
                'builtin.router': 'running',
                'builtin.logger': 'running',
            },
            pluginStats: {
                'builtin.router': { total: 10, error: 0, timeout: 0 },
                'builtin.logger': { total: 10, error: 0, timeout: 0 },
            },
        })
        assert.strictEqual(result.overall, 'healthy')
        assert.strictEqual(result.counts.healthy, 2)
    })

    it('returns degraded overall when plugin is disabled or failing', () => {
        const result = buildPluginHealth({
            plugins: [
                { id: 'builtin.router', name: 'router', version: '1.0.0' },
                { id: 'builtin.mock', name: 'mock', version: '1.0.0' },
            ],
            pluginStates: {
                'builtin.router': 'running',
                'builtin.mock': 'disabled',
            },
            pluginStats: {
                'builtin.router': { total: 4, error: 1, timeout: 0 },
            },
        })
        assert.strictEqual(result.overall, 'degraded')
        assert.strictEqual(result.counts.degraded, 1)
        assert.strictEqual(result.counts.disabled, 1)
    })
})

export {};
