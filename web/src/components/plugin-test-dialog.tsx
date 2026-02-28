import { useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { 
  PlayCircle, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Terminal,
  AlertCircle,
  Wrench
} from 'lucide-react'
import { getAIConfig, isAIConfigValid } from '@/lib/ai-config-store'

interface PluginTestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pluginId: string
  pluginName: string
  hooks: string[]
  onPluginFixed?: () => void
}

export function PluginTestDialog({ 
  open, 
  onOpenChange, 
  pluginId, 
  pluginName,
  hooks,
  onPluginFixed
}: PluginTestDialogProps) {
  const [testing, setTesting] = useState(false)
  const [testUrl, setTestUrl] = useState('http://example.com/api/test')
  const [testMethod, setTestMethod] = useState('GET')
  const [testResults, setTestResults] = useState<any>(null)
  const [fixing, setFixing] = useState(false)
  const [hasErrors, setHasErrors] = useState(false)
  
  const aiConfig = getAIConfig()
  const isAIReady = isAIConfigValid(aiConfig)

  const handleTest = async () => {
    setTesting(true)
    setTestResults(null)

    try {
      const response = await fetch('/api/plugins/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pluginId,
          testType: 'request',
          url: testUrl,
          method: testMethod,
          headers: { 'user-agent': 'easy-proxy-test' },
          statusCode: 200,
          responseHeaders: { 'content-type': 'application/json' },
          responseBody: '{"status":"ok"}'
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '测试失败')
      }

      const data = await response.json()
      setTestResults(data.results)
      
      // 检查是否有hook执行失败
      const results = data.results?.hookResults || {}
      const hasError = Object.values(results).some((r: any) => r.status === 'error')
      setHasErrors(hasError)
    } catch (error) {
      setTestResults({
        error: error instanceof Error ? error.message : '测试失败'
      })
      setHasErrors(true)
    } finally {
      setTesting(false)
    }
  }

  const handleAutoFix = async () => {
    if (!isAIReady) {
      alert('AI配置未完成，无法使用自动修复功能')
      return
    }

    if (!testResults || !hasErrors) {
      return
    }

    setFixing(true)

    try {
      // 收集所有错误信息
      const errors = Object.entries(testResults.hookResults || {})
        .filter(([_, result]: [string, any]) => result.status === 'error')
        .map(([hook, result]: [string, any]) => `Hook ${hook}: ${result.error}\n${result.stack || ''}`)
        .join('\n\n')

      // 读取当前插件代码
      const pluginsResponse = await fetch('/api/plugins/custom')
      const pluginsData = await pluginsResponse.json()
      const plugin = pluginsData.plugins.find((p: any) => 
        p.filename.replace(/\.(js|ts)$/, '') === pluginId.replace('local.', '')
      )

      if (!plugin) {
        throw new Error('找不到插件文件')
      }

      const codeResponse = await fetch(plugin.path)
      const originalCode = await codeResponse.text()

      // 调用AI修复
      const fixResponse = await fetch('/api/plugins/fix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originalCode,
          testError: errors,
          requirement: {
            name: pluginName,
            description: '修复测试中发现的错误'
          },
          aiConfig: {
            provider: aiConfig.provider,
            apiKey: aiConfig.apiKey,
            baseUrl: aiConfig.baseUrl,
            model: aiConfig.model,
          },
        }),
      })

      if (!fixResponse.ok) {
        const error = await fixResponse.json()
        throw new Error(error.error || 'AI修复失败')
      }

      const fixData = await fixResponse.json()
      
      // 保存修复后的代码
      const saveResponse = await fetch('/api/plugins/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: plugin.filename,
          code: fixData.fixedCode,
        }),
      })

      if (!saveResponse.ok) {
        throw new Error('保存修复后的代码失败')
      }

      // 热加载
      await fetch('/api/plugins/reload', { method: 'POST' })

      // 重新测试
      await handleTest()

      alert('代码已自动修复并重新测试！请查看测试结果。')
      
      if (onPluginFixed) {
        onPluginFixed()
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'AI修复失败')
    } finally {
      setFixing(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[700px] max-w-[90vw] p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            测试插件: {pluginName}
          </SheetTitle>
          <SheetDescription>
            模拟HTTP请求来测试插件的各个Hook是否正常工作
          </SheetDescription>
        </SheetHeader>
        
        <Separator />
        
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* 测试配置 */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="testUrl">测试URL</Label>
              <Input
                id="testUrl"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="http://example.com/api/test"
                disabled={testing}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="testMethod">HTTP方法</Label>
              <div className="flex gap-2">
                {['GET', 'POST', 'PUT', 'DELETE'].map(method => (
                  <Button
                    key={method}
                    type="button"
                    variant={testMethod === method ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTestMethod(method)}
                    disabled={testing}
                  >
                    {method}
                  </Button>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <strong>测试的Hooks:</strong> {hooks.join(', ')}
              </p>
            </div>
          </div>

          {/* 测试结果 */}
          {testResults && (
            <div className="space-y-3">
              <Separator />
              
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                测试结果
              </h3>

              {testResults.error ? (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md p-3">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
                    <span className="text-sm text-red-700 dark:text-red-300">
                      {testResults.error}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Hook执行结果 */}
                  <div className="space-y-2">
                    {Object.entries(testResults.hookResults || {}).map(([hookName, result]: [string, any]) => (
                      <div 
                        key={hookName}
                        className={`border rounded-md p-3 ${
                          result.status === 'success'
                            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
                            : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {result.status === 'success' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            )}
                            <span className="font-medium text-sm">{hookName}</span>
                          </div>
                          {result.duration !== undefined && (
                            <Badge variant="outline" className="text-xs">
                              {result.duration}ms
                            </Badge>
                          )}
                        </div>
                        
                        {result.status === 'error' && (
                          <div className="text-xs text-red-700 dark:text-red-300 font-mono mt-2">
                            {result.error}
                          </div>
                        )}
                        
                        {result.context && result.context.shortCircuited && (
                          <div className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                            <AlertCircle className="h-3 w-3 inline mr-1" />
                            插件短路了响应（statusCode: {result.context.shortCircuitResponse?.statusCode || 'N/A'}）
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 插件日志 */}
                  {testResults.logs && testResults.logs.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">插件日志</h4>
                      <div className="bg-muted rounded-md p-3 max-h-[200px] overflow-auto">
                        <div className="space-y-1">
                          {testResults.logs.map((log: any, idx: number) => (
                            <div key={idx} className="text-xs font-mono">
                              <span className={`inline-block w-12 ${
                                log.level === 'error' ? 'text-red-600' :
                                log.level === 'warn' ? 'text-yellow-600' :
                                log.level === 'info' ? 'text-blue-600' :
                                'text-muted-foreground'
                              }`}>
                                [{log.level}]
                              </span>
                              <span className="text-foreground">{log.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <Separator />
        
        <div className="px-6 py-4 flex justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={testing || fixing}
          >
            关闭
          </Button>
          <div className="flex gap-2">
            {hasErrors && isAIReady && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoFix}
                disabled={testing || fixing}
                className="text-orange-600 border-orange-300"
              >
                {fixing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    AI修复中...
                  </>
                ) : (
                  <>
                    <Wrench className="h-4 w-4 mr-1" />
                    AI自动修复
                  </>
                )}
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleTest}
              disabled={testing || fixing}
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  测试中...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-1" />
                  运行测试
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
