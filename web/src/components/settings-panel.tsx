import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Settings, Save, RotateCcw, Eye, EyeOff, CheckCircle2, XCircle,
  Monitor, Moon, Sun, FileText, RefreshCw, Plus, Trash2, Check
} from 'lucide-react'
import {
  getAIConfig,
  saveAIConfig,
  resetAIConfig,
  isAIConfigValid,
  getDefaultValues,
  addModel,
  deleteModel,
  setActiveModel,
  type AIConfig,
  type AIModel
} from '@/lib/ai-config-store'
import { useTheme } from '@/components/theme-provider'

interface SettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const { theme, setTheme } = useTheme()

  // AI 配置状态
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => getAIConfig())
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<'success' | 'error' | null>(null)
  const [aiTestMessage, setAiTestMessage] = useState('')
  
  // 多模型配置状态
  const [newModelForm, setNewModelForm] = useState<Partial<AIModel> | null>(null)

  // 配置文件状态
  const [configPath, setConfigPath] = useState('')

  // 字体大小偏好
  const [fontSize, setFontSize] = useState<string>('medium')

  const fontSizeOptions = [
    { value: 'small', label: '小', size: '12px' },
    { value: 'medium', label: '中', size: '14px' },
    { value: 'large', label: '大', size: '16px' },
  ]

  // 初始化字体大小
  useEffect(() => {
    import('@/lib/settings-store').then(({ loadSettings }) => {
      loadSettings().then(settings => {
        const saved = settings.fontSize || 'medium'
        setFontSize(saved)
        const size = fontSizeOptions.find(o => o.value === saved)?.size || '14px'
        document.documentElement.style.setProperty('--font-size-base', size)
      }).catch(() => {
        const saved = 'medium'
        setFontSize(saved)
        document.documentElement.style.setProperty('--font-size-base', '14px')
      })
    })
  }, [])

  // 应用字体大小
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const size = fontSizeOptions.find(o => o.value === fontSize)?.size || '14px'
      document.documentElement.style.setProperty('--font-size-base', size)
      
      // 保存到服务器
      import('@/lib/settings-store').then(({ updateSettings }) => {
        updateSettings({ fontSize }).catch(console.error)
      })
    }
  }, [fontSize])

  useEffect(() => {
    if (open) {
      // 从设置存储中加载 AI 配置
      import('@/lib/settings-store').then(({ loadSettings }) => {
        loadSettings().then(settings => {
          setAiConfig(settings.aiConfig)
        }).catch(() => {
          setAiConfig(getAIConfig())
        })
      })
      setAiTestResult(null)
      setAiTestMessage('')
      // 获取当前配置文件路径
      fetch('/api/config-path').then(res => res.json()).then(data => {
        if (data.path) setConfigPath(data.path)
      }).catch(() => {})
    }
  }, [open])

  // AI 相关处理函数
  const handleProviderChange = (provider: 'openai' | 'anthropic') => {
    const defaults = getDefaultValues(provider)
    setAiConfig({
      ...aiConfig,
      provider,
      baseUrl: defaults.baseUrl,
      model: defaults.model,
    })
  }

  const handleAiSave = async () => {
    setSaving(true)
    try {
      // 保存到文件系统
      const { updateSettings } = await import('@/lib/settings-store')
      await updateSettings({ aiConfig })
      
      // 同时保存到 localStorage 作为备份
      saveAIConfig(aiConfig)
      
      setAiTestResult('success')
      setAiTestMessage('AI 配置保存成功')
    } catch (error) {
      setAiTestResult('error')
      setAiTestMessage(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleAiReset = () => {
    resetAIConfig()
    setAiConfig(getAIConfig())
    setAiTestResult(null)
    setAiTestMessage('')
  }

  const handleAiTest = async () => {
    if (!isAIConfigValid(aiConfig)) {
      setAiTestResult('error')
      setAiTestMessage('请填写完整的配置信息')
      return
    }

    setSaving(true)
    setAiTestResult(null)
    setAiTestMessage('测试中...')

    try {
      const url = aiConfig.baseUrl
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      let body: any

      if (aiConfig.provider === 'anthropic') {
        headers['x-api-key'] = aiConfig.apiKey
        headers['anthropic-version'] = '2023-06-01'
        body = {
          model: aiConfig.model,
          max_tokens: 100,
          system: 'You are a helpful assistant.',
          messages: [{ role: 'user', content: 'Say "test successful"' }],
          temperature: 0.3,
        }
      } else {
        headers['Authorization'] = `Bearer ${aiConfig.apiKey}`
        body = {
          model: aiConfig.model,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Say "test successful"' }
          ],
          temperature: 0.3,
          max_tokens: 100,
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API错误 (${response.status}): ${errorText}`)
      }

      const data = await response.json()

      if (aiConfig.provider === 'anthropic') {
        if (!data.content?.[0]?.text) {
          throw new Error('API响应格式不正确')
        }
      } else {
        if (!data.choices?.[0]?.message?.content) {
          throw new Error('API响应格式不正确')
        }
      }

      setAiTestResult('success')
      setAiTestMessage('连接测试成功! API配置正常')
    } catch (error) {
      setAiTestResult('error')
      setAiTestMessage(error instanceof Error ? error.message : '测试失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRefreshConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/refresh-config', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setAiTestResult('success')
        setAiTestMessage(data.message || '配置已刷新')
        setTimeout(() => {
          setAiTestResult(null)
          setAiTestMessage('')
        }, 2000)
      } else {
        const data = await res.json()
        setAiTestResult('error')
        setAiTestMessage(data.error || '刷新配置失败')
        setTimeout(() => {
          setAiTestResult(null)
          setAiTestMessage('')
        }, 2000)
      }
    } catch (error) {
      console.error('刷新配置失败:', error)
      setAiTestResult('error')
      setAiTestMessage('刷新配置失败')
      setTimeout(() => {
        setAiTestResult(null)
        setAiTestMessage('')
      }, 2000)
    }
  }, [])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0 flex flex-col w-[600px]">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            系统设置
          </SheetTitle>
          <SheetDescription>
            管理系统偏好、配置和 AI 功能
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="preferences" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 w-fit">
            <TabsTrigger value="preferences">偏好设置</TabsTrigger>
            <TabsTrigger value="config">配置文件</TabsTrigger>
            <TabsTrigger value="ai">AI 配置</TabsTrigger>
          </TabsList>

          {/* 偏好设置 */}
          <TabsContent value="preferences" className="flex-1 overflow-auto p-6 space-y-6 mt-0">
            {/* 主题 */}
            <div className="space-y-2">
              <Label className="text-sm">主题</Label>
              <Select value={theme} onValueChange={(v: string) => setTheme(v as 'light' | 'dark' | 'system')}>
                <SelectTrigger>
                  <SelectValue placeholder="选择主题" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      跟随系统
                    </div>
                  </SelectItem>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      浅色模式
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      深色模式
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 字体大小 */}
            <div className="space-y-2">
              <Label className="text-sm">字体大小</Label>
              <Select value={fontSize} onValueChange={setFontSize}>
                <SelectTrigger>
                  <SelectValue placeholder="选择字体大小" />
                </SelectTrigger>
                <SelectContent>
                  {fontSizeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({option.size})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-3">关于</h3>
              <p className="text-xs text-muted-foreground">
                Easy Proxy - HTTP 调试代理工具
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                版本: 1.0.0
              </p>
            </div>
          </TabsContent>

          {/* 配置文件 */}
          <TabsContent value="config" className="flex-1 overflow-auto p-6 space-y-6 mt-0">
            <div>
              <h3 className="text-sm font-medium mb-3">当前配置文件</h3>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono truncate">{configPath || '加载中...'}</span>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-3">操作</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleRefreshConfig}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  刷新配置
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                点击刷新配置可重新加载当前配置文件
              </p>
            </div>
          </TabsContent>

          {/* AI 配置 */}
          <TabsContent value="ai" className="flex-1 overflow-auto p-6 space-y-4 mt-0">
            {/* 启用开关 */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">启用 AI 功能</Label>
                <p className="text-xs text-muted-foreground">启用智能代码修复功能</p>
              </div>
              <Button
                variant={aiConfig.enabled ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAiConfig({ ...aiConfig, enabled: !aiConfig.enabled })}
              >
                {aiConfig.enabled ? '已启用' : '已禁用'}
              </Button>
            </div>

            <Separator />

            {/* 多模型配置 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">AI 模型配置</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewModelForm({
                      name: '',
                      provider: 'openai',
                      apiKey: '',
                      baseUrl: 'https://api.openai.com/v1/chat/completions',
                      model: 'gpt-4o-mini',
                    })
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  添加模型
                </Button>
              </div>

              {/* 模型列表 */}
              <div className="space-y-2">
                {aiConfig.models && aiConfig.models.length > 0 ? (
                  aiConfig.models.map((model) => (
                    <div
                      key={model.id}
                      className={`p-3 rounded-md border ${
                        aiConfig.activeModelId === model.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{model.name}</span>
                            {aiConfig.activeModelId === model.id && (
                              <Badge variant="default" className="text-xs">当前使用</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {model.provider === 'openai' ? 'OpenAI' : 'Anthropic'} - {model.model}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {aiConfig.activeModelId !== model.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAiConfig(setActiveModel(aiConfig, model.id))}
                              className="h-7 text-xs"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              使用
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAiConfig(deleteModel(aiConfig, model.id))}
                            className="h-7 w-7 p-0 text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground italic py-4 text-center">
                    暂无模型配置，点击"添加模型"创建
                  </p>
                )}
              </div>

              {/* 新增模型表单 */}
              {newModelForm && (
                <div className="p-4 rounded-md border border-primary bg-primary/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">新增模型</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNewModelForm(null)}
                      className="h-6 w-6 p-0"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newModelName" className="text-xs">模型名称</Label>
                    <Input
                      id="newModelName"
                      value={newModelForm.name || ''}
                      onChange={(e) => setNewModelForm({ ...newModelForm, name: e.target.value })}
                      placeholder="如：GPT-4o Mini"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">服务商</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={newModelForm.provider === 'openai' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          const defaults = getDefaultValues('openai')
                          setNewModelForm({
                            ...newModelForm,
                            provider: 'openai',
                            baseUrl: defaults.baseUrl,
                            model: defaults.model,
                          })
                        }}
                        className="h-7 text-xs"
                      >
                        OpenAI
                      </Button>
                      <Button
                        variant={newModelForm.provider === 'anthropic' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          const defaults = getDefaultValues('anthropic')
                          setNewModelForm({
                            ...newModelForm,
                            provider: 'anthropic',
                            baseUrl: defaults.baseUrl,
                            model: defaults.model,
                          })
                        }}
                        className="h-7 text-xs"
                      >
                        Anthropic
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newModelApiKey" className="text-xs">API Key</Label>
                    <Input
                      id="newModelApiKey"
                      type={showApiKey ? 'text' : 'password'}
                      value={newModelForm.apiKey || ''}
                      onChange={(e) => setNewModelForm({ ...newModelForm, apiKey: e.target.value })}
                      placeholder="输入 API Key"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newModelModel" className="text-xs">模型</Label>
                    <Input
                      id="newModelModel"
                      value={newModelForm.model || ''}
                      onChange={(e) => setNewModelForm({ ...newModelForm, model: e.target.value })}
                      placeholder="模型名称"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newModelBaseUrl" className="text-xs">API 端点</Label>
                    <Input
                      id="newModelBaseUrl"
                      value={newModelForm.baseUrl || ''}
                      onChange={(e) => setNewModelForm({ ...newModelForm, baseUrl: e.target.value })}
                      placeholder="API 端点"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNewModelForm(null)}
                      className="h-7 text-xs"
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (newModelForm.name && newModelForm.apiKey && newModelForm.model && newModelForm.baseUrl) {
                          setAiConfig(addModel(aiConfig, newModelForm as Omit<AIModel, 'id'>))
                          setNewModelForm(null)
                        }
                      }}
                      disabled={!newModelForm.name || !newModelForm.apiKey || !newModelForm.model || !newModelForm.baseUrl}
                      className="h-7 text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      添加
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* 传统单模型配置（向后兼容） */}
            <div className="space-y-2">
              <Label className="text-sm">传统配置（向后兼容）</Label>
              <p className="text-xs text-muted-foreground">
                如果未配置多模型，将使用此配置
              </p>
            </div>

            {/* Provider 选择 */}
            <div className="space-y-2">
              <Label className="text-xs">AI 服务商</Label>
              <div className="flex gap-2">
                <Button
                  variant={aiConfig.provider === 'openai' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleProviderChange('openai')}
                  className="h-7 text-xs"
                >
                  OpenAI
                </Button>
                <Button
                  variant={aiConfig.provider === 'anthropic' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleProviderChange('anthropic')}
                  className="h-7 text-xs"
                >
                  Anthropic
                </Button>
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="text-xs">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={aiConfig.apiKey}
                  onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                  placeholder="输入 API Key"
                  className="flex-1 h-8 text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="h-8 w-8"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Model */}
            <div className="space-y-2">
              <Label htmlFor="model" className="text-xs">模型</Label>
              <Input
                id="model"
                value={aiConfig.model}
                onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                placeholder="模型名称"
                className="h-8 text-sm"
              />
            </div>

            {/* API 端点 */}
            <div className="space-y-2">
              <Label htmlFor="baseUrl" className="text-xs">API 端点</Label>
              <Input
                id="baseUrl"
                value={aiConfig.baseUrl}
                onChange={(e) => setAiConfig({ ...aiConfig, baseUrl: e.target.value })}
                placeholder={aiConfig.provider === 'openai'
                  ? 'https://api.openai.com/v1/chat/completions'
                  : 'https://api.anthropic.com/v1/messages'
                }
                className="h-8 text-sm"
              />
            </div>

            {/* 测试结果 */}
            {aiTestMessage && (
              <div className={`flex items-start gap-2 p-3 rounded-md border ${
                aiTestResult === 'success'
                  ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
                  : aiTestResult === 'error'
                  ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                  : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900'
              }`}>
                {aiTestResult === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />}
                {aiTestResult === 'error' && <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />}
                <span className={`text-xs flex-1 ${
                  aiTestResult === 'success'
                    ? 'text-green-700 dark:text-green-300'
                    : aiTestResult === 'error'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-blue-700 dark:text-blue-300'
                }`}>
                  {aiTestMessage}
                </span>
              </div>
            )}

            <Separator />

            {/* 操作按钮 */}
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={handleAiReset}>
                <RotateCcw className="h-4 w-4 mr-1" />
                重置
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAiTest}
                  disabled={!isAIConfigValid(aiConfig) || saving}
                >
                  测试连接
                </Button>
                <Button
                  size="sm"
                  onClick={handleAiSave}
                  disabled={saving}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {saving ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
