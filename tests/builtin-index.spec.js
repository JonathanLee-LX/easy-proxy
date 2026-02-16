const assert = require('assert')
const { createBuiltinPlugins } = require('../plugins/builtin')

describe('plugins/builtin createBuiltinPlugins', () => {
    it('builds plugin list based on enable flags', () => {
        const logger = { id: 'logger' }
        const plugins = createBuiltinPlugins({
            enableMock: true,
            enableRouter: false,
            enableLogger: true,
            createMockPlugin: () => ({ id: 'mock' }),
            createRouterPlugin: () => ({ id: 'router' }),
            findMockMatch: () => null,
            getRuleMap: () => ({}),
            loggerPlugin: logger,
        })
        assert.strictEqual(plugins.length, 2)
        assert.strictEqual(plugins[0].id, 'mock')
        assert.strictEqual(plugins[1], logger)
    })
})

