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

describe('helpers.parseEprc - disabled rules support', () => {
  it('should ignore rules with // prefix', () => {
    const content = `
rule1 target1
//rule2 target2
rule3 target3
    `.trim()
    const map = parseEprc(content)
    assert.strictEqual(map['rule1'], 'target1')
    assert.strictEqual(map['rule2'], undefined)
    assert.strictEqual(map['rule3'], 'target3')
  })

  it('should handle mixed enabled and disabled rules', () => {
    const content = `
127.0.0.1:3000 enabled1.com enabled2.com
//127.0.0.1:3000 disabled.com
192.168.1.1 active.com
    `.trim()
    const map = parseEprc(content)
    assert.strictEqual(map['enabled1.com'], '127.0.0.1:3000')
    assert.strictEqual(map['enabled2.com'], '127.0.0.1:3000')
    assert.strictEqual(map['disabled.com'], undefined)
    assert.strictEqual(map['active.com'], '192.168.1.1')
  })

  it('should handle disabled rules with multiple domains', () => {
    const content = '//127.0.0.1:8000 api.example.com web.example.com'
    const map = parseEprc(content)
    assert.strictEqual(map['api.example.com'], undefined)
    assert.strictEqual(map['web.example.com'], undefined)
  })

  it('should handle empty content', () => {
    const map = parseEprc('')
    assert.strictEqual(Object.keys(map).length, 0)
  })

  it('should handle only disabled rules', () => {
    const content = `
//rule1 target1
//rule2 target2
    `.trim()
    const map = parseEprc(content)
    assert.strictEqual(Object.keys(map).length, 0)
    assert.strictEqual(map['rule1'], undefined)
    assert.strictEqual(map['rule2'], undefined)
  })
})

describe('helpers.ruleMapToEprcText - preserves rule format', () => {
  it('should format rules with target first for IP addresses', () => {
    const text = ruleMapToEprcText({
      'example.com': '127.0.0.1:3000',
      'api.example.com': '127.0.0.1:3000',
    })
    assert.ok(text.includes('127.0.0.1:3000'))
    assert.ok(text.includes('example.com'))
    assert.ok(text.includes('api.example.com'))
  })

  it('should format rules with target first for URLs', () => {
    const text = ruleMapToEprcText({
      'api.com': 'https://localhost:8000',
      'web.com': 'https://localhost:8000',
    })
    assert.ok(text.includes('https://localhost:8000'))
    assert.ok(text.includes('api.com'))
    assert.ok(text.includes('web.com'))
  })

  it('should handle single rule', () => {
    const text = ruleMapToEprcText({
      'single.com': '192.168.1.1',
    })
    assert.strictEqual(text.trim(), '192.168.1.1 single.com')
  })

  it('should handle empty rule map', () => {
    const text = ruleMapToEprcText({})
    assert.strictEqual(text, '')
  })
})

export {};
