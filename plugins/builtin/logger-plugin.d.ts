import { Plugin, LoggerPluginOptions, LoggerEntry, LoggerSummary } from '../../core/types';
interface LoggerPlugin extends Plugin {
    getRecentEntries(): LoggerEntry[];
    getSummary(): LoggerSummary;
}
export declare function createBuiltinLoggerPlugin(options?: LoggerPluginOptions): LoggerPlugin;
export {};
//# sourceMappingURL=logger-plugin.d.ts.map