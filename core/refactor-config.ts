import { RefactorConfig, RefactorConfigDeps } from './types';

export function parseBool(value: any, fallback: boolean): boolean {
    if (value == null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

export function parseIntSafe(value: any, fallback: number): number {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

export function parseFloatSafe(value: any, fallback: number): number {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}

export function buildRefactorConfig(
    env: NodeJS.ProcessEnv, 
    deps: RefactorConfigDeps
): RefactorConfig {
    const normalizeMode = deps.normalizeMode;
    const parseHostAllowlist = deps.parseHostAllowlist;

    const pluginMode = normalizeMode(env.EP_PLUGIN_MODE || 'off');
    const shadowWarnMinSamples = parseIntSafe(env.EP_SHADOW_WARN_MIN_SAMPLES, 200);
    const shadowWarnDiffRate = parseFloatSafe(env.EP_SHADOW_WARN_DIFF_RATE, 0.05);
    const pluginOnHosts = parseHostAllowlist(env.EP_PLUGIN_ON_HOSTS || '');
    const enableBuiltinRouter = parseBool(env.EP_ENABLE_BUILTIN_ROUTER, true);
    const enableBuiltinLogger = parseBool(env.EP_ENABLE_BUILTIN_LOGGER, true);
    const enableBuiltinMock = parseBool(env.EP_ENABLE_BUILTIN_MOCK, false);

    return {
        pluginMode,
        shadowWarnMinSamples,
        shadowWarnDiffRate,
        pluginOnHosts,
        enableBuiltinRouter,
        enableBuiltinLogger,
        enableBuiltinMock,
    };
}
