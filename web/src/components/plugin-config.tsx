import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Play, Square, Loader2, Shield, ShieldAlert } from 'lucide-react'
import type { Plugin } from '@/types'

interface PluginConfigProps {
  // 插件列表相关
  plugins: Plugin[]
  pluginMode: 'on' | 'off' | 'shadow'
  fetchPlugins: () => Promise<void>
  startPlugin: (id: string) => Promise<void>
  stopPlugin: (id: string) => Promise<void>
  // 第三方插件相关
  thirdPartyPlugins: Plugin[]
  thirdPartySecurity: { allowAll: boolean; trusted: string[] }
  fetchThirdPartyPlugins: () => Promise<void>
  loadThirdPartyPlugin: (path: string) => Promise<void>
  unloadThirdPartyPlugin: (id: string) => Promise<void>
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
  const [loading, setLoading] = useState(false)
  const [thirdPartyPath, setThirdPartyPath] = useState('')
  const [loadingThirdParty, setLoadingThirdParty] = useState(false)

  useEffect(() => {
    fetchPlugins()
    fetchThirdPartyPlugins()
  }, [fetchPlugins, fetchThirdPartyPlugins])

  const handleStartPlugin = async (id: string) => {
    setLoading(true)
    try {
      await startPlugin(id)
      await fetchPlugins()
    } finally {
      setLoading(false)
    }
  }

  const handleStopPlugin = async (id: string) => {
    setLoading(true)
    try {
      await stopPlugin(id)
      await fetchPlugins()
    } finally {
      setLoading(false)
    }
  }

  const handleLoadThirdParty = async () => {
    if (!thirdPartyPath.trim()) return
    setLoadingThirdParty(true)
    try {
      await loadThirdPartyPlugin(thirdPartyPath)
      setThirdPartyPath('')
      await fetchThirdPartyPlugins()
    } finally {
      setLoadingThirdParty(false)
    }
  }

  const handleUnloadThirdParty = async (id: string) => {
    setLoadingThirdParty(true)
    try {
      await unloadThirdPartyPlugin(id)
      await fetchThirdPartyPlugins()
    } finally {
      setLoadingThirdParty(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Built-in Plugins */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">内置插件</h3>
          <Badge variant="outline">模式: {pluginMode}</Badge>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>Hooks</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plugins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    暂无内置插件
                  </TableCell>
                </TableRow>
              ) : (
                plugins.map((plugin) => (
                  <TableRow key={plugin.id}>
                    <TableCell className="font-medium">{plugin.name}</TableCell>
                    <TableCell>{plugin.version}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {plugin.hooks.map((hook) => (
                          <Badge key={hook} variant="secondary" className="text-xs">
                            {hook}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={plugin.state === 'running' ? 'default' : 'secondary'}>
                        {plugin.state}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {plugin.state === 'running' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStopPlugin(plugin.id)}
                          disabled={loading}
                        >
                          <Square className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartPlugin(plugin.id)}
                          disabled={loading}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Third-party Plugins */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">第三方插件</h3>
          <div className="flex items-center gap-2">
            {thirdPartySecurity.allowAll ? (
              <Shield className="h-4 w-4 text-green-500" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-yellow-500" />
            )}
            <span className="text-xs text-muted-foreground">
              {thirdPartySecurity.allowAll ? '已信任所有插件' : `已信任: ${thirdPartySecurity.trusted.length} 个`}
            </span>
          </div>
        </div>
        <div className="flex gap-2 mb-4">
          <Input
            value={thirdPartyPath}
            onChange={(e) => setThirdPartyPath(e.target.value)}
            placeholder="输入插件路径..."
            className="flex-1"
          />
          <Button onClick={handleLoadThirdParty} disabled={loadingThirdParty || !thirdPartyPath.trim()}>
            {loadingThirdParty ? <Loader2 className="h-4 w-4 animate-spin" /> : '加载'}
          </Button>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {thirdPartyPlugins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    暂无第三方插件
                  </TableCell>
                </TableRow>
              ) : (
                thirdPartyPlugins.map((plugin) => (
                  <TableRow key={plugin.id}>
                    <TableCell className="font-medium">{plugin.name}</TableCell>
                    <TableCell>{plugin.version}</TableCell>
                    <TableCell>
                      <Badge variant={plugin.state === 'running' ? 'default' : 'secondary'}>
                        {plugin.state}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnloadThirdParty(plugin.id)}
                        disabled={loadingThirdParty}
                        className="text-destructive"
                      >
                        卸载
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
