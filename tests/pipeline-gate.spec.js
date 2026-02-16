const assert = require('assert')
const { createPipelineGate } = require('../core/pipeline-gate')

describe('pipeline-gate createPipelineGate', () => {
    it('uses onModeGate for on mode and allows shadow mode by default', () => {
        let checked = 0
        const gate = createPipelineGate({
            requestPipeline: { mode: 'shadow' },
            onModeGate: {
                shouldApply() {
                    checked += 1
                    return true
                },
            },
            enableBuiltinMockPlugin: true,
        })
        assert.strictEqual(gate.canUsePipelineExecuteForSource('https://a.com'), true)
        assert.strictEqual(checked, 0)
    })

    it('delegates on-mode host check to onModeGate', () => {
        const gate = createPipelineGate({
            requestPipeline: { mode: 'on' },
            onModeGate: { shouldApply: () => false },
            enableBuiltinMockPlugin: true,
        })
        assert.strictEqual(gate.shouldApplyPipelineOnForSource('https://a.com'), false)
        assert.strictEqual(gate.canUsePipelineExecuteForSource('https://a.com'), false)
    })

    it('checks mock takeover through unified gate', () => {
        const gate = createPipelineGate({
            requestPipeline: { mode: 'on' },
            onModeGate: { shouldApply: () => true },
            enableBuiltinMockPlugin: true,
        })
        assert.strictEqual(
            gate.shouldUsePluginMockForRequest('https://a.com', { bodyType: 'inline' }),
            true
        )
        assert.strictEqual(
            gate.shouldUsePluginMockForRequest('https://a.com', { bodyType: 'file' }),
            false
        )
    })
})

