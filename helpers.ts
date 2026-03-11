import { getPortPromise, setBasePort, setHighestPort } from 'portfinder';
import * as os from 'os';
import * as path from 'path';
import { readFileSync } from 'fs';
import * as http from 'http';

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

    // [marker] path rewrite: find marker in original URL, take everything after it as tail
    const bracketMatch = urlSegment.match(/\[([^\]]+)\]/);
    if (bracketMatch) {
        const marker = bracketMatch[1];
        const markerIdx = url.indexOf(marker);
        const before = urlSegment.substring(0, bracketMatch.index!);
        const after = urlSegment.substring(bracketMatch.index! + bracketMatch[0].length);
        if (markerIdx !== -1) {
            const tail = url.substring(markerIdx + marker.length);
            urlSegment = (before + tail + after).replace(/([^:])\/\//g, '$1/');
        } else {
            urlSegment = before + after;
        }
    }

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

export const ROUTE_RULES_DIR = path.resolve(os.homedir(), '.ep', 'route-rules');

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
        
        rules.forEach(rule => {
            const bm = rule.match(/\[([^\]]+)\]/);
            if (bm) {
                acc[rule.replace(bm[0], bm[1])] = target + bm[0];
            } else {
                acc[rule] = target;
            }
        });
        return acc;
    }, Object.create(null) as RuleMap);
}

export function ruleMapToEprcText(ruleMap: RuleMap): string {
    const entries = Object.entries(ruleMap);
    if (entries.length === 0) return '';
    
    const byTarget: Record<string, string[]> = {};
    entries.forEach(([rule, target]) => {
        const bm = target.match(/\[([^\]]+)\]/);
        const groupKey = bm ? target.replace(bm[0], '') : target;
        const displayRule = bm ? rule.replace(bm[1], bm[0]) : rule;
        if (!byTarget[groupKey]) byTarget[groupKey] = [];
        byTarget[groupKey].push(displayRule);
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

export function loadRulesFromTextFile(filePath: string): RuleMap {
    try {
        const content = readFileSync(filePath, 'utf8');
        return parseEprc(content);
    } catch (err: any) {
        console.error('加载规则文件失败:', filePath, err.message);
    }
    return {};
}
