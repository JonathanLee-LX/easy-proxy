import { 
    Pipeline, 
    PipelineOptions, 
    PipelineDecision, 
    PipelineResult,
    PipelineExecuteInput,
    HookContext,
    ResponseContext,
    Request,
    Response,
    PluginMode,
    Logger
} from './types';

const SUPPORTED_MODES = new Set<string>(['off', 'shadow', 'on']);

export function createPipeline(options: PipelineOptions): Pipeline {
    const pluginManager = options.pluginManager;
    const dispatcher = options.dispatcher;
    const logger = options.logger || console;
    const mode = normalizeMode(options.mode);

    return {
        mode,
        async evaluateRequest(request: Request, initialTarget: string): Promise<PipelineDecision> {
            const hookContext = createHookContext(request || {}, initialTarget);
            if (mode === 'off') {
                return {
                    target: initialTarget,
                    observedTarget: initialTarget,
                    shortCircuited: false,
                    response: null,
                    meta: hookContext.meta,
                };
            }
            await safeDispatch(dispatcher, logger, 'onRequestStart', hookContext);
            await safeDispatch(dispatcher, logger, 'onBeforeProxy', hookContext);
            if (mode === 'shadow') {
                return {
                    target: initialTarget,
                    observedTarget: hookContext.target,
                    shortCircuited: false,
                    response: null,
                    meta: hookContext.meta,
                };
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
                };
            }
            return {
                target: hookContext.target,
                observedTarget: hookContext.target,
                shortCircuited: false,
                response: null,
                meta: hookContext.meta,
            };
        },
        async execute(input: PipelineExecuteInput): Promise<PipelineResult> {
            const request = input.request || {};
            const initialTarget = input.initialTarget || request.url || '';
            if (mode === 'off') {
                return input.executeUpstream(initialTarget, {});
            }
            const decision = await this.evaluateRequest(request, initialTarget);

            if (decision.shortCircuited) {
                const shortCircuitContext = {
                    request,
                    target: decision.target,
                    meta: decision.meta,
                };
                const responseContext = createResponseContext(
                    shortCircuitContext, 
                    decision.response!
                );
                await safeDispatch(dispatcher, logger, 'onBeforeResponse', responseContext);
                await safeDispatch(dispatcher, logger, 'onAfterResponse', responseContext);
                return {
                    shortCircuited: true,
                    response: responseContext.response,
                    target: decision.target,
                    meta: decision.meta,
                };
            }

            const upstream = await input.executeUpstream(decision.target, decision.meta);
            const responseContext = createResponseContext(
                { request, target: decision.target, meta: decision.meta },
                upstream.response || upstream
            );
            await safeDispatch(dispatcher, logger, 'onBeforeResponse', responseContext);
            await safeDispatch(dispatcher, logger, 'onAfterResponse', responseContext);
            return {
                ...upstream,
                shortCircuited: false,
                target: decision.target,
                response: responseContext.response,
                meta: decision.meta,
            };
        },
        pluginManager,
    };
}

function createHookContext(request: Request, target: string): HookContext {
    return {
        request,
        target,
        meta: {},
        shortCircuited: false,
        shortCircuitResponse: null,
        setTarget(nextTarget: string): void {
            this.target = nextTarget;
        },
        respond(response: Response): void {
            this.shortCircuited = true;
            this.shortCircuitResponse = response;
        },
    };
}

function createResponseContext(
    requestContext: { request: Request; target: string; meta: Record<string, any> }, 
    response: Partial<Response>
): ResponseContext {
    return {
        request: requestContext.request,
        target: requestContext.target,
        meta: requestContext.meta,
        response: {
            statusCode: response.statusCode || 200,
            headers: response.headers || {},
            body: response.body || '',
        },
    };
}

async function safeDispatch(
    dispatcher: any, 
    logger: Logger, 
    hookName: string, 
    context: HookContext | ResponseContext
): Promise<any[]> {
    try {
        return await dispatcher.dispatch(hookName, context);
    } catch (error: any) {
        logger.error(
            `[pipeline] dispatch ${hookName} failed:`,
            error && error.message ? error.message : error
        );
        return [];
    }
}

export function normalizeMode(mode?: string): PluginMode {
    const normalized = (mode || 'off').toLowerCase();
    return SUPPORTED_MODES.has(normalized) ? (normalized as PluginMode) : 'off';
}

export { SUPPORTED_MODES };
