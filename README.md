# 一个非常简单的开发代理服务器

- 自定义代理规则
- 支持https✅

## 使用

全局安装easy-dev-proxy `npm install easy-dev-proxy -g`,会创建一个`ep`命令。

通过`ep`命令即可启动本地的代理服务器

### 配置文件

配置目录：`cwd/.epconfig`，文件命名：`.[env].[json|js]?` 或 `.[env]`

通过 `EP_ENV` 选择环境（默认 `eprc`），按优先级加载：
- `.[env].json` - JSON 格式：`{ "rules": { "pattern": "target" } }`
- `.[env].js` - 导出 `module.exports = { rules: { "pattern": "target" } }`（只读）
- `.[env]` - 行格式：`rule target` 或 `rule1 rule2 target`

示例：`.epconfig/.eprc`、`.epconfig/.dev.json`、`EP_ENV=prod` 时加载 `.epconfig/.prod.json`

若未找到项目配置，则使用 `~/.ep/.eprc`

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

## 开发

克隆项目到本地
### 安装依赖
`pnpm install`

### 启动
`