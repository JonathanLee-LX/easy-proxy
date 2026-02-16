const zlib = require('zlib')

function safeBodyToString(buf, max, encoding) {
    if (!Buffer.isBuffer(buf) || buf.length === 0) return ''
    let content = buf
    if (encoding === 'gzip' || encoding === 'deflate' || encoding === 'br') {
        try {
            content = zlib.unzipSync(content)
        } catch (_) {
            // ignore decompression errors and use original content
        }
    }
    if (content.length > max) {
        return `(truncated, ${content.length} bytes)\n` + content.slice(0, max).toString('utf8')
    }
    try {
        return content.toString('utf8')
    } catch (_) {
        return '(binary)'
    }
}

module.exports = {
    safeBodyToString,
}

