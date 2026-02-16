async function bootstrapPlugins(options) {
    const pluginManager = options.pluginManager
    const plugins = Array.isArray(options.plugins) ? options.plugins : []
    const contextFactory = options.contextFactory || ((manifest) => ({ manifest }))

    for (const plugin of plugins) {
        pluginManager.register(plugin)
    }
    await pluginManager.setup(contextFactory)
    await pluginManager.start()
}

module.exports = {
    bootstrapPlugins,
}

