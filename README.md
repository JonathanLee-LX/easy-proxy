# 一个非常简单的开发代理服务器

- 自定义代理规则
- 支持https✅

## 使用

全局安装easy-dev-proxy `npm install easy-dev-proxy -g`,会创建一个`ep`命令。

通过`ep`命令即可启动本地的代理服务器

### 自动打开浏览器并设置代理

使用以下任一方式启动：
- `ep --open`（全局安装后）
- `npm run start:open`（开发时）
- `EP_OPEN=1 npm run start`

启动后将使用 Chrome/Edge/Chromium 的 `--proxy-server` 参数启动浏览器，仅该浏览器实例使用代理，不修改系统代理设置。




## 开发

克隆项目到本地
### 安装依赖
`pnpm install`

### 启动
`