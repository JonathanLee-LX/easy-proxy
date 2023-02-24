const { resolveTargetUrl } = require('../helpers')
const assert = require('assert')

describe('Test resolveTargetUrl function.', function () {
    it('should replace hostname only.', function () {
        assert.equal(resolveTargetUrl('https://a.com', {
            '^https://a.com': '127.0.0.1'
        }), 'https://127.0.0.1/')
    });

    it('should replace hostname and port.', function () {
        assert.equal(resolveTargetUrl('https://a.com', {
            '^https://a.com': '127.0.0.1:8082'
        }), 'https://127.0.0.1:8082/')
    })

    it('should replace hostname, port and pathname.', () => {
        assert.equal(resolveTargetUrl('https://a.com', {
            '^https://a.com': '127.0.0.1:8082/a'
        }), 'https://127.0.0.1:8082/a')
    })

    it('should replace protocol.', () => {
        assert.equal(resolveTargetUrl('https://a.com/a', {
            '^https://a.com/a': 'http://127.0.0.1:8082/a'
        }), 'http://127.0.0.1:8082/a')
    })

    it('should replace protocol and pathname.', () => {
        assert.equal(resolveTargetUrl('https://a.com:1234/a', {
            '^https://a.com:1234/a': 'http://127.0.0.1:8082/b'
        }), 'http://127.0.0.1:8082/b')
    })

    it('should replace hostname, port and pathname.', () => {
        assert(resolveTargetUrl('https://a.com:1234/a', {
            '^https://a.com:1234/a': 'http://127.0.0.1/b'
        }) === 'http://127.0.0.1:1234/b')
    })

    it('should replace protocol, hostname, port, and search.', () => {
        assert(resolveTargetUrl('https://a.com:1234/a?foo=bar', {
            '^https://a.com:1234/a': 'http://127.0.0.1/b'
        }) === 'http://127.0.0.1:1234/b?foo=bar')
    })

    it('should resolve ws(s) url.', () => {
        assert.equal(resolveTargetUrl('wss://a.com/sock', {
            '^wss?://a.com': '127.0.0.1'
        }), 'wss://127.0.0.1/sock')
    })

    it('should resolve ws(s) url with rewrite protocol rule.', () => {
        assert.equal(resolveTargetUrl('wss://a.com/sock', {
            '^wss?://a.com': 'ws://127.0.0.1'
        }), 'ws://127.0.0.1/sock')
    })

    it('should resolve ws(s) url with rewrite pathname rule.', () => {
        assert.equal(resolveTargetUrl('wss://a.com/sock', {
            '^wss?://a.com': '127.0.0.1/hmr'
        }), 'wss://127.0.0.1/hmr')
    })
});