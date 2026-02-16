function createBuiltinLoggerPlugin(options = {}) {
    const maxEntries = typeof options.maxEntries === 'number' ? options.maxEntries : 1000
    const entries = []
    const counters = {
        totalResponses: 0,
        totalErrors: 0,
        byMethod: Object.create(null),
        byStatusBucket: {
            '2xx': 0,
            '3xx': 0,
            '4xx': 0,
            '5xx': 0,
            other: 0,
        },
        duration: {
            min: null,
            max: null,
            sum: 0,
        },
    }

    return {
        manifest: {
            id: 'builtin.logger',
            name: 'Builtin Logger Plugin',
            version: '1.0.0',
            apiVersion: '1.x',
            type: 'builtin',
            permissions: ['proxy:read', 'storage:write'],
            hooks: ['onRequestStart', 'onAfterResponse', 'onError'],
            priority: 90,
        },
        async setup() {},
        onRequestStart(ctx) {
            ctx.meta._pluginRequestStartAt = Date.now()
        },
        onAfterResponse(ctx) {
            const startAt = ctx.meta._pluginRequestStartAt || Date.now()
            const duration = Date.now() - startAt
            const statusCode = ctx.response.statusCode
            const method = String(ctx.request.method || 'UNKNOWN').toUpperCase()
            entries.push({
                type: 'response',
                method,
                url: ctx.request.url,
                statusCode,
                duration,
                ts: Date.now(),
            })
            counters.totalResponses += 1
            counters.byMethod[method] = (counters.byMethod[method] || 0) + 1
            const bucket = statusToBucket(statusCode)
            counters.byStatusBucket[bucket] += 1
            counters.duration.sum += duration
            counters.duration.min = counters.duration.min == null ? duration : Math.min(counters.duration.min, duration)
            counters.duration.max = counters.duration.max == null ? duration : Math.max(counters.duration.max, duration)
            if (entries.length > maxEntries) entries.shift()
        },
        onError(ctx) {
            entries.push({
                type: 'error',
                phase: ctx.phase,
                message: ctx.error ? ctx.error.message : 'unknown',
                ts: Date.now(),
            })
            counters.totalErrors += 1
            if (entries.length > maxEntries) entries.shift()
        },
        getRecentEntries() {
            return entries.slice()
        },
        getSummary() {
            return {
                totalResponses: counters.totalResponses,
                totalErrors: counters.totalErrors,
                byMethod: { ...counters.byMethod },
                byStatusBucket: { ...counters.byStatusBucket },
                avgDuration: counters.totalResponses > 0
                    ? Number((counters.duration.sum / counters.totalResponses).toFixed(2))
                    : 0,
                minDuration: counters.duration.min,
                maxDuration: counters.duration.max,
            }
        },
    }
}

function statusToBucket(statusCode) {
    if (statusCode >= 200 && statusCode < 300) return '2xx'
    if (statusCode >= 300 && statusCode < 400) return '3xx'
    if (statusCode >= 400 && statusCode < 500) return '4xx'
    if (statusCode >= 500 && statusCode < 600) return '5xx'
    return 'other'
}

module.exports = {
    createBuiltinLoggerPlugin,
}

