import { Response } from './types';
import * as http from 'http';
export declare function normalizeShortResponse(response?: Partial<Response> | null): Response;
export declare function sendShortResponse(res: http.ServerResponse, response: Partial<Response> | null): void;
//# sourceMappingURL=short-response.d.ts.map