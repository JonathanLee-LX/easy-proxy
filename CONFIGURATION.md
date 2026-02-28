# Easy Proxy 配置文件说明

## 配置文件结构

所有配置文件统一存放在 `~/.ep/` 目录下：

```
~/.ep/
├── rules.eprc              # 路由规则配置（主配置）
├── rules.json              # 路由规则配置（JSON格式，可选）
├── rules.js                # 路由规则配置（JS格式，可选）
├── mocks.json              # Mock 规则配置
├── settings.json           # 系统设置（主题、字体、AI配置等）
└── ca/                     # SSL证书目录
    ├── rootCA.crt
    └── rootCA.key
```

## 配置文件详解

### 1. 路由规则配置

**优先级**: `项目目录下配置` > `~/.ep/rules.*`

#### 格式选择

1. **EPRC 格式** (推荐)
   - 文件名：`.eprc` 或 `rules.eprc`
   - 格式：简洁的文本格式
   ```
   # 将 example.com 的请求代理到本地
   example.com 127.0.0.1:3000
   
   # 支持正则表达式
   /api/.*  http://localhost:8080
   
   # 禁用规则（使用 // 注释）
   // disabled.com 127.0.0.1:3000
   ```

2. **JSON 格式**
   - 文件名：`ep.config.json` 或 `rules.json`
   - 格式：标准 JSON
   ```json
   {
     "rules": {
       "example.com": "127.0.0.1:3000",
       "/api/.*": "http://localhost:8080"
     }
   }
   ```

3. **JavaScript 格式** (最灵活)
   - 文件名：`ep.config.js` 或 `rules.js`
   - 格式：JS 模块
   ```javascript
   module.exports = {
     'example.com': '127.0.0.1:3000',
     '/api/.*': 'http://localhost:8080'
   }
   ```

### 2. Mock 规则配置

**文件**: `~/.ep/mocks.json`

存储所有 Mock 规则，包括 URL 匹配、响应内容、状态码等。

```json
{
  "nextId": 1,
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
      "body": "{\"name\":\"test\"}",
      "enabled": true
    }
  ]
}
```

### 3. 系统设置

**文件**: `~/.ep/settings.json`

存储系统级别的设置，包括主题、字体、AI配置等。

```json
{
  "theme": "dark",
  "fontSize": "medium",
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

## 配置优先级

### 路由规则配置

1. 项目目录下的配置文件（优先）
   - `.eprc`
   - `ep.config.json`
   - `ep.config.js`

2. 用户主目录配置文件（默认）
   - `~/.ep/rules.eprc`
   - `~/.ep/rules.json`
   - `~/.ep/rules.js`

### Mock 规则配置

- 固定使用 `~/.ep/mocks.json`
- 通过 Web 界面管理

### 系统设置

- 固定使用 `~/.ep/settings.json`
- 通过设置面板管理
- 自动从 localStorage 迁移旧配置

## 配置文件管理

### 通过 Web 界面

1. **路由规则**: 访问 "路由规则" 标签页
2. **Mock 规则**: 访问 "Mock" 标签页
3. **系统设置**: 点击右上角设置按钮

### 通过命令行

```bash
# 查看配置目录
ls -la ~/.ep/

# 编辑路由规则
vim ~/.ep/rules.eprc

# 查看Mock规则
cat ~/.ep/mocks.json

# 查看系统设置
cat ~/.ep/settings.json
```

### 备份和恢复

```bash
# 备份所有配置
tar -czf easy-proxy-config-backup.tar.gz ~/.ep/

# 恢复配置
tar -xzf easy-proxy-config-backup.tar.gz -C ~/
```

## 迁移指南

### 从 localStorage 迁移

系统会自动检测并迁移以下 localStorage 数据到 `settings.json`：
- `theme-storage` → `theme`
- `font-size` → `fontSize`
- `easy-proxy-ai-config` → `aiConfig`

迁移完成后，旧的 localStorage 数据仍会保留作为备份。

### 配置文件升级

如果需要重命名或移动配置文件，建议步骤：

1. 备份现有配置
2. 创建新配置文件
3. 复制内容
4. 测试新配置
5. 删除旧配置

## 常见问题

**Q: 配置文件丢失怎么办？**
A: 系统会自动创建默认配置文件，所有配置会恢复为默认值。

**Q: 可以手动编辑配置文件吗？**
A: 可以，但建议通过 Web 界面管理，以避免格式错误。

**Q: 如何在多台机器间同步配置？**
A: 可以使用云盘同步 `~/.ep/` 目录，或使用版本控制系统。

**Q: JS 格式的路由配置不能通过界面编辑？**
A: 是的，JS 格式配置为只读，只能手动编辑文件。
