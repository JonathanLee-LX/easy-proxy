import express, { Application } from 'express'

import { registerConfigRoutes } from './config'
import { registerPluginsRoutes } from './plugins'
import { registerRulesRoutes } from './rules'
import { registerLogsRoutes } from './logs'
import { registerMocksRoutes } from './mocks'
import { registerPipelineRoutes } from './pipeline'
import { registerRefactorRoutes } from './refactor'
import { registerRuleFilesRoutes } from './rule-files'

// RuleMap type from helpers
export type RuleMap = Record<string, string>;

// Server context interface
export interface ServerContext {
    currentMocksPath: string | null
    ruleMap: RuleMap
    proxyRecordArr: Array<{
        id?: number
        method: string
        source: string
        target: string
        time: string
        statusCode?: number
        duration?: number
    }>
    proxyRecordDetailMap: Map<number, {
        requestHeaders: Record<string, string>
        requestBody?: string
        responseHeaders: Record<string, string>
        responseBody?: string
        statusCode: number
        statusMessage?: string
        method: string
        url: string
    }>
    recordIdSeq: number
    mockRules: Array<{
        id: number
        name: string
        urlPattern: string
        method: string
        statusCode: number
        delay: number
        bodyType: string
        headers: Record<string, string>
        body: string
        enabled: boolean
    }>
    mockIdSeq: number
    requestPipeline: {
        mode: string
    }
    builtinLoggerPlugin: {
        getSummary?: () => unknown
        getRecentEntries?: () => unknown[]
    }
    shadowCompareTracker: {
        reset: () => void
        getStats: () => {
            total: number
            diff: number
            diffRate: string
        }
        record: (opts: { method: string; source: string; baseTarget: string; observedTarget: string }) => boolean
    }
    onModeGate: {
        reset: () => void
        getStats: () => unknown
        shouldAllow: (host: string) => boolean
    }
    pluginManager: {
        getAll: () => Array<{
            manifest: {
                id: string
                name: string
                version: string
                hooks?: string[]
                permissions?: string[]
                priority?: number
            }
            [key: string]: unknown
        }>
        getState: (id: string) => string
    }
    hookDispatcher: {
        getPluginStats?: () => Record<string, unknown>
    }
    settingsPath: string
    epDir: string
    settings: unknown
    loadMockRules: () => void
    saveMockRules: () => void
    reloadCustomPlugins: () => Promise<unknown[]>
    logRuleMap: () => void
    reloadAllRuleFiles: () => void
    broadcastToAllClients: (data: unknown) => void
    getMockFilePath: () => string
    performConfigDiagnostics: () => {
        status: string
        checks: Array<{ name: string; status: string; path?: string; details?: unknown }>
        errors: string[]
        warnings: string[]
    }
    loadSettingsSync: () => unknown
}

/**
 * Create an Express app that handles all API routes
 * @param serverContext - The server context containing all state and helpers
 * @returns Express app as a handler function compatible with (req, res) signature
 */
export function createApp(serverContext: ServerContext): Application {
    const app = express()

    // Middleware to parse JSON bodies
    app.use(express.json({ limit: '50mb' }))
    app.use(express.urlencoded({ extended: true, limit: '50mb' }))

    // Register all API routes
    registerConfigRoutes(app, serverContext)
    registerPluginsRoutes(app, serverContext)
    registerRulesRoutes(app, serverContext)
    registerLogsRoutes(app, serverContext)
    registerMocksRoutes(app, serverContext)
    registerPipelineRoutes(app, serverContext)
    registerRefactorRoutes(app, serverContext)
    registerRuleFilesRoutes(app, serverContext)

    // Export helper references for backward compatibility
    ;(app as unknown as { serverContext: ServerContext }).serverContext = serverContext

    return app
}
