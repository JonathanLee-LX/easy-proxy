import zlib from 'zlib'
import { describe, it, expect } from 'vitest'
import { safeBodyToString } from '../core/body-utils'

describe('body-utils safeBodyToString', () => {
    it('returns empty for empty buffer', () => {
        expect(safeBodyToString(Buffer.from(''), 100)).toBe('')
    })

    it('returns utf8 string for plain buffer', () => {
        expect(safeBodyToString(Buffer.from('hello'), 100)).toBe('hello')
    })

    it('decompresses gzip buffer', () => {
        const gz = zlib.gzipSync(Buffer.from('abc'))
        expect(safeBodyToString(gz, 100, 'gzip')).toBe('abc')
    })

    it('returns truncated marker when exceeds max', () => {
        const text = 'x'.repeat(20)
        const result = safeBodyToString(Buffer.from(text), 5)
        expect(result.startsWith('(truncated, 20 bytes)')).toBeTruthy()
    })
})
