const { resolveTargetUrl } = require('../../helpers')

function createBuiltinRouterPlugin(options) {
    const getRuleMap = options.getRuleMap
    return {
        manifest: {
            id: 'builtin.router',
            name: 'Builtin Router Plugin',
            version: '1.0.0',
            apiVersion: '1.x',
            type: 'builtin',
            permissions: ['proxy:read', 'proxy:write'],
            hooks: ['onBeforeProxy'],
            priority: 30,
        },
        async setup() {},
        onBeforeProxy(ctx) {
            const sourceUrl = ctx.request && ctx.request.url
            if (!sourceUrl) return
            const mapped = resolveTargetUrl(sourceUrl, getRuleMap())
            if (mapped) {
                ctx.setTarget(mapped)
                ctx.meta.routerMatched = true
            }
        },
    }
}

module.exports = {
    createBuiltinRouterPlugin,
}

