function createBuiltinPlugins(options) {
    const plugins = []
    if (options.enableMock) {
        plugins.push(options.createMockPlugin({
            findMatch: options.findMockMatch,
        }))
    }
    if (options.enableRouter) {
        plugins.push(options.createRouterPlugin({
            getRuleMap: options.getRuleMap,
        }))
    }
    if (options.enableLogger && options.loggerPlugin) {
        plugins.push(options.loggerPlugin)
    }
    return plugins
}

module.exports = {
    createBuiltinPlugins,
}

