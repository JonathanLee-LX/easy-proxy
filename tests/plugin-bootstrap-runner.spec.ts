import { describe, it, expect } from 'vitest'
import { createPluginBootstrapRunner } from '../core/plugin-bootstrap-runner'

describe('plugin-bootstrap-runner createPluginBootstrapRunner', () => {
    function makeCtx(overrides: any = {}) {
        return {
            epDir: '/tmp/ep-pbr-test',
            settingsPath: '/tmp/ep-pbr-test/settings.json',
            ENABLE_BUILTIN_MOCK_PLUGIN: false,
            ENABLE_BUILTIN_ROUTER_PLUGIN: false,
            ENABLE_BUILTIN_LOGGER_PLUGIN: false,
            builtinLoggerPlugin: { manifest: { id: 'builtin-logger' } },
            pluginManager: {
                register: () => {},
                getState: () => 'unknown',
                setState: () => {},
            },
            ruleMap: {},
            ...overrides,
        }
    }

    function makeMockHandler() {
        return {
            matchMockRule: () => null,
            getMockFilePath: () => '/tmp/mocks.json',
            loadMockRules: () => {},
            saveMockRules: () => {},
            buildMockResponseForTest: () => ({ statusCode: 200, headers: {}, body: '' }),
            sendMockResponse: () => {},
            loadCustomPathsFromSettings: () => ({ mocksFilePath: null }),
        }
    }

    it('returns an object with bootstrapBuiltinPlugins and reloadCustomPlugins', () => {
        const ctx = makeCtx()
        const runner = createPluginBootstrapRunner(ctx, makeMockHandler())
        expect(typeof runner.bootstrapBuiltinPlugins).toBe('function')
        expect(typeof runner.reloadCustomPlugins).toBe('function')
    })

    it('reloadCustomPlugins returns a promise', async () => {
        const ctx = makeCtx()
        const runner = createPluginBootstrapRunner(ctx, makeMockHandler())
        const result = runner.reloadCustomPlugins()
        expect(result instanceof Promise).toBeTruthy()
        const plugins = await result
        expect(Array.isArray(plugins)).toBeTruthy()
    })
})
