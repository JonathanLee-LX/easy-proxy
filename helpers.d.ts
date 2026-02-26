import * as http from 'http';
export interface ConfigCandidate {
    path: string;
    format: 'json' | 'js' | 'eprc';
}
export interface ConfigResult {
    path: string;
    format: 'json' | 'js' | 'eprc';
}
export type RuleMap = Record<string, string>;
export declare function copyHeaders(sourceReq: http.IncomingMessage, targetReq: http.ClientRequest): http.ClientRequest;
export declare function resolveTargetUrl(url: string, ruleMap: RuleMap): string | null;
export declare function getFreePort(): Promise<number>;
export declare const CONFIG_DIR = ".epconfig";
export declare const DEFAULT_CONFIG_PATH: string;
export declare function parseEprc(content: string): RuleMap;
export declare function ruleMapToEprcText(ruleMap: RuleMap): string;
export declare function resolveConfigPath(): ConfigResult | null;
export declare function loadConfigFromFile(configPath: string, format: 'eprc' | 'json' | 'js'): RuleMap;
/** @deprecated 使用 loadConfigFromFile */
export declare function loadConfig(filePath: string): RuleMap;
//# sourceMappingURL=helpers.d.ts.map