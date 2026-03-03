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
  Globe,
  ArrowRight,
} from 'lucide-react'

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
}: PluginTestDialogProps) {
  const [testing, setTesting] = useState(false)
  const [testUrl, setTestUrl] = useState('https://365.wps.cn/home')
  const [testMethod, setTestMethod] = useState('GET')
  const [testResults, setTestResults] = useState<any>(null)

  const handleTest = async () => {
    setTesting(true)
    setTestResults(null)

    try {
      const response = await fetch('/api/plugins/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginId,
          url: testUrl,
          method: testMethod,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '测试失败')
      }

      const data = await response.json()
      setTestResults(data.results)
    } catch (error) {
      setTestResults({
        error: error instanceof Error ? error.message : '测试失败',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0 flex flex-col" resizable defaultWidth={900} storageKey="plugin-test">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            测试插件: {pluginName}
          </SheetTitle>
          <SheetDescription>
            发起真实 HTTP 请求，在请求/响应过程中运行插件代码
          </SheetDescription>
        </SheetHeader>

        <Separator />

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* 测试配置 */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="testUrl">请求 URL</Label>
              <Input
                id="testUrl"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://example.com/page"
                disabled={testing}
              />
            </div>

            <div className="space-y-2">
              <Label>HTTP 方法</Label>
              <div className="flex gap-2">
                {['GET', 'POST', 'PUT', 'DELETE'].map((method) => (
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
                <strong>测试流程:</strong> 发起真实请求 → 获取服务器响应 → 运行插件 Hook（{hooks.join(', ')}）→ 展示对比结果
              </p>
            </div>
          </div>

          {/* 测试结果 */}
          {testResults && (
            <div className="space-y-3">
              <Separator />

              {testResults.error ? (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md p-3">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    <span className="text-sm text-red-700 dark:text-red-300">{testResults.error}</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* 真实请求信息 */}
                  {testResults.realRequest && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        真实请求
                      </h3>
                      <div className="bg-muted/50 rounded-md p-3 text-xs space-y-1">
                        <div className="flex gap-2">
                          <Badge variant="outline" className="text-xs">{testResults.realRequest.method}</Badge>
                          <span className="font-mono break-all">{testResults.realRequest.url}</span>
                        </div>
                        {testResults.realRequest.fetchError ? (
                          <div className="text-red-600 flex items-center gap-1 mt-1">
                            <XCircle className="h-3 w-3" />
                            请求失败: {testResults.realRequest.fetchError}
                          </div>
                        ) : (
                          <div className="text-muted-foreground">
                            耗时: {testResults.realRequest.fetchDuration}ms
                            {testResults.originalResponse && (
                              <> · 状态码: <Badge variant="outline" className="text-xs">{testResults.originalResponse.statusCode}</Badge> · 响应大小: {testResults.originalResponse.bodyLength} 字符</>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Hook 执行结果 */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Hook 执行结果
                    </h3>
                    {Object.keys(testResults.hookResults || {}).length === 0 ? (
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                        没有 Hook 被执行
                      </div>
                    ) : (
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
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {result.status === 'success' ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-600" />
                                )}
                                <span className="font-medium text-sm">{hookName}</span>
                              </div>
                              {result.duration !== undefined && (
                                <Badge variant="outline" className="text-xs">{result.duration}ms</Badge>
                              )}
                            </div>
                            {result.status === 'error' && (
                              <pre className="text-xs text-red-700 dark:text-red-300 font-mono mt-2 whitespace-pre-wrap break-all">
                                {result.error}
                              </pre>
                            )}
                            {result.targetChanged && (
                              <div className="text-xs text-blue-700 mt-1 flex items-center gap-1">
                                <ArrowRight className="h-3 w-3" />
                                Target 已修改为: {result.targetChanged}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 响应对比 */}
                  {testResults.modifiedResponse && testResults.originalResponse && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        {testResults.modifiedResponse.bodyChanged ? (
                          <AlertCircle className="h-4 w-4 text-orange-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                        )}
                        响应对比
                        {testResults.modifiedResponse.bodyChanged && (
                          <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-300">响应已被插件修改</Badge>
                        )}
                        {!testResults.modifiedResponse.bodyChanged && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">响应未变化</Badge>
                        )}
                      </h3>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">原始响应 ({testResults.originalResponse.bodyLength} 字符)</div>
                          <pre className="bg-muted/50 rounded-md p-2 text-xs font-mono max-h-[300px] overflow-auto whitespace-pre-wrap break-all">
                            {testResults.originalResponse.bodyPreview}
                          </pre>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            插件处理后 ({testResults.modifiedResponse.bodyLength} 字符)
                            {testResults.modifiedResponse.bodyChanged && (
                              <span className="text-orange-600 ml-1">
                                (差异 {testResults.modifiedResponse.bodyLength - testResults.originalResponse.bodyLength > 0 ? '+' : ''}{testResults.modifiedResponse.bodyLength - testResults.originalResponse.bodyLength} 字符)
                              </span>
                            )}
                          </div>
                          <pre className="bg-muted/50 rounded-md p-2 text-xs font-mono max-h-[300px] overflow-auto whitespace-pre-wrap break-all">
                            {testResults.modifiedResponse.bodyPreview}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 短路响应 */}
                  {testResults.shortCircuited && testResults.shortCircuitResponse && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-blue-500" />
                        插件短路了请求（未发起真实请求）
                      </h3>
                      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md p-3">
                        <div className="text-xs">
                          <div>状态码: {testResults.shortCircuitResponse.statusCode}</div>
                          <pre className="mt-2 font-mono whitespace-pre-wrap break-all max-h-[200px] overflow-auto">
                            {testResults.shortCircuitResponse.body}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 插件日志 */}
                  {testResults.logs && testResults.logs.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">插件日志</h3>
                      <div className="bg-muted rounded-md p-3 max-h-[200px] overflow-auto">
                        <div className="space-y-1">
                          {testResults.logs.map((log: any, idx: number) => (
                            <div key={idx} className="text-xs font-mono">
                              <span
                                className={`inline-block w-12 ${
                                  log.level === 'error'
                                    ? 'text-red-600'
                                    : log.level === 'warn'
                                      ? 'text-yellow-600'
                                      : log.level === 'info'
                                        ? 'text-blue-600'
                                        : 'text-muted-foreground'
                                }`}
                              >
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
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={testing}>
            关闭
          </Button>
          <Button size="sm" onClick={handleTest} disabled={testing}>
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                请求中...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-1" />
                发起测试请求
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
