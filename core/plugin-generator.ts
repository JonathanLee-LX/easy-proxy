/**
 * AI插件生成器
 * 根据用户需求，使用AI生成符合插件系统规范的插件代码
 */

export interface AIConfig {
    provider: 'openai' | 'anthropic';
    apiKey: string;
    baseUrl: string;
    model: string;
}

export interface PluginRequirement {
    name: string;
    description: string;
    hooks?: string[];
    permissions?: string[];
}

export interface GeneratedPlugin {
    code: string;
    filename: string;
    manifest: {
        id: string;
        name: string;
        version: string;
        apiVersion: string;
        permissions: string[];
        hooks: string[];
    };
}

/**
 * 生成插件系统设计文档prompt
 */
function getPluginSystemDesignPrompt(): string {
    return `# Easy Proxy 插件系统设计

## 插件接口规范

插件必须实现以下 TypeScript 接口：

\`\`\`typescript
export interface Plugin {
  manifest: PluginManifest;
  setup(context: PluginContext): void | Promise<void>;
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
  dispose?(): void | Promise<void>;
  
  // Hook 方法（可选）
  onRequestStart?(context: HookContext): void | Promise<void>;
  onBeforeProxy?(context: HookContext): void | Promise<void>;
  onBeforeResponse?(context: ResponseContext): void | Promise<void>;
  onAfterResponse?(context: ResponseContext): void | Promise<void>;
  onError?(context: ErrorContext): void | Promise<void>;
}

export interface PluginManifest {
  id: string;                    // 唯一标识，格式：org.plugin-name
  name?: string;                 // 显示名称
  version: string;               // 版本号
  apiVersion: string;            // API版本（当前为 '1.x'）
  permissions: string[];         // 权限列表
  hooks: string[];               // 声明的Hook列表
  priority?: number;             // 优先级（默认100，数字越小优先级越高）
  type?: string;                 // 'builtin' | 'local'
}

export interface PluginContext {
  manifest: PluginManifest;
  log: Logger;                   // 日志接口
  [key: string]: any;
}

export interface HookContext {
  request: Request;              // 请求信息
  target: string;                // 目标地址
  meta: Record<string, any>;     // 元数据存储
  setTarget(target: string): void;  // 设置目标地址
  respond(response: Response): void; // 短路响应（仅 onBeforeProxy）
}

export interface ResponseContext {
  request: Request;              // 请求信息
  target: string;                // 目标地址
  meta: Record<string, any>;     // 元数据存储
  response: Response;            // 响应信息
}
\`\`\`

## 权限模型

可用权限：
- \`proxy:read\` - 读取请求/响应信息
- \`proxy:write\` - 修改请求/响应
- \`response:shortcircuit\` - 短路响应（Mock）
- \`config:read\` - 读取配置
- \`config:write\` - 写入配置
- \`storage:read\` - 读取存储
- \`storage:write\` - 写入存储
- \`network:outbound\` - 外部网络访问

## Hook 生命周期

1. \`onRequestStart\` - 请求刚进入代理时调用
2. \`onBeforeProxy\` - 即将发起上游请求之前调用（可短路）
3. \`onBeforeResponse\` - 收到上游响应，返回客户端之前调用
4. \`onAfterResponse\` - 响应完成后异步调用
5. \`onError\` - 任意阶段出现错误后调用

## 插件示例

\`\`\`typescript
// example-plugin.ts
export const plugin = {
    manifest: {
        id: 'local.example',
        name: 'Example Plugin',
        version: '1.0.0',
        apiVersion: '1.x',
        permissions: ['proxy:read'],
        hooks: ['onRequestStart', 'onAfterResponse'],
        priority: 100,
        type: 'local'
    },
    
    setup(context) {
        context.log.info(\`\${this.manifest.name} setup complete\`);
    },
    
    async onRequestStart(context) {
        context.log.info(\`Request: \${context.request.method} \${context.request.url}\`);
    },
    
    async onAfterResponse(context) {
        context.log.info(\`Response: \${context.response.statusCode}\`);
    }
};
\`\`\``;
}

/**
 * 使用 OpenAI 生成插件代码（流式）
 */
async function generateWithOpenAIStream(
    requirement: PluginRequirement,
    config: AIConfig,
    onChunk: (chunk: string) => void
): Promise<string> {
    const systemPrompt = `你是一个专业的插件开发助手，精通 TypeScript 和 Easy Proxy 插件系统。你的任务是根据用户需求生成高质量的插件代码。

${getPluginSystemDesignPrompt()}

## 代码生成要求

1. 必须遵循上述插件接口规范
2. 代码必须是纯 TypeScript
3. 使用 ES6 模块导出（export）
4. 插件 ID 格式：local.{plugin-name}（小写，用连字符分隔）
5. 只返回代码，不要包含任何解释性文字
6. 不要使用 markdown 代码块标记
7. 代码要有适当的注释说明功能
8. 权限申请要最小化，只申请必需的权限`;

    const userPrompt = `请生成一个符合 Easy Proxy 插件系统规范的插件代码。

插件需求：
名称：${requirement.name}
描述：${requirement.description}
${requirement.hooks ? `需要的 Hooks：${requirement.hooks.join(', ')}` : ''}
${requirement.permissions ? `需要的权限：${requirement.permissions.join(', ')}` : ''}

请直接返回完整的 TypeScript 插件代码，导出一个名为 plugin 的对象。`;

    const response = await fetch(config.baseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 2000,
            stream: true
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API 错误 (${response.status}): ${errorText}`);
    }

    let fullCode = '';
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
        throw new Error('无法读取响应流');
    }

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) {
                            fullCode += content;
                            onChunk(content);
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    if (!fullCode.trim()) {
        throw new Error('OpenAI 返回了空结果');
    }

    return cleanAIResponse(fullCode);
}

/**
 * 使用 Anthropic 生成插件代码（流式）
 */
async function generateWithAnthropicStream(
    requirement: PluginRequirement,
    config: AIConfig,
    onChunk: (chunk: string) => void
): Promise<string> {
    const systemPrompt = `你是一个专业的插件开发助手，精通 TypeScript 和 Easy Proxy 插件系统。你的任务是根据用户需求生成高质量的插件代码。

${getPluginSystemDesignPrompt()}

## 代码生成要求

1. 必须遵循上述插件接口规范
2. 代码必须是纯 TypeScript
3. 使用 ES6 模块导出（export）
4. 插件 ID 格式：local.{plugin-name}（小写，用连字符分隔）
5. 只返回代码，不要包含任何解释性文字
6. 不要使用 markdown 代码块标记
7. 代码要有适当的注释说明功能
8. 权限申请要最小化，只申请必需的权限`;

    const userPrompt = `请生成一个符合 Easy Proxy 插件系统规范的插件代码。

插件需求：
名称：${requirement.name}
描述：${requirement.description}
${requirement.hooks ? `需要的 Hooks：${requirement.hooks.join(', ')}` : ''}
${requirement.permissions ? `需要的权限：${requirement.permissions.join(', ')}` : ''}

请直接返回完整的 TypeScript 插件代码，导出一个名为 plugin 的对象。`;

    const response = await fetch(config.baseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: config.model,
            max_tokens: 2000,
            system: systemPrompt,
            messages: [
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            stream: true
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API 错误 (${response.status}): ${errorText}`);
    }

    let fullCode = '';
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
        throw new Error('无法读取响应流');
    }

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.type === 'content_block_delta') {
                            const content = parsed.delta?.text;
                            if (content) {
                                fullCode += content;
                                onChunk(content);
                            }
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    if (!fullCode.trim()) {
        throw new Error('Anthropic 返回了空结果');
    }

    return cleanAIResponse(fullCode);
}

/**
 * 清理 AI 响应，移除 markdown 代码块标记
 */
function cleanAIResponse(text: string): string {
    // 移除可能的 markdown 代码块标记
    let cleaned = text
        .replace(/^```[a-z]*\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim();

    return cleaned;
}

/**
 * 从生成的代码中提取 manifest 信息
 */
function extractManifest(code: string): any {
    try {
        // 尝试通过正则提取 manifest 对象
        const manifestMatch = code.match(/manifest\s*:\s*{([^}]+({[^}]+}[^}]+)*[^}]+)}/s);
        if (!manifestMatch) {
            throw new Error('无法提取 manifest 信息');
        }

        const manifestText = manifestMatch[0];
        
        // 提取各个字段
        const idMatch = manifestText.match(/id\s*:\s*['"]([^'"]+)['"]/);
        const nameMatch = manifestText.match(/name\s*:\s*['"]([^'"]+)['"]/);
        const versionMatch = manifestText.match(/version\s*:\s*['"]([^'"]+)['"]/);
        const apiVersionMatch = manifestText.match(/apiVersion\s*:\s*['"]([^'"]+)['"]/);
        const permissionsMatch = manifestText.match(/permissions\s*:\s*\[([^\]]*)\]/);
        const hooksMatch = manifestText.match(/hooks\s*:\s*\[([^\]]*)\]/);

        const permissions = permissionsMatch 
            ? permissionsMatch[1].split(',').map(p => p.trim().replace(/['"]/g, '')).filter(Boolean)
            : [];
        
        const hooks = hooksMatch
            ? hooksMatch[1].split(',').map(h => h.trim().replace(/['"]/g, '')).filter(Boolean)
            : [];

        return {
            id: idMatch ? idMatch[1] : 'local.unknown',
            name: nameMatch ? nameMatch[1] : 'Unknown Plugin',
            version: versionMatch ? versionMatch[1] : '1.0.0',
            apiVersion: apiVersionMatch ? apiVersionMatch[1] : '1.x',
            permissions,
            hooks
        };
    } catch (error) {
        // 返回默认 manifest
        return {
            id: 'local.unknown',
            name: 'Unknown Plugin',
            version: '1.0.0',
            apiVersion: '1.x',
            permissions: [],
            hooks: []
        };
    }
}

/**
 * 生成插件代码（流式）
 */
export async function generatePluginStream(
    requirement: PluginRequirement,
    config: AIConfig,
    onChunk: (chunk: string) => void
): Promise<GeneratedPlugin> {
    let code: string;

    if (config.provider === 'anthropic') {
        code = await generateWithAnthropicStream(requirement, config, onChunk);
    } else {
        code = await generateWithOpenAIStream(requirement, config, onChunk);
    }

    // 提取 manifest 信息
    const manifest = extractManifest(code);

    // 生成文件名
    const pluginId = manifest.id.replace('local.', '');
    const filename = `${pluginId}.ts`;

    return {
        code,
        filename,
        manifest
    };
}

/**
 * 生成插件代码（非流式，向后兼容）
 */
export async function generatePlugin(
    requirement: PluginRequirement,
    config: AIConfig
): Promise<GeneratedPlugin> {
    return generatePluginStream(requirement, config, () => {});
}
