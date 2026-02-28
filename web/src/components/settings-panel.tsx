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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Settings, Save, RotateCcw, Eye, EyeOff, CheckCircle2, XCircle,
  Monitor, Moon, Sun, FileText, RefreshCw
} from 'lucide-react'
import {
  getAIConfig,
  saveAIConfig,
  resetAIConfig,
  isAIConfigValid,
  getDefaultValues,
  type AIConfig
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

  // 配置文件状态
  const [configPath, setConfigPath] = useState('')

  // 字体大小偏好
  const [fontSize, setFontSize] = useState<string>('medium')

  // 初始化字体大小
  useEffect(() => {
    const saved = localStorage.getItem('font-size') || 'medium'
    setFontSize(saved)
    const size = fontSizeOptions.find(o => o.value === saved)?.size || '14px'
    document.documentElement.style.setProperty('--font-size-base', size)
  }, [])

  const fontSizeOptions = [
    { value: 'small', label: '小', size: '12px' },
    { value: 'medium', label: '中', size: '14px' },
    { value: 'large', label: '大', size: '16px' },
  ]

  // 应用字体大小
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('font-size', fontSize)
      const size = fontSizeOptions.find(o => o.value === fontSize)?.size || '14px'
      document.documentElement.style.setProperty('--font-size-base', size)
    }
  }, [fontSize])

  useEffect(() => {
    if (open) {
      setAiConfig(getAIConfig())
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
      const res = await fetch('/api/rules', { method: 'GET' })
      if (res.ok) {
        setAiTestMessage('配置已刷新')
        setTimeout(() => setAiTestMessage(''), 2000)
      }
    } catch (error) {
      console.error('刷新配置失败:', error)
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
              <Select value={theme} onValueChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}>
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

            {/* Provider 选择 */}
            <div className="space-y-2">
              <Label>AI 服务商</Label>
              <div className="flex gap-2">
                <Button
                  variant={aiConfig.provider === 'openai' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleProviderChange('openai')}
                >
                  OpenAI
                </Button>
                <Button
                  variant={aiConfig.provider === 'anthropic' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleProviderChange('anthropic')}
                >
                  Anthropic
                </Button>
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={aiConfig.apiKey}
                  onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                  placeholder="输入 API Key"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Model */}
            <div className="space-y-2">
              <Label htmlFor="model">模型</Label>
              <Input
                id="model"
                value={aiConfig.model}
                onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                placeholder="模型名称"
              />
            </div>

            {/* API 端点 */}
            <div className="space-y-2">
              <Label htmlFor="baseUrl">API 端点</Label>
              <Input
                id="baseUrl"
                value={aiConfig.baseUrl}
                onChange={(e) => setAiConfig({ ...aiConfig, baseUrl: e.target.value })}
                placeholder={aiConfig.provider === 'openai'
                  ? 'https://api.openai.com/v1/chat/completions'
                  : 'https://api.anthropic.com/v1/messages'
                }
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
