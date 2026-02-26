import * as zlib from 'zlib';

export function safeBodyToString(
    buf: Buffer | any, 
    max: number, 
    encoding?: string
): string {
    if (!Buffer.isBuffer(buf) || buf.length === 0) return '';
    
    let content: Buffer = buf;
    if (encoding === 'gzip' || encoding === 'deflate' || encoding === 'br') {
        try {
            content = zlib.unzipSync(content);
        } catch (_) {
            // ignore decompression errors and use original content
        }
    }
    
    if (content.length > max) {
        return `(truncated, ${content.length} bytes)\n` + content.slice(0, max).toString('utf8');
    }
    
    try {
        return content.toString('utf8');
    } catch (_) {
        return '(binary)';
    }
}
