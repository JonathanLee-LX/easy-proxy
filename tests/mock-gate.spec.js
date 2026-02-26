const assert = require('assert')
const { shouldUsePluginMock } = require('../dist/core/mock-gate')

describe('mock-gate shouldUsePluginMock', () => {
    it('returns false when plugin is disabled', () => {
        const result = shouldUsePluginMock({
            enabled: false,
            mode: 'on',
            source: 'https://a.com',
            rule: { bodyType: 'inline' },
            shouldApplyOn: () => true,
        })
        assert.strictEqual(result, false)
    })

    it('returns false when mode is not on', () => {
        const result = shouldUsePluginMock({
            enabled: true,
            mode: 'shadow',
            source: 'https://a.com',
            rule: { bodyType: 'inline' },
            shouldApplyOn: () => true,
        })
        assert.strictEqual(result, false)
    })

    it('returns false when on-mode gate rejects source', () => {
        const result = shouldUsePluginMock({
            enabled: true,
            mode: 'on',
            source: 'https://a.com',
            rule: { bodyType: 'inline' },
            shouldApplyOn: () => false,
        })
        assert.strictEqual(result, false)
    })

    it('returns false for file bodyType', () => {
        const result = shouldUsePluginMock({
            enabled: true,
            mode: 'on',
            source: 'https://a.com',
            rule: { bodyType: 'file' },
            shouldApplyOn: () => true,
        })
        assert.strictEqual(result, false)
    })

    it('returns true for inline rule in on mode', () => {
        const result = shouldUsePluginMock({
            enabled: true,
            mode: 'on',
            source: 'https://a.com',
            rule: { bodyType: 'inline' },
            shouldApplyOn: () => true,
        })
        assert.strictEqual(result, true)
    })
})

