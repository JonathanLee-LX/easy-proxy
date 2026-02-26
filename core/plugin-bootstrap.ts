import { BootstrapPluginsOptions, PluginManifest, PluginContext } from './types';

export async function bootstrapPlugins(options: BootstrapPluginsOptions): Promise<void> {
    const pluginManager = options.pluginManager;
    const plugins = Array.isArray(options.plugins) ? options.plugins : [];
    const contextFactory = options.contextFactory || ((manifest: PluginManifest): PluginContext => ({ manifest }));

    for (const plugin of plugins) {
        pluginManager.register(plugin);
    }
    await pluginManager.setup(contextFactory);
    await pluginManager.start();
}
