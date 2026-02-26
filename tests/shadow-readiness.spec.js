const assert = require('assert')
const { evaluateShadowReadiness, buildReadinessAdvice } = require('../dist/core/shadow-readiness')

describe('shadow-readiness evaluateShadowReadiness', () => {
    it('returns insufficient_samples when total is below threshold', () => {
        const result = evaluateShadowReadiness(
            { total: 50, diffRate: 0.01 },
            { minSamples: 100, maxDiffRate: 0.05 }
        )
        assert.strictEqual(result.ready, false)
        assert.strictEqual(result.reason, 'insufficient_samples')
    })

    it('returns diff_rate_too_high when diff exceeds threshold', () => {
        const result = evaluateShadowReadiness(
            { total: 200, diffRate: 0.12 },
            { minSamples: 100, maxDiffRate: 0.05 }
        )
        assert.strictEqual(result.ready, false)
        assert.strictEqual(result.reason, 'diff_rate_too_high')
    })

    it('returns ready when thresholds are satisfied', () => {
        const result = evaluateShadowReadiness(
            { total: 300, diffRate: 0.01 },
            { minSamples: 100, maxDiffRate: 0.05 }
        )
        assert.strictEqual(result.ready, true)
        assert.strictEqual(result.reason, 'ok')
    })
})

describe('shadow-readiness buildReadinessAdvice', () => {
    it('suggests shadow when mode is off', () => {
        const advice = buildReadinessAdvice({ mode: 'off' })
        assert.strictEqual(advice.suggestedMode, 'shadow')
    })

    it('suggests keep shadow when diff rate is too high', () => {
        const advice = buildReadinessAdvice({
            mode: 'shadow',
            readiness: {
                ready: false,
                reason: 'diff_rate_too_high',
                minSamples: 100,
                diffRate: 0.2,
                maxDiffRate: 0.05,
            },
        })
        assert.strictEqual(advice.suggestedMode, 'shadow')
        assert.strictEqual(advice.level, 'warn')
    })

    it('suggests on when shadow is ready', () => {
        const advice = buildReadinessAdvice({
            mode: 'shadow',
            readiness: {
                ready: true,
                reason: 'ok',
                minSamples: 100,
                diffRate: 0.01,
                maxDiffRate: 0.05,
            },
            allowlist: ['a.com'],
        })
        assert.strictEqual(advice.suggestedMode, 'on')
        assert.strictEqual(advice.level, 'success')
    })
})

