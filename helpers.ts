import { getPortPromise, setBasePort, setHighestPort } from 'portfinder';
import * as os from 'os';
import * as path from 'path';
import { readFileSync, existsSync } from 'fs';
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

export function copyHeaders(sourceReq: http.IncomingMessage, targetReq: http.ClientRequest): http.ClientRequest {
    for (const name in sourceReq.headers) {
        if (Object.hasOwnProperty.call(sourceReq.headers, name)) {
            if (name === 'origin') continue;
            const value = sourceReq.headers[name];
            if (value !== undefined) {
                targetReq.setHeader(name, value);
            }
        }
    }
    return targetReq;
}

export function resolveTargetUrl(url: string, ruleMap: RuleMap): string | null {
    const originUrlObj = new URL(url);
    const tK = Object.keys(ruleMap).find(pattern => new RegExp(pattern).test(url));
    if (!tK) return null;
    
    let urlSegment = ruleMap[tK];
    
    if (!urlSegment.startsWith('http') && !urlSegment.startsWith('ws') && !urlSegment.startsWith('file')) {
        urlSegment = originUrlObj.protocol + urlSegment;
    }

    if (urlSegment.startsWith('file://')) {
        return urlSegment;
    }

    const targetURLObj = new URL(urlSegment);

    if (!targetURLObj.port && originUrlObj.port) {
        targetURLObj.port = originUrlObj.port;
    }

    if (targetURLObj.pathname === '/' && originUrlObj.pathname !== '/') {
        targetURLObj.pathname = originUrlObj.pathname;
    }

    if (targetURLObj.search === '' && originUrlObj.search) {
        targetURLObj.search = originUrlObj.search;
    }

    const originIsWs = /^wss?:\/\//.test(url);
    const targetIsHttp = /^https?:\/\//.test(targetURLObj.toString());
    if (originIsWs && targetIsHttp) {
        targetURLObj.protocol = originUrlObj.protocol;
    }

    return targetURLObj.toString();
}

const parsedBasePort = parseInt(process.env.PORT || '', 10);
const BASE_PORT = Number.isFinite(parsedBasePort) && parsedBasePort > 0 ? parsedBasePort : 8989;

export async function getFreePort(): Promise<number> {
    const highestPort = Math.max(9999, BASE_PORT);
    setBasePort(BASE_PORT);
    setHighestPort(highestPort);
    return getPortPromise();
}

export const CONFIG_DIR = '.epconfig';
export const DEFAULT_CONFIG_PATH = path.resolve(os.homedir(), '.ep', '.eprc');

function getConfigCandidates(configDir: string, env: string): ConfigCandidate[] {
    const prefix = path.join(configDir, `.${env}`);
    return [
        { path: prefix + '.json', format: 'json' },
        { path: prefix + '.js', format: 'js' },
        { path: prefix, format: 'eprc' }
    ];
}

const IP_PATTERN = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/;
const URL_PATTERN = /^https?:\/\//;
const FILE_PATTERN = /^file:\/\//;
const LOCAL_FILE_PATTERN = /^[A-Za-z]:\\|^\/|^\\/;

export function parseEprc(content: string): RuleMap {
    return content.split(/\r?\n/).reduce((acc, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return acc;
        
        const parts = trimmed.split(/\s+/).filter(Boolean);
        if (parts.length < 2) return acc;
        
        let target: string;
        let rules: string[];
        
        if (FILE_PATTERN.test(parts[0]) || LOCAL_FILE_PATTERN.test(parts[0])) {
            [target, ...rules] = parts;
            if (!FILE_PATTERN.test(target)) {
                if (LOCAL_FILE_PATTERN.test(target)) {
                    target = 'file://' + (target.replace(/\\/g, '/'));
                }
            }
        } else if (IP_PATTERN.test(parts[0]) || URL_PATTERN.test(parts[0])) {
            [target, ...rules] = parts;
        } else {
            const reversed = [...parts].reverse();
            target = reversed[0];
            rules = reversed.slice(1);
            if (LOCAL_FILE_PATTERN.test(target)) {
                target = 'file://' + (target.replace(/\\/g, '/'));
            }
        }
        
        rules.forEach(rule => { acc[rule] = target; });
        return acc;
    }, Object.create(null) as RuleMap);
}

export function ruleMapToEprcText(ruleMap: RuleMap): string {
    const entries = Object.entries(ruleMap);
    if (entries.length === 0) return '';
    
    const byTarget: Record<string, string[]> = {};
    entries.forEach(([rule, target]) => {
        if (!byTarget[target]) byTarget[target] = [];
        byTarget[target].push(rule);
    });
    
    return Object.entries(byTarget)
        .map(([target, rules]) => {
            const targetFirst = IP_PATTERN.test(target) || URL_PATTERN.test(target) || FILE_PATTERN.test(target);
            let displayTarget = target;
            if (FILE_PATTERN.test(target)) {
                displayTarget = target.replace(/^file:\/\//, '').replace(/\//g, path.sep);
            }
            return targetFirst ? `${displayTarget} ${rules.join(' ')}` : `${rules.join(' ')} ${displayTarget}`;
        })
        .join('\n');
}

export function resolveConfigPath(): ConfigResult | null {
    const cwd = process.cwd();
    const configDir = path.join(cwd, CONFIG_DIR);
    if (!existsSync(configDir)) return null;

    const env = process.env.EP_ENV || 'eprc';
    const candidates = getConfigCandidates(configDir, env);
    for (const { path: filePath, format } of candidates) {
        if (existsSync(filePath)) {
            return { path: filePath, format };
        }
    }
    return null;
}

export function loadConfigFromFile(configPath: string, format: 'eprc' | 'json' | 'js'): RuleMap {
    try {
        if (format === 'eprc') {
            const content = readFileSync(configPath, 'utf8');
            return parseEprc(content);
        }
        if (format === 'json') {
            const content = readFileSync(configPath, 'utf8');
            const data = JSON.parse(content);
            const rules = data.rules || data;
            const result: RuleMap = {};
            for (const [key, value] of Object.entries(rules)) {
                if (Array.isArray(value)) {
                    for (const domain of value) {
                        result[domain as string] = key;
                    }
                } else if (typeof value === 'string') {
                    const trimmedValue = value.trim();
                    if (IP_PATTERN.test(trimmedValue) || URL_PATTERN.test(trimmedValue) || FILE_PATTERN.test(trimmedValue)) {
                        result[key] = value;
                    } else {
                        const domains = trimmedValue.split(/\s+/).filter(Boolean);
                        for (const domain of domains) {
                            result[domain] = key;
                        }
                    }
                }
            }
            return result;
        }
        if (format === 'js') {
            const mod = require(configPath);
            const rules = mod.rules ?? mod.default?.rules ?? mod;
            return typeof rules === 'object' && rules !== null ? rules : {};
        }
    } catch (err: any) {
        console.error('加载配置失败:', configPath, err.message);
    }
    return {};
}

/** @deprecated 使用 loadConfigFromFile */
export function loadConfig(filePath: string): RuleMap {
    const content = readFileSync(filePath, 'utf8');
    return parseEprc(content);
}
