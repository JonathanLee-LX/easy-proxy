import { ShadowCompareEntry, ShadowCompareStats, ShadowCompareTrackerOptions } from './types';
export interface ShadowCompareTracker {
    record(entry: ShadowCompareEntry): boolean;
    getStats(): ShadowCompareStats;
    reset(): void;
}
export declare function createShadowCompareTracker(options?: ShadowCompareTrackerOptions): ShadowCompareTracker;
//# sourceMappingURL=shadow-compare.d.ts.map