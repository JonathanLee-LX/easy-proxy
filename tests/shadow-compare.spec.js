const assert = require('assert')
const { createShadowCompareTracker } = require('../core/shadow-compare')

describe('shadow compare tracker', () => {
    it('records same and diff counts', () => {
        const tracker = createShadowCompareTracker({ maxSamples: 2 })
        const a = tracker.record({
            source: 'https://a.com',
            baseTarget: 'https://a.com',
            observedTarget: 'https://a.com',
        })
        const b = tracker.record({
            source: 'https://b.com',
            baseTarget: 'https://a.com',
            observedTarget: 'https://b.com',
        })
        assert.strictEqual(a, false)
        assert.strictEqual(b, true)

        const stats = tracker.getStats()
        assert.strictEqual(stats.total, 2)
        assert.strictEqual(stats.same, 1)
        assert.strictEqual(stats.diff, 1)
        assert.strictEqual(stats.diffRate, 0.5)
        assert.strictEqual(stats.samples.length, 1)
        assert.strictEqual(stats.uniqueDiffPairs, 1)
        assert.strictEqual(stats.topDiffs.length, 1)
        assert.strictEqual(stats.topDiffs[0].count, 1)
    })

    it('keeps only latest diff samples by maxSamples', () => {
        const tracker = createShadowCompareTracker({ maxSamples: 2 })
        tracker.record({ source: '1', baseTarget: 'a', observedTarget: 'b' })
        tracker.record({ source: '2', baseTarget: 'a', observedTarget: 'c' })
        tracker.record({ source: '3', baseTarget: 'a', observedTarget: 'd' })

        const stats = tracker.getStats()
        assert.strictEqual(stats.samples.length, 2)
        assert.strictEqual(stats.samples[0].source, '2')
        assert.strictEqual(stats.samples[1].source, '3')
    })

    it('aggregates repeated diff pairs into topDiffs', () => {
        const tracker = createShadowCompareTracker({ maxSamples: 10, maxTopDiffs: 3 })
        tracker.record({ source: '1', baseTarget: 'a', observedTarget: 'b' })
        tracker.record({ source: '2', baseTarget: 'a', observedTarget: 'b' })
        tracker.record({ source: '3', baseTarget: 'a', observedTarget: 'c' })

        const stats = tracker.getStats()
        assert.strictEqual(stats.uniqueDiffPairs, 2)
        assert.strictEqual(stats.topDiffs[0].baseTarget, 'a')
        assert.strictEqual(stats.topDiffs[0].observedTarget, 'b')
        assert.strictEqual(stats.topDiffs[0].count, 2)
    })

    it('supports reset', () => {
        const tracker = createShadowCompareTracker()
        tracker.record({ source: '1', baseTarget: 'a', observedTarget: 'b' })
        tracker.reset()
        const stats = tracker.getStats()
        assert.strictEqual(stats.total, 0)
        assert.strictEqual(stats.diff, 0)
        assert.strictEqual(stats.uniqueDiffPairs, 0)
        assert.strictEqual(stats.samples.length, 0)
    })
})

