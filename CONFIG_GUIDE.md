# Easy Proxy 配置文件指南

## 📁 配置文件结构（已整理）

现在所有配置文件统一存放在 `~/.ep/` 目录下，结构清晰：

```
~/.ep/
├── .eprc              # 路由规则配置（默认位置）
├── mocks.json         # Mock 规则配置
├── settings.json      # 系统设置（主题、字体、AI配置等）
└── ca/                # SSL 证书目录
    ├── rootCA.crt     # 根证书
    └── rootCA.key     # 根证书私钥
```

## 🔧 配置文件说明

### 1. 路由规则配置 (`.eprc`)

**作用**: 定义 HTTP 请求的路由转发规则

**格式**: 简洁的文本格式
```
# 将 example.com 的请求代理到本地
example.com 127.0.0.1:3000

# 使用正则表达式匹配
/api/.* http://localhost:8080

# 禁用规则（使用 // 注释）
// disabled.com 127.0.0.1:3000
```

**替代格式** (可选):
- `ep.config.json` - JSON 格式
- `ep.config.js` - JavaScript 格式（只读）

**优先级**: 项目目录配置 > `~/.ep/.eprc`

### 2. Mock 规则配置 (`mocks.json`)

**作用**: 定义 Mock 响应规则，拦截请求并返回预设响应

**格式**: JSON
```json
{
  "nextId": 2,
  "rules": [
    {
      "id": 1,
      "name": "模拟用户API",
      "urlPattern": "/api/user",
      "method": "GET",
      "statusCode": 200,
      "delay": 0,
      "bodyType": "inline",
      "headers": {
        "content-type": "application/json"
      },
      "body": "{\"name\":\"John\"}",
      "enabled": true
    }
  ]
}
```

**管理方式**: 
- ✅ 推荐通过 Web 界面管理（Mock 标签页）
- ⚠️  可手动编辑，但需注意 JSON 格式

### 3. 系统设置 (`settings.json`)

**作用**: 存储系统级别的配置，包括 UI 偏好和 AI 功能配置

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

**管理方式**: 
- ✅ 推荐通过设置面板管理
- ℹ️  自动从 localStorage 迁移旧配置

## 📋 配置管理最佳实践

### 通过 Web 界面（推荐）

1. **路由规则**: 
   - 访问 http://localhost:8899
   - 点击"路由规则"标签
   - 编辑、保存规则

2. **Mock 规则**: 
   - 点击"Mock"标签
   - 新增/编辑/删除规则

3. **系统设置**: 
   - 点击右上角设置图标
   - 修改主题、字体、AI 配置
   - 点击保存

### 通过文件系统

```bash
# 查看所有配置文件
ls -la ~/.ep/

# 编辑路由规则
vim ~/.ep/.eprc

# 查看 Mock 规则
cat ~/.ep/mocks.json | jq .

# 查看系统设置
cat ~/.ep/settings.json | jq .
```

## 🔄 配置迁移

### 从旧版本迁移

如果你的配置文件在 `~/.ep/.epconfig/` 目录下，运行清理脚本：

```bash
./scripts/clean-old-config.sh
```

脚本会自动：
- 迁移 `~/.ep/.epconfig/settings.json` → `~/.ep/settings.json`
- 删除空的 `.epconfig` 目录
- 显示配置文件结构

### 从 localStorage 迁移

系统会自动检测并迁移以下数据到 `settings.json`：
- `theme-storage` → `theme`
- `font-size` → `fontSize`
- `easy-proxy-ai-config` → `aiConfig`

## 💾 备份与恢复

### 备份所有配置

```bash
# 创建备份
tar -czf easy-proxy-backup-$(date +%Y%m%d).tar.gz ~/.ep/

# 查看备份内容
tar -tzf easy-proxy-backup-*.tar.gz
```

### 恢复配置

```bash
# 恢复备份
tar -xzf easy-proxy-backup-*.tar.gz -C ~/

# 或指定目标目录
tar -xzf easy-proxy-backup-*.tar.gz -C /tmp/restore/
```

## ❓ 常见问题

### Q: 为什么有多个配置文件？

A: 不同类型的配置分离，便于管理和备份：
- **路由规则** - 项目/环境相关，可能频繁修改
- **Mock 规则** - 测试数据，独立管理
- **系统设置** - 个人偏好，跨项目共享

### Q: 配置文件丢失怎么办？

A: 系统会自动创建默认配置文件，不会影响使用。建议定期备份。

### Q: 可以版本控制配置文件吗？

A: 
- ✅ **路由规则** - 可以，建议将项目的 `.eprc` 加入版本控制
- ⚠️  **Mock 规则** - 可以，但注意不要提交敏感数据
- ❌ **系统设置** - 不建议，包含 API Key 等敏感信息

### Q: 如何在多台机器间同步配置？

A: 方案1（推荐）：
```bash
# 机器 A 导出配置
tar -czf my-config.tar.gz ~/.ep/

# 机器 B 导入配置
tar -xzf my-config.tar.gz -C ~/
```

方案2：使用云盘同步 `~/.ep/` 目录（注意安全）

### Q: `.eprc` 文件是空的，正常吗？

A: 正常。空文件表示没有自定义路由规则，所有请求会直接转发。

## 🔐 安全建议

1. **保护 API Keys**: 
   - 不要分享 `settings.json`
   - 不要将其提交到公开仓库

2. **SSL 证书安全**:
   - 定期备份 `~/.ep/ca/` 目录
   - 不要分享私钥文件

3. **配置备份**:
   - 定期备份配置文件
   - 将备份存储在安全位置

## 📚 更多信息

- [完整配置文档](./CONFIGURATION.md)
- [Mock 优化指南](./MOCK_OPTIMIZATION_SUMMARY.md)
- [README](./README.md)
