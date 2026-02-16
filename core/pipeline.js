const SUPPORTED_MODES = new Set(['off', 'shadow', 'on'])

function createPipeline(options) {
    const pluginManager = options.pluginManager
    const dispatcher = options.dispatcher
    const logger = options.logger || console
    const mode = normalizeMode(options.mode)

    return {
        mode,
        async evaluateRequest(request, initialTarget) {
            const hookContext = createHookContext(request || {}, initialTarget)
            if (mode === 'off') {
                return {
                    target: initialTarget,
                    observedTarget: initialTarget,
                    shortCircuited: false,
                    response: null,
                    meta: hookContext.meta,
                }
            }
            await safeDispatch(dispatcher, logger, 'onRequestStart', hookContext)
            await safeDispatch(dispatcher, logger, 'onBeforeProxy', hookContext)
            if (mode === 'shadow') {
                return {
                    target: initialTarget,
                    observedTarget: hookContext.target,
                    shortCircuited: false,
                    response: null,
                    meta: hookContext.meta,
                }
            }
            if (hookContext.shortCircuited) {
                return {
                    target: hookContext.target,
                    observedTarget: hookContext.target,
                    shortCircuited: true,
                    response: hookContext.shortCircuitResponse || {
                        statusCode: 200,
                        headers: {},
                        body: '',
                    },
                    meta: hookContext.meta,
                }
            }
            return {
                target: hookContext.target,
                observedTarget: hookContext.target,
                shortCircuited: false,
                response: null,
                meta: hookContext.meta,
            }
        },
        async execute(input) {
            const request = input.request || {}
            const initialTarget = input.initialTarget || request.url
            if (mode === 'off') {
                return input.executeUpstream(initialTarget, {})
            }
            const decision = await this.evaluateRequest(request, initialTarget)

            if (decision.shortCircuited) {
                const shortCircuitContext = {
                    request,
                    target: decision.target,
                    meta: decision.meta,
                }
                const responseContext = createResponseContext(shortCircuitContext, decision.response)
                await safeDispatch(dispatcher, logger, 'onBeforeResponse', responseContext)
                await safeDispatch(dispatcher, logger, 'onAfterResponse', responseContext)
                return {
                    shortCircuited: true,
                    response: responseContext.response,
                    target: decision.target,
                    meta: decision.meta,
                }
            }

            const upstream = await input.executeUpstream(decision.target, decision.meta)
            const responseContext = createResponseContext(
                { request, target: decision.target, meta: decision.meta },
                upstream.response || upstream
            )
            await safeDispatch(dispatcher, logger, 'onBeforeResponse', responseContext)
            await safeDispatch(dispatcher, logger, 'onAfterResponse', responseContext)
            return {
                ...upstream,
                shortCircuited: false,
                target: decision.target,
                response: responseContext.response,
                meta: decision.meta,
            }
        },
        pluginManager,
    }
}

function createHookContext(request, target) {
    return {
        request,
        target,
        meta: {},
        shortCircuited: false,
        shortCircuitResponse: null,
        setTarget(nextTarget) {
            this.target = nextTarget
        },
        respond(response) {
            this.shortCircuited = true
            this.shortCircuitResponse = response
        },
    }
}

function createResponseContext(requestContext, response) {
    return {
        request: requestContext.request,
        target: requestContext.target,
        meta: requestContext.meta,
        response: {
            statusCode: response.statusCode || 200,
            headers: response.headers || {},
            body: response.body || '',
        },
    }
}

async function safeDispatch(dispatcher, logger, hookName, context) {
    try {
        return await dispatcher.dispatch(hookName, context)
    } catch (error) {
        logger.error(
            `[pipeline] dispatch ${hookName} failed:`,
            error && error.message ? error.message : error
        )
        return []
    }
}

function normalizeMode(mode) {
    const normalized = (mode || 'off').toLowerCase()
    return SUPPORTED_MODES.has(normalized) ? normalized : 'off'
}

module.exports = {
    createPipeline,
    normalizeMode,
    SUPPORTED_MODES,
}

