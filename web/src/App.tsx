import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { RuleConfig } from '@/components/rule-config'
import { LogFilter } from '@/components/log-filter'
import { LogTable } from '@/components/log-table'
import { DetailPanel } from '@/components/detail-panel'
import { PluginConfig } from '@/components/plugin-config'
import { SettingsPanel } from '@/components/settings-panel'
import { AIConfigBadge } from '@/components/ai-settings'
import { useProxyStore } from '@/hooks/use-proxy-store'
import { useFuzzyFilter } from '@/hooks/use-fuzzy-filter'
import { useTheme } from '@/components/theme-provider'
import { createMockFromLog, type CreateMockFromLogData } from '@/utils/mock-factory'
import { Globe, Moon, Sun, Settings, Monitor } from 'lucide-react'
import type { MockRule } from '@/types'

// 懒加载 MockConfig 组件
const MockConfig = lazy(() => import('@/components/mock-config').then(module => ({ default: module.MockConfig })))

// 懒加载加载占位符
function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-muted-foreground">加载中...</div>
    </div>
  )
}

function App() {
  const store = useProxyStore()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const { filterText, setFilterText, resourceTypeFilter, setResourceTypeFilter, filteredRecords } = useFuzzyFilter(store.records)
  const [recording, setRecording] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 从 URL 路径获取当前 tab
  const getTabFromPath = (pathname: string): string => {
    const tabMap: Record<string, string> = {
      '/': 'logs',
      '/logs': 'logs',
      '/config': 'config',
      '/mock': 'mock',
      '/plugins': 'plugins',
    }
    return tabMap[pathname] || 'logs'
  }

  const activeTab = getTabFromPath(location.pathname)

  const handleTabChange = (tab: string) => {
    const pathMap: Record<string, string> = {
      logs: '/logs',
      config: '/config',
      mock: '/mock',
      plugins: '/plugins',
    }
    navigate(pathMap[tab] || '/')
  }

  // 从日志详情创建 mock 的初始数据
  const [mockInitialData, setMockInitialData] = useState<Partial<MockRule> | null>(null)

  const handleCreateMockFromLog = useCallback((data: CreateMockFromLogData) => {
    const mockData = createMockFromLog(data)
    setMockInitialData(mockData)
    store.closeDetail()
    navigate('/mock')
  }, [store.closeDetail, navigate])

  const handleInitialEditConsumed = useCallback(() => {
    setMockInitialData(null)
  }, [])

  const handleReplay = useCallback(async (id: number) => {
    // replayRequest 失败会直接抛出含后端错误信息的异常，由 DetailPanel 捕获显示
    const result = await store.replayRequest(id)
    store.fetchDetail(result.recordId)
    return result
  }, [store.replayRequest, store.fetchDetail])

  // When paused, keep a snapshot of records
  const displayRecords = recording ? filteredRecords : filteredRecords

  // 页面加载时获取插件列表（仅用于显示第三方插件）
  useEffect(() => {
    store.fetchPlugins()
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-3">
          <Globe className="h-5 w-5 text-primary" />
          <h1 className="text-sm font-semibold">Easy Proxy</h1>
          <span className="text-xs text-muted-foreground">开发代理工具</span>
          <div className="flex-1" />
          <AIConfigBadge />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            className="h-8 w-8"
            aria-label="设置"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8"
            aria-label={`当前主题: ${theme}，点击切换`}
            title={`主题: ${theme === 'system' ? '跟随系统' : theme === 'light' ? '浅色' : '深色'}`}
          >
            {theme === 'light' ? (
              <Moon className="h-4 w-4" />
            ) : theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-4">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-3">
          <TabsList>
            <TabsTrigger value="logs">日志</TabsTrigger>
            <TabsTrigger value="config">路由规则</TabsTrigger>
            <TabsTrigger value="mock">
              Mock
              {store.mockRules.filter(r => r.enabled).length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium">
                  {store.mockRules.filter(r => r.enabled).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="plugins">扩展插件</TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="space-y-0 mt-0">
              <div className="rounded-lg border bg-card">
                <LogFilter
                  filterText={filterText}
                  setFilterText={setFilterText}
                  resourceTypeFilter={resourceTypeFilter}
                  setResourceTypeFilter={setResourceTypeFilter}
                  totalCount={store.records.length}
                  filteredCount={filteredRecords.length}
                  onClear={store.clearRecords}
                  recording={recording}
                  onToggleRecording={() => setRecording((r) => !r)}
                />
                <LogTable
                  records={displayRecords}
                  selectedRecordId={store.selectedRecordId}
                  onSelect={store.fetchDetail}
                  autoScroll={autoScroll}
                />
              </div>
              {/* Auto-scroll toggle */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded"
                  />
                  自动滚动到顶部
                </label>
              </div>
            </TabsContent>

          <TabsContent value="config" className="mt-0">
            <div className="rounded-lg border bg-card p-4">
              <RuleConfig
                rules={store.rules}
                setRules={store.setRules}
                fetchRules={store.fetchRules}
                saveRules={store.saveRules}
                loadRulesFromFile={store.loadRulesFromFile}
                ruleSets={store.ruleSets}
                fetchRuleSets={store.fetchRuleSets}
                saveRuleSet={store.saveRuleSet}
                switchRuleSet={store.switchRuleSet}
                deleteRuleSet={store.deleteRuleSet}
              />
            </div>
          </TabsContent>

          <TabsContent value="mock" className="mt-0">
            <div className="rounded-lg border bg-card p-4">
              <Suspense fallback={<LoadingPlaceholder />}>
                <MockConfig
                  mockRules={store.mockRules}
                  fetchMocks={store.fetchMocks}
                  createMock={store.createMock}
                  updateMock={store.updateMock}
                  deleteMock={store.deleteMock}
                  initialEditData={mockInitialData}
                  onInitialEditConsumed={handleInitialEditConsumed}
                />
              </Suspense>
            </div>
          </TabsContent>

          <TabsContent value="plugins" className="mt-0">
            <div className="rounded-lg border bg-card p-4">
              <PluginConfig
                // 插件列表相关
                plugins={store.plugins}
                pluginMode={store.pluginMode}
                fetchPlugins={store.fetchPlugins}
                startPlugin={store.startPlugin}
                stopPlugin={store.stopPlugin}
                // 第三方插件相关
                thirdPartyPlugins={store.thirdPartyPlugins}
                thirdPartySecurity={store.thirdPartySecurity}
                fetchThirdPartyPlugins={store.fetchThirdPartyPlugins}
                loadThirdPartyPlugin={store.loadThirdPartyPlugin}
                unloadThirdPartyPlugin={store.unloadThirdPartyPlugin}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Detail Panel */}
      <DetailPanel
        open={store.selectedRecordId != null}
        onClose={store.closeDetail}
        detail={store.recordDetail}
        loading={store.detailLoading}
        selectedRecord={store.records.find(r => r.id === store.selectedRecordId)}
        onCreateMock={handleCreateMockFromLog}
        onReplay={handleReplay}
      />

      {/* Settings */}
      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  )
}

export default App
