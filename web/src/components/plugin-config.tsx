import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plug, PlayCircle, StopCircle } from 'lucide-react'

interface Plugin {
  name: string
  status: 'running' | 'stopped'
  description?: string
}

interface ThirdPartyPlugin {
  name: string
  url: string
  loaded: boolean
}

interface PluginConfigProps {
  plugins: Plugin[]
  pluginMode: string
  fetchPlugins: () => Promise<void>
  startPlugin: (name: string) => Promise<boolean>
  stopPlugin: (name: string) => Promise<boolean>
  thirdPartyPlugins: ThirdPartyPlugin[]
  thirdPartySecurity: any
  fetchThirdPartyPlugins: () => Promise<void>
  loadThirdPartyPlugin: (url: string) => Promise<boolean>
  unloadThirdPartyPlugin: (name: string) => Promise<boolean>
}

export function PluginConfig({
  plugins,
  pluginMode,
  fetchPlugins,
  startPlugin,
  stopPlugin,
  thirdPartyPlugins,
  thirdPartySecurity,
  fetchThirdPartyPlugins,
  loadThirdPartyPlugin,
  unloadThirdPartyPlugin,
}: PluginConfigProps) {
  useEffect(() => {
    fetchPlugins()
    fetchThirdPartyPlugins()
  }, [])

  const handleTogglePlugin = async (name: string, isRunning: boolean) => {
    if (isRunning) {
      await stopPlugin(name)
    } else {
      await startPlugin(name)
    }
    await fetchPlugins()
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Plug className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">内置插件</h2>
        </div>
        
        {plugins.length === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-md p-8 text-center">
            暂无内置插件
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>插件名称</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plugins.map((plugin) => (
                  <TableRow key={plugin.name}>
                    <TableCell className="font-medium">{plugin.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {plugin.description || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plugin.status === 'running' ? 'default' : 'secondary'}>
                        {plugin.status === 'running' ? '运行中' : '已停止'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTogglePlugin(plugin.name, plugin.status === 'running')}
                      >
                        {plugin.status === 'running' ? (
                          <>
                            <StopCircle className="h-4 w-4 mr-1" />
                            停止
                          </>
                        ) : (
                          <>
                            <PlayCircle className="h-4 w-4 mr-1" />
                            启动
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Plug className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">第三方插件</h2>
        </div>
        
        {thirdPartyPlugins.length === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-md p-8 text-center">
            暂无第三方插件
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>插件名称</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {thirdPartyPlugins.map((plugin) => (
                  <TableRow key={plugin.name}>
                    <TableCell className="font-medium">{plugin.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {plugin.url}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plugin.loaded ? 'default' : 'secondary'}>
                        {plugin.loaded ? '已加载' : '未加载'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (plugin.loaded) {
                            await unloadThirdPartyPlugin(plugin.name)
                          } else {
                            await loadThirdPartyPlugin(plugin.url)
                          }
                          await fetchThirdPartyPlugins()
                        }}
                      >
                        {plugin.loaded ? '卸载' : '加载'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
