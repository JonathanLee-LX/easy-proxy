# 环境变量配置演示

## 功能说明

Mock功能的性能参数现已支持通过环境变量自定义配置，Vite会自动加载`.env`文件中的配置并在构建时注入到代码中。

## 使用步骤

### 1. 创建配置文件

```bash
cd web
cp .env.example .env
```

### 2. 编辑配置

编辑 `web/.env` 文件，根据您的需求调整参数：

#### 示例1: 高性能机器配置（处理超大文件）

```env
# 高性能配置
VITE_MAX_HIGHLIGHT_SIZE=5242880       # 5MB
VITE_MAX_HIGHLIGHT_LINES=50000        # 50000行
VITE_MAX_JSON_MATCHES=200000          # 200000次
VITE_MAX_HTML_MATCHES=100000          # 100000次
VITE_MAX_JS_MATCHES=100000            # 100000次
```

#### 示例2: 低配置设备（优先性能）

```env
# 低配置优化
VITE_MAX_HIGHLIGHT_SIZE=262144        # 256KB
VITE_MAX_HIGHLIGHT_LINES=3000         # 3000行
VITE_MAX_JSON_MATCHES=10000           # 10000次
VITE_MAX_HTML_MATCHES=8000            # 8000次
VITE_MAX_JS_MATCHES=8000              # 8000次
```

#### 示例3: 专注API响应（JSON优化）

```env
# JSON优化配置
VITE_MAX_HIGHLIGHT_SIZE=3145728       # 3MB
VITE_MAX_HIGHLIGHT_LINES=20000        # 20000行
VITE_MAX_JSON_MATCHES=150000          # 150000次 (重点提升)
VITE_MAX_HTML_MATCHES=20000           # 20000次
VITE_MAX_JS_MATCHES=20000             # 20000次
```

### 3. 验证配置

```bash
node test-env-config.cjs
```

输出示例：
```
🔍 检查环境变量配置...

✅ .env.example 文件存在
✅ .env 文件存在

📋 当前配置:
   VITE_MAX_HIGHLIGHT_SIZE = 5242880
   VITE_MAX_HIGHLIGHT_LINES = 50000
   VITE_MAX_JSON_MATCHES = 200000
   VITE_MAX_HTML_MATCHES = 100000
   VITE_MAX_JS_MATCHES = 100000

📋 默认配置:
   VITE_MAX_HIGHLIGHT_SIZE = 1048576 (1MB)
   VITE_MAX_HIGHLIGHT_LINES = 10000
   VITE_MAX_JSON_MATCHES = 50000
   VITE_MAX_HTML_MATCHES = 30000
   VITE_MAX_JS_MATCHES = 30000

💡 提示:
   1. 复制 .env.example 为 .env 来自定义配置
   2. 修改配置后需要重新构建: pnpm run build
   3. 详细配置说明见: ENV_CONFIG.md
```

### 4. 重新构建

```bash
pnpm run build
```

### 5. 测试效果

1. 启动应用
2. 进入Mock配置页面
3. 创建一个Mock规则
4. 粘贴大型JSON/HTML/JavaScript内容
5. 观察语法高亮是否正常工作

## 技术实现

### Vite环境变量机制

Vite通过 `import.meta.env` 提供环境变量访问：

```typescript
// 读取环境变量，提供默认值
const MAX_HIGHLIGHT_SIZE = parseInt(
  import.meta.env.VITE_MAX_HIGHLIGHT_SIZE || '1048576'
)
```

### 构建时注入

在构建过程中，Vite会：
1. 读取 `.env` 文件
2. 解析 `VITE_*` 开头的环境变量
3. 将这些变量注入到代码中
4. 生成包含实际值的生产代码

例如，如果 `.env` 中设置：
```env
VITE_MAX_HIGHLIGHT_SIZE=2097152
```

构建后的代码会变成：
```javascript
const MAX_HIGHLIGHT_SIZE = parseInt("2097152")
```

## 实际使用场景

### 场景1: 团队开发

不同开发者的机器配置不同，可以各自创建 `.env` 文件：

```bash
# 开发者A（高性能MacBook Pro）
VITE_MAX_HIGHLIGHT_SIZE=5242880

# 开发者B（普通笔记本）
VITE_MAX_HIGHLIGHT_SIZE=1048576
```

### 场景2: 环境区分

通过不同的 `.env` 文件配置不同环境：

```bash
# .env.development（开发环境，性能优先）
VITE_MAX_HIGHLIGHT_SIZE=524288

# .env.production（生产环境，功能优先）
VITE_MAX_HIGHLIGHT_SIZE=2097152
```

### 场景3: CI/CD集成

在CI/CD管道中设置环境变量：

```yaml
# GitHub Actions示例
- name: Build with custom config
  run: |
    echo "VITE_MAX_HIGHLIGHT_SIZE=3145728" > web/.env
    cd web && pnpm run build
```

## 参数调优建议

### 如何确定合适的值？

1. **监控性能**
   - 打开浏览器开发者工具
   - 查看Console中的警告信息
   - 如果看到 "Syntax highlighting took Xms" 警告，说明处理时间过长

2. **渐进式调整**
   - 从默认值开始
   - 如果经常遇到无法高亮的文件，逐步增加限制
   - 如果感觉卡顿，适当降低限制

3. **根据使用场景**
   - Mock API响应：提升 `VITE_MAX_JSON_MATCHES`
   - Mock HTML页面：提升 `VITE_MAX_HTML_MATCHES`
   - Mock JS文件：提升 `VITE_MAX_JS_MATCHES`

### 性能基准

| 配置级别 | 文件大小 | 行数 | 适用场景 |
|---------|---------|------|---------|
| 低配置 | 1MB | 5000 | 旧设备、移动设备 |
| 标准配置 | 2MB | 10000 | 大多数场景 |
| 高配置 | 5MB | 20000 | 复杂应用、大文件 |
| 极限配置 | 10MB+ | 50000+ | 高性能机器、特殊需求 |

## 常见问题

### Q: 修改 `.env` 后没有生效？

A: 需要重新构建项目：
```bash
cd web && pnpm run build
```

### Q: 开发模式下如何生效？

A: 修改 `.env` 后重启开发服务器：
```bash
cd web && pnpm run dev
```

### Q: 如何验证配置是否正确？

A: 运行配置检查脚本：
```bash
cd web && node test-env-config.cjs
```

### Q: `.env` 文件会被提交到Git吗？

A: 不会，`.env` 已被添加到 `.gitignore`，只会提交 `.env.example` 示例文件。

### Q: 可以只配置部分参数吗？

A: 可以，未配置的参数会使用默认值。

## 最佳实践

1. **版本控制**
   - 提交 `.env.example` 到Git
   - 不提交 `.env` 文件
   - 在README中说明环境变量用途

2. **团队协作**
   - 在团队文档中说明推荐配置
   - 提供针对不同场景的配置示例
   - 定期更新 `.env.example`

3. **安全性**
   - 不在 `.env` 中存储敏感信息
   - 如需敏感配置，使用 `.env.local`（优先级更高）

4. **文档化**
   - 记录每个参数的作用
   - 说明修改的影响
   - 提供调优建议

## 总结

通过环境变量配置，用户可以：

✅ **灵活调整**：根据硬件性能和使用场景自定义参数  
✅ **简单操作**：只需编辑 `.env` 文件即可  
✅ **自动加载**：Vite自动处理，无需额外配置  
✅ **安全可靠**：`.env` 不会被提交到Git  
✅ **易于维护**：提供示例文件和详细文档  

这大大提升了Mock功能的适应性和用户体验！
