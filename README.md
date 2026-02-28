# 一个非常简单的开发代理服务器

- 自定义代理规则
- 支持https✅

## 使用

全局安装easy-dev-proxy `npm install easy-dev-proxy -g`,会创建一个`ep`命令。

通过`ep`命令即可启动本地的代理服务器

### 配置文件

配置文件扁平化存储在 `~/.ep/` 目录：

```
~/.ep/
├── .eprc              # 路由规则配置
├── mocks.json         # Mock 规则配置
├── settings.json      # 系统设置（主题、字体、AI配置）
└── ca/                # SSL 证书目录
```

**路由规则配置**:
- 项目目录配置（优先）：`.eprc`、`ep.config.json`、`ep.config.js`
- 用户默认配置：`~/.ep/.eprc`
- 支持 EPRC、JSON、JS 三种格式

**Web 界面管理**:
- 启动后访问 http://localhost:8899
- 通过界面管理路由规则、Mock 规则和系统设置

详见 [配置文件结构说明](./CONFIG_STRUCTURE.md)

### 自动打开浏览器并设置代理

使用以下任一方式启动：
- `ep --open`（全局安装后）
- `npm run start:open`（开发时）
- `EP_OPEN=1 npm run start`

启动后将使用 Chrome/Edge/Chromium 的 `--proxy-server` 参数启动浏览器，仅该浏览器实例使用代理，不修改系统代理设置。

### MCP Server

提供 MCP 工具 `start_proxy`：启动代理服务器并返回代理地址。

- `env`：环境名（如 `beta`、`eprc.beta`），对应 `.epconfig/.{env}` 配置
- `openBrowser: true`：启动浏览器并设置代理
- `openBrowser: "chrome-devtools"`：启动带代理的浏览器，并配置 chrome-devtools MCP 连接该浏览器，支持通过 AI 控制浏览器（需重启 MCP 生效）

**浏览器控制工具**（需先通过 `start_proxy(openBrowser:"chrome-devtools")` 启动）：
- `browser_list_pages` - 列出页面
- `browser_navigate` - 导航到 URL
- `browser_new_page` - 新建页面
- `browser_select_page` - 切换页面
- `browser_snapshot` - 获取页面快照（含元素 ref）
- `browser_screenshot` - 截图
- `browser_click` - 点击元素（ref 来自 snapshot）
- `browser_fill` - 填入文本
- `browser_evaluate` - 执行 JavaScript

**Cursor 配置**：在 Cursor 设置中添加 MCP 服务器：

```json
{
  "mcpServers": {
    "easy-proxy": {
      "command": "node",
      "args": ["/path/to/easy-proxy/mcp-server.js"]
    }
  }
}
```

或使用 npm 脚本（在项目目录下）：

```json
{
  "mcpServers": {
    "easy-proxy": {
      "command": "npm",
      "args": ["run", "mcp", "--prefix", "/path/to/easy-proxy"]
    }
  }
}
```

## 文档

- [配置文件结构说明](./CONFIG_STRUCTURE.md) - 配置文件详细说明 ⭐
- [文档索引](./docs/DOCS_INDEX.md) - 了解所有可用文档
- [Mock 优化指南](./MOCK_OPTIMIZATION_SUMMARY.md) - Mock 功能优化说明

## 插件开发

Easy Proxy 提供了强大的插件系统，允许开发者扩展代理功能。详细的插件开发指南请参考：

- [插件系统完整开发指南](./docs/plugin/PLUGIN_SYSTEM_GUIDE.md) ⭐ - 包含插件接口、Hook 协议、示例代码和最佳实践
- [插件架构设计文档](./docs/plugin/RFC_PLUGIN_ARCHITECTURE.md) - 插件系统的架构设计和实施方案
- [插件 API 决策文档](./docs/plugin/ADR-001-plugin-api.md) - 插件 API 与 Hook 协议定版

## 开发

克隆项目到本地
### 安装依赖
`pnpm install`

### 启动
`