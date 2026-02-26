import { RefactorConfig, RefactorConfigDeps } from './types';
export declare function parseBool(value: any, fallback: boolean): boolean;
export declare function parseIntSafe(value: any, fallback: number): number;
export declare function parseFloatSafe(value: any, fallback: number): number;
export declare function buildRefactorConfig(env: NodeJS.ProcessEnv, deps: RefactorConfigDeps): RefactorConfig;
//# sourceMappingURL=refactor-config.d.ts.map