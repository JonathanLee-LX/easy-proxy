function createBuiltinMockPlugin(options) {
    const findMatch = options.findMatch
    return {
        manifest: {
            id: 'builtin.mock',
            name: 'Builtin Mock Plugin',
            version: '1.0.0',
            apiVersion: '1.x',
            type: 'builtin',
            permissions: ['proxy:read', 'response:shortcircuit'],
            hooks: ['onBeforeProxy'],
            priority: 20,
        },
        async setup() {},
        async onBeforeProxy(ctx) {
            if (!ctx || !ctx.request) return
            const rule = findMatch(ctx.request.url, ctx.request.method)
            if (!rule) return
            if (rule.bodyType && rule.bodyType !== 'inline') return

            const delay = Number(rule.delay || 0)
            if (delay > 0) {
                await new Promise((resolve) => setTimeout(resolve, delay))
            }

            ctx.meta.mockRuleId = rule.id
            ctx.meta.mockRuleName = rule.name || ''
            ctx.respond({
                statusCode: rule.statusCode || 200,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mock-Rule': encodeURIComponent(rule.name || String(rule.id || '')),
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': '*',
                    'Access-Control-Allow-Headers': '*',
                    ...(rule.headers || {}),
                },
                body: rule.body || '',
            })
        },
    }
}

module.exports = {
    createBuiltinMockPlugin,
}

