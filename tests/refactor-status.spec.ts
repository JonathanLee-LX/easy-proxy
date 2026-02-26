const assert = require('assert')
const { buildRefactorStatus } = require('../dist/core/refactor-status')

describe('refactor-status buildRefactorStatus', () => {
    it('returns normalized status payload', () => {
        const status = buildRefactorStatus({
            runtime: { pid: 1, uptimeSec: 10 },
            mode: 'shadow',
            allowlist: ['a.com'],
            readiness: { ready: false },
            advice: { suggestedMode: 'shadow' },
            shadowStats: { total: 10 },
            onModeGate: { checked: 10 },
            plugins: [{ id: 'builtin.router' }],
            loggerSummary: { totalResponses: 5 },
        })
        assert.strictEqual(status.mode, 'shadow')
        assert.strictEqual(status.runtime.pid, 1)
        assert.deepStrictEqual(status.allowlist, ['a.com'])
        assert.strictEqual(status.readiness.ready, false)
        assert.strictEqual(status.shadow.total, 10)
        assert.strictEqual(status.plugins.length, 1)
        assert.strictEqual(status.loggerSummary.totalResponses, 5)
        assert.ok(typeof status.generatedAt === 'number')
    })
})

export {};
