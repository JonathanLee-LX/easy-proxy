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
import { Play, Square, Loader2, Shield, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react'
import type { Plugin } from '@/types'
import { PluginGenerator } from './plugin-generator'

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
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [customPlugins, setCustomPlugins] = useState<any[]>([])

  useEffect(() => {
    fetchPlugins()
    fetchThirdPartyPlugins()
    fetchCustomPlugins()
  }, [fetchPlugins, fetchThirdPartyPlugins])

  const fetchCustomPlugins = async () => {
    try {
      const res = await fetch('/api/plugins/custom')
      const data = await res.json()
      setCustomPlugins(data.plugins || [])
    } catch (error) {
      console.error('加载自定义插件失败:', error)
    }
  }

  const handleDeleteCustomPlugin = async (filename: string) => {
    if (!confirm(`确定要删除插件 ${filename} 吗？`)) {
      return
    }
    
    try {
      const res = await fetch(`/api/plugins/custom/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      })
      
      if (res.ok) {
        await fetchCustomPlugins()
      } else {
        const error = await res.json()
        alert(error.error || '删除失败')
      }
    } catch (error) {
      console.error('删除插件失败:', error)
      alert('删除失败')
    }
  }

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

      {/* Custom AI Plugins */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">自定义插件</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCustomPlugins}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
            <Button
              size="sm"
              onClick={() => setGeneratorOpen(true)}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              AI 生成插件
            </Button>
          </div>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>文件名</TableHead>
                <TableHead>修改时间</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customPlugins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    暂无自定义插件，点击上方按钮使用 AI 生成插件
                  </TableCell>
                </TableRow>
              ) : (
                customPlugins.map((plugin) => (
                  <TableRow key={plugin.filename}>
                    <TableCell className="font-medium font-mono text-sm">{plugin.filename}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(plugin.modified).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCustomPlugin(plugin.filename)}
                        className="text-destructive"
                      >
                        删除
                      </Button>
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

      {/* Plugin Generator Dialog */}
      <PluginGenerator
        open={generatorOpen}
        onOpenChange={setGeneratorOpen}
        onPluginSaved={fetchCustomPlugins}
      />
    </div>
  )
}
