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
  AlertCircle
} from 'lucide-react'

interface PluginTestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pluginId: string
  pluginName: string
  hooks: string[]
}

export function PluginTestDialog({ 
  open, 
  onOpenChange, 
  pluginId, 
  pluginName,
  hooks 
}: PluginTestDialogProps) {
  const [testing, setTesting] = useState(false)
  const [testUrl, setTestUrl] = useState('http://example.com/api/test')
  const [testMethod, setTestMethod] = useState('GET')
  const [testResults, setTestResults] = useState<any>(null)

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
    } catch (error) {
      setTestResults({
        error: error instanceof Error ? error.message : '测试失败'
      })
    } finally {
      setTesting(false)
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
            disabled={testing}
          >
            关闭
          </Button>
          <Button
            size="sm"
            onClick={handleTest}
            disabled={testing}
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
      </SheetContent>
    </Sheet>
  )
}
