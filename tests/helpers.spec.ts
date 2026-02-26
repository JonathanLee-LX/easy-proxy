const assert = require('assert')
const path = require('path')
const { execFileSync } = require('child_process')
const {
  parseEprc,
  ruleMapToEprcText,
  resolveTargetUrl,
} = require('../dist/helpers')

describe('helpers.parseEprc', () => {
  it('parses target-first host format', () => {
    const content = '127.0.0.1 a.com b.com'
    const map = parseEprc(content)
    assert.strictEqual(map['a.com'], '127.0.0.1')
    assert.strictEqual(map['b.com'], '127.0.0.1')
  })

  it('parses rule-first format', () => {
    const content = 'a.com b.com 10.0.0.1:8080'
    const map = parseEprc(content)
    assert.strictEqual(map['a.com'], '10.0.0.1:8080')
    assert.strictEqual(map['b.com'], '10.0.0.1:8080')
  })

  it('ignores blank and commented lines', () => {
    const content = `
# comment
// disabled line

127.0.0.1 valid.com
`
    const map = parseEprc(content)
    assert.strictEqual(map['valid.com'], '127.0.0.1')
    assert.strictEqual(map['disabled'], undefined)
  })
})

describe('helpers.ruleMapToEprcText', () => {
  it('groups same target in one line', () => {
    const text = ruleMapToEprcText({
      'a.com': '127.0.0.1',
      'b.com': '127.0.0.1',
      'c.com': '10.0.0.2',
    })
    const lines = text.split('\n').sort()
    assert.ok(lines.includes('127.0.0.1 a.com b.com') || lines.includes('127.0.0.1 b.com a.com'))
    assert.ok(lines.includes('10.0.0.2 c.com'))
  })
})

describe('helpers.resolveTargetUrl', () => {
  it('returns null when no rule matches', () => {
    const target = resolveTargetUrl('https://a.com/path', {})
    assert.strictEqual(target, null)
  })

  it('keeps path and query when target only has host', () => {
    const target = resolveTargetUrl('https://a.com/foo/bar?q=1', {
      'a\\.com': '127.0.0.1:8080',
    })
    assert.strictEqual(target, 'https://127.0.0.1:8080/foo/bar?q=1')
  })

  it('keeps origin port when target has no port', () => {
    const target = resolveTargetUrl('https://a.com:9443/foo', {
      'a\\.com': 'http://127.0.0.1/bar',
    })
    assert.strictEqual(target, 'http://127.0.0.1:9443/bar')
  })

  it('converts http target scheme to ws for websocket source', () => {
    const target = resolveTargetUrl('wss://a.com/socket?x=1', {
      'a\\.com': 'https://127.0.0.1:8080/socket',
    })
    assert.strictEqual(target, 'wss://127.0.0.1:8080/socket?x=1')
  })
})

describe('helpers.getFreePort', () => {
  it('supports base port larger than 9999', () => {
    const script = `
      const { getFreePort } = require('./dist/helpers')
      getFreePort().then((port) => {
        process.stdout.write(String(port))
      }).catch((err) => {
        process.stderr.write(String(err && err.message ? err.message : err))
        process.exit(1)
      })
    `
    const output = execFileSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PORT: '18989' },
      encoding: 'utf8',
    }).trim()
    assert.ok(Number(output) >= 18989)
  })
})

export {};
