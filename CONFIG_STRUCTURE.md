# Easy Proxy 配置文件结构说明

## 📂 目录结构

```
~/.ep/
├── .eprc              # 路由规则配置文件
├── mocks.json         # Mock 规则配置文件
├── settings.json      # 系统设置配置文件
└── ca/                # SSL 证书目录
    ├── rootCA.crt     # 根证书
    ├── rootCA.key     # 根证书私钥
    └── *.crt/*.key    # 动态生成的域名证书
```

## 📝 配置文件说明

### 1. 路由规则 (`~/.ep/.eprc`)

**用途**: 定义 HTTP 请求的路由转发规则

**格式**: EPRC 文本格式
```
# 示例规则
example.com 127.0.0.1:3000
/api/.* http://localhost:8080

# 禁用规则（使用 // 注释）
// disabled.com 127.0.0.1:3000
```

**管理方式**:
- Web 界面："路由规则"标签页
- 手动编辑文件

### 2. Mock 规则 (`~/.ep/mocks.json`)

**用途**: 定义 Mock 响应规则

**格式**: JSON
```json
{
  "nextId": 2,
  "rules": [
    {
      "id": 1,
      "name": "模拟API响应",
      "urlPattern": "/api/user",
      "method": "GET",
      "statusCode": 200,
      "body": "{\"name\":\"test\"}",
      "enabled": true
    }
  ]
}
```

**管理方式**:
- Web 界面："Mock"标签页（推荐）

### 3. 系统设置 (`~/.ep/settings.json`)

**用途**: 存储系统级别的配置

**格式**: JSON
```json
{
  "theme": "dark",
  "fontSize": "large",
  "aiConfig": {
    "enabled": true,
    "provider": "openai",
    "apiKey": "sk-...",
    "baseUrl": "https://api.openai.com/v1/chat/completions",
    "model": "gpt-4o-mini",
    "models": [
      {
        "id": "1",
        "name": "GPT-4",
        "provider": "openai",
        "apiKey": "sk-...",
        "baseUrl": "https://api.openai.com/v1/chat/completions",
        "model": "gpt-4"
      }
    ],
    "activeModelId": "1"
  }
}
```

**包含内容**:
- `theme`: 主题设置 (light/dark/system)
- `fontSize`: 字体大小 (small/medium/large)
- `aiConfig`: AI 功能配置
  - `enabled`: 是否启用
  - `provider`: 服务商 (openai/anthropic)
  - `apiKey`: API 密钥
  - `baseUrl`: API 端点
  - `model`: 模型名称
  - `models`: 多模型配置（可选）
  - `activeModelId`: 当前激活的模型（可选）

**管理方式**:
- Web 界面：右上角设置按钮（推荐）

### 4. SSL 证书 (`~/.ep/ca/`)

**用途**: 存储 HTTPS 代理所需的 SSL 证书

**内容**:
- `rootCA.crt` / `rootCA.key`: 根证书和私钥
- 动态生成的域名证书：访问 HTTPS 网站时自动创建

**管理方式**:
- 自动管理，无需手动操作
- 首次使用需要信任根证书

## 🔄 配置优先级

### 路由规则配置
1. **项目目录**（优先级最高）
   - `./.eprc`
   - `./ep.config.json`
   - `./ep.config.js`

2. **用户主目录**（默认）
   - `~/.ep/.eprc`

### Mock 规则配置
- 固定位置：`~/.ep/mocks.json`

### 系统设置
- 固定位置：`~/.ep/settings.json`
- 自动从 localStorage 迁移旧配置

## 💡 配置文件特点

### ✅ 优势

1. **扁平化结构**: 配置文件直接在 `~/.ep/` 下，易于查找
2. **分类清晰**: 证书文件单独在 `ca/` 子目录
3. **易于备份**: 只需备份 `~/.ep/` 目录
4. **便于编辑**: 配置文件路径简单，无嵌套目录

### 📋 配置文件对比

| 配置类型 | 位置 | 格式 | 管理方式 |
|---------|------|------|---------|
| 路由规则 | `~/.ep/.eprc` | 文本 | Web界面/手动编辑 |
| Mock规则 | `~/.ep/mocks.json` | JSON | Web界面 |
| 系统设置 | `~/.ep/settings.json` | JSON | Web界面 |
| SSL证书 | `~/.ep/ca/` | 二进制 | 自动管理 |

## 🛠️ 常用操作

### 查看配置

```bash
# 查看目录结构
ls -la ~/.ep/

# 查看路由规则
cat ~/.ep/.eprc

# 查看 Mock 规则
cat ~/.ep/mocks.json | jq .

# 查看系统设置
cat ~/.ep/settings.json | jq .

# 查看证书文件
ls -la ~/.ep/ca/
```

### 备份配置

```bash
# 完整备份
tar -czf easy-proxy-backup.tar.gz ~/.ep/

# 仅备份配置（不含证书）
tar -czf config-backup.tar.gz ~/.ep/.eprc ~/.ep/mocks.json ~/.ep/settings.json
```

### 恢复配置

```bash
# 恢复完整备份
tar -xzf easy-proxy-backup.tar.gz -C ~/

# 恢复单个配置文件
cp backup/settings.json ~/.ep/
```

## 🔐 安全提示

1. **保护敏感信息**:
   - `settings.json` 包含 API Key，不要分享
   - 不要将 `settings.json` 提交到公开仓库

2. **证书安全**:
   - 定期备份 `ca/` 目录
   - 不要分享 `rootCA.key` 私钥文件

3. **配置备份**:
   - 建议定期备份整个 `~/.ep/` 目录
   - 可使用云盘同步（注意加密敏感文件）

## 🚀 迁移说明

### 从旧版本迁移

如果你从旧版本升级，运行清理脚本自动迁移：

```bash
./scripts/clean-old-config.sh
```

脚本会自动处理：
- ✅ 迁移 `~/.ep/.epconfig/settings.json` → `~/.ep/settings.json`
- ✅ 清理空的子目录
- ✅ 恢复证书文件到 `ca/` 目录
- ✅ 从 localStorage 迁移旧配置

## 📚 相关文档

- [详细配置文档](./CONFIGURATION.md)
- [Mock 优化指南](./MOCK_OPTIMIZATION_SUMMARY.md)
- [README](./README.md)
