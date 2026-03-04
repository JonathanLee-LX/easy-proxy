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
  FileText,
} from 'lucide-react'
import { BodyDiffView } from './body-diff-view'

function headersToLines(headers: Record<string, unknown> | undefined): string {
  if (!headers || typeof headers !== 'object') return ''
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v != null ? String(v) : ''}`)
    .sort()
    .join('\n')
}

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
  const [testMode, setTestMode] = useState<'standalone' | 'integrated'>('standalone')
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
          integrated: testMode === 'integrated',
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

            <div className="space-y-2">
              <Label>测试模式</Label>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant={testMode === 'standalone' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTestMode('standalone')}
                  disabled={testing}
                  title="直接请求 URL，不走路由与 Mock，便于排查插件自身逻辑"
                >
                  单独测试
                </Button>
                <Button
                  type="button"
                  variant={testMode === 'integrated' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTestMode('integrated')}
                  disabled={testing}
                  title="与真实代理一致：先路由解析、Mock 匹配，再请求，便于排查整体链路"
                >
                  集成测试
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {testMode === 'standalone'
                  ? '直接请求上述 URL，不经过路由规则和 Mock，适合验证插件逻辑。'
                  : '先按路由规则解析目标、匹配 Mock，再请求，与经代理的真实请求一致，适合排查链路问题。'}
              </p>
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
                        {testResults.realRequest.testMode && (
                          <Badge variant="outline" className="text-xs font-normal">
                            {testResults.realRequest.testMode === 'integrated' ? '集成测试' : '单独测试'}
                          </Badge>
                        )}
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
                          <div className="text-muted-foreground space-y-0.5">
                            <div>
                              耗时: {testResults.realRequest.fetchDuration}ms
                              {testResults.originalResponse && (
                                <> · 状态码: <Badge variant="outline" className="text-xs">{testResults.originalResponse.statusCode}</Badge> · 响应大小: {testResults.originalResponse.bodyLength} 字符</>
                              )}
                            </div>
                            {(testResults.realRequest.targetResolved || testResults.realRequest.usedMock) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {testResults.realRequest.targetResolved && (
                                  <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">路由已改写</Badge>
                                )}
                                {testResults.realRequest.usedMock && (
                                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">已使用 Mock</Badge>
                                )}
                              </div>
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

                  {/* Request 对比：仅在被修改时显示 */}
                  {(testResults.requestHeadersChanged || testResults.requestBodyChanged) && testResults.originalRequest && testResults.modifiedRequest && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        请求对比（已被插件修改）
                      </h3>
                      {testResults.requestHeadersChanged && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">Request Headers</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-[10px] text-muted-foreground mb-0.5">原始</div>
                              <pre className="bg-muted/50 rounded-md p-2 text-xs font-mono max-h-[180px] overflow-auto whitespace-pre-wrap break-all">
                                {headersToLines(testResults.originalRequest.headers)}
                              </pre>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground mb-0.5">修改后</div>
                              <pre className="bg-green-500/10 rounded-md p-2 text-xs font-mono max-h-[180px] overflow-auto whitespace-pre-wrap break-all border border-green-500/30">
                                {headersToLines(testResults.modifiedRequest.headers)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                      {testResults.requestBodyChanged && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">Request Body</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-[10px] text-muted-foreground mb-0.5">原始</div>
                              <pre className="bg-muted/50 rounded-md p-2 text-xs font-mono max-h-[120px] overflow-auto whitespace-pre-wrap break-all">
                                {testResults.originalRequest.body || '(空)'}
                              </pre>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground mb-0.5">修改后</div>
                              <pre className="bg-green-500/10 rounded-md p-2 text-xs font-mono max-h-[120px] overflow-auto whitespace-pre-wrap break-all border border-green-500/30">
                                {testResults.modifiedRequest.body || '(空)'}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Response Headers 对比：仅在被修改时显示 */}
                  {testResults.responseHeadersChanged && testResults.originalResponse?.headers && testResults.modifiedResponse?.headers && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        Response Headers 对比（已被插件修改）
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-0.5">原始</div>
                          <pre className="bg-muted/50 rounded-md p-2 text-xs font-mono max-h-[180px] overflow-auto whitespace-pre-wrap break-all">
                            {headersToLines(testResults.originalResponse.headers)}
                          </pre>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-0.5">修改后</div>
                          <pre className="bg-green-500/10 rounded-md p-2 text-xs font-mono max-h-[180px] overflow-auto whitespace-pre-wrap break-all border border-green-500/30">
                            {headersToLines(testResults.modifiedResponse.headers)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Response Body 对比：Diff 形式，仅在被修改时展示 Diff */}
                  {testResults.modifiedResponse && testResults.originalResponse && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        {testResults.modifiedResponse.bodyChanged ? (
                          <AlertCircle className="h-4 w-4 text-orange-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                        )}
                        响应 Body
                        {testResults.modifiedResponse.bodyChanged ? (
                          <>
                            <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-300">已修改</Badge>
                            <span className="text-[10px] text-muted-foreground">
                              （差异 {testResults.modifiedResponse.bodyLength - testResults.originalResponse.bodyLength > 0 ? '+' : ''}
                              {testResults.modifiedResponse.bodyLength - testResults.originalResponse.bodyLength} 字符）
                            </span>
                          </>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">未变化</Badge>
                        )}
                      </h3>
                      {testResults.modifiedResponse.bodyChanged ? (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground">
                            绿色=新增行，红色=删除行。仅对比前约 2500 字符以保障性能。
                          </p>
                          <BodyDiffView
                            original={testResults.originalResponse.bodyForDiff ?? testResults.originalResponse.bodyPreview ?? ''}
                            modified={testResults.modifiedResponse.bodyForDiff ?? testResults.modifiedResponse.bodyPreview ?? ''}
                            maxHeight="320px"
                          />
                        </div>
                      ) : (
                        <pre className="bg-muted/50 rounded-md p-2 text-xs font-mono max-h-[200px] overflow-auto whitespace-pre-wrap break-all">
                          {testResults.originalResponse.bodyPreview}
                        </pre>
                      )}
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
