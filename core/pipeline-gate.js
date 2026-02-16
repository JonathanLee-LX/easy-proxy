const { shouldUsePluginMock } = require('./mock-gate')

function createPipelineGate(options) {
    const requestPipeline = options.requestPipeline
    const onModeGate = options.onModeGate
    const enableBuiltinMockPlugin = !!options.enableBuiltinMockPlugin

    function shouldApplyPipelineOnForSource(source) {
        return onModeGate.shouldApply(source)
    }

    function canUsePipelineExecuteForSource(source) {
        if (requestPipeline.mode === 'off') return false
        if (requestPipeline.mode === 'shadow') return true
        return shouldApplyPipelineOnForSource(source)
    }

    function shouldUsePluginMockForRequest(source, rule) {
        return shouldUsePluginMock({
            enabled: enableBuiltinMockPlugin,
            mode: requestPipeline.mode,
            source,
            rule,
            shouldApplyOn: shouldApplyPipelineOnForSource,
        })
    }

    return {
        shouldApplyPipelineOnForSource,
        canUsePipelineExecuteForSource,
        shouldUsePluginMockForRequest,
    }
}

module.exports = {
    createPipelineGate,
}

