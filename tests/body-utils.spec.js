const assert = require('assert')
const zlib = require('zlib')
const { safeBodyToString } = require('../core/body-utils')

describe('body-utils safeBodyToString', () => {
    it('returns empty for empty buffer', () => {
        assert.strictEqual(safeBodyToString(Buffer.from(''), 100), '')
    })

    it('returns utf8 string for plain buffer', () => {
        assert.strictEqual(safeBodyToString(Buffer.from('hello'), 100), 'hello')
    })

    it('decompresses gzip buffer', () => {
        const gz = zlib.gzipSync(Buffer.from('abc'))
        assert.strictEqual(safeBodyToString(gz, 100, 'gzip'), 'abc')
    })

    it('returns truncated marker when exceeds max', () => {
        const text = 'x'.repeat(20)
        const result = safeBodyToString(Buffer.from(text), 5)
        assert.ok(result.startsWith('(truncated, 20 bytes)'))
    })
})

