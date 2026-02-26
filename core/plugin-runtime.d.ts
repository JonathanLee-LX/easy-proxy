import { Plugin, PluginManifest, PluginState, PluginContext, PluginManagerOptions, HookContext, ResponseContext, HookDispatcherOptions, HookDispatchOptions, HookDispatchResult, PluginStats } from './types';
export declare class PluginManager {
    private plugins;
    private pluginStates;
    private logger;
    private manifestValidator;
    constructor(options?: PluginManagerOptions);
    register(plugin: Plugin): void;
    getAll(): Plugin[];
    getState(pluginId: string): PluginState;
    setup(contextFactory: (manifest: PluginManifest) => PluginContext): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    dispose(): Promise<void>;
    private _safeLifecycleCall;
    private _assertPluginShape;
}
export declare class HookDispatcher {
    private pluginManager;
    private logger;
    private defaultTimeoutMs;
    private pluginHookStats;
    constructor(pluginManager: PluginManager, options?: HookDispatcherOptions);
    dispatch(hookName: string, hookContext: HookContext | ResponseContext, options?: HookDispatchOptions): Promise<HookDispatchResult[]>;
    getPluginStats(): Record<string, PluginStats>;
    private _getOrderedPluginsForHook;
    private _recordHookStat;
}
export declare function validateManifest(manifest: PluginManifest): void;
export declare function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
//# sourceMappingURL=plugin-runtime.d.ts.map