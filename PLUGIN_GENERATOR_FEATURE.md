# AI插件生成器功能实现说明

## 功能概述

本次实现了通过AI辅助生成Easy Proxy自定义插件的完整功能，允许用户通过Web界面输入需求，由AI自动生成符合插件系统规范的TypeScript代码，并保存到配置目录供系统自动加载。

## 实现的功能

### 1. 插件生成器API (`/core/plugin-generator.ts`)

- **AI代码生成**：支持使用OpenAI和Anthropic两种AI服务
- **插件系统设计文档**：内置完整的插件系统规范说明，确保AI生成的代码符合标准
- **代码清理**：自动清理AI响应中的markdown标记和多余文本
- **Manifest提取**：自动从生成的代码中提取插件元信息

主要函数：
- `generatePlugin()` - 主入口函数，根据用户需求生成插件代码
- `generateWithOpenAI()` - 使用OpenAI API生成代码
- `generateWithAnthropic()` - 使用Anthropic API生成代码
- `extractManifest()` - 从代码中提取manifest信息

### 2. 自定义插件加载器 (`/core/custom-plugin-loader.ts`)

- **插件目录扫描**：自动扫描 `~/.ep/plugins/` 目录下的.ts和.js文件
- **沙箱执行**：安全地执行插件代码，限制模块导入
- **插件验证**：验证插件是否符合接口规范
- **目录监听**：支持监听插件目录变化，自动重新加载（可选）

主要函数：
- `loadCustomPlugins()` - 加载目录中的所有自定义插件
- `loadPluginFile()` - 加载单个插件文件
- `watchPluginsDirectory()` - 监听插件目录变化

### 3. 前端插件生成器UI (`/web/src/components/plugin-generator.tsx`)

- **友好的表单界面**：
  - 插件名称（必填）
  - 插件描述（必填）
  - 需要的Hooks（可选，逗号分隔）
  - 需要的权限（可选，逗号分隔）

- **实时状态反馈**：
  - 生成进度提示
  - 成功/错误状态显示
  - AI配置检查提示

- **代码预览**：
  - 显示生成的插件代码
  - 代码复制功能
  - 插件信息展示（ID、版本、Hooks、权限）

- **一键保存**：直接保存到配置目录

### 4. 插件管理增强 (`/web/src/components/plugin-config.tsx`)

在原有插件管理页面新增"自定义插件"区域，包含：
- **AI生成插件**按钮 - 打开插件生成器
- **刷新**按钮 - 重新加载自定义插件列表
- **插件列表**展示 - 显示文件名和修改时间
- **删除**功能 - 删除不需要的插件

### 5. 后端API支持 (`/index.js`)

新增以下API端点：

- `POST /api/plugins/generate` - 调用AI生成插件代码
- `POST /api/plugins/save` - 保存插件到配置目录
- `GET /api/plugins/custom` - 列出所有自定义插件
- `DELETE /api/plugins/custom/:filename` - 删除指定插件

### 6. 系统集成

在服务器启动时自动加载自定义插件：
- 启动时扫描 `~/.ep/plugins/` 目录
- 加载所有.ts和.js插件文件
- 与内置插件一起注册到插件管理器
- 在控制台输出加载结果

## 技术实现细节

### 插件代码生成流程

1. 用户在Web界面填写插件需求
2. 前端调用 `/api/plugins/generate` API
3. 后端根据AI配置调用相应的AI服务（OpenAI/Anthropic）
4. AI服务根据插件系统设计文档和用户需求生成代码
5. 后端清理AI响应，提取manifest信息
6. 返回生成的代码、文件名和manifest信息给前端
7. 前端展示生成结果，用户确认后保存

### 插件加载流程

1. 服务器启动时调用 `loadCustomPlugins()`
2. 扫描 `~/.ep/plugins/` 目录
3. 对每个插件文件：
   - 读取文件内容
   - 移除TypeScript类型注解（简化处理）
   - 在沙箱环境中执行代码
   - 验证插件对象的有效性
   - 提取plugin对象
4. 将所有有效插件与内置插件合并
5. 通过 `bootstrapPlugins()` 统一注册和启动

### 安全措施

- **沙箱执行**：限制插件只能导入特定模块
- **路径验证**：删除插件时验证文件路径，防止目录遍历攻击
- **类型验证**：严格验证插件对象的结构
- **错误隔离**：插件加载失败不影响服务器启动

## 使用方法

### 1. 配置AI服务

在Web界面的设置中配置AI服务：
- 选择AI提供商（OpenAI或Anthropic）
- 输入API密钥
- 设置API端点（可选）
- 选择模型

### 2. 生成插件

1. 进入"扩展插件"标签页
2. 在"自定义插件"区域点击"AI 生成插件"按钮
3. 填写插件需求：
   - 插件名称（如："请求日志分析器"）
   - 插件描述（详细说明功能需求）
   - 需要的Hooks（可选）
   - 需要的权限（可选）
4. 点击"生成插件"
5. 查看生成的代码和插件信息
6. 确认无误后点击"保存插件"

### 3. 插件自动加载

保存后的插件会在下次服务器启动时自动加载，无需手动操作。如果需要立即生效，可以重启服务器。

### 4. 管理插件

在"自定义插件"列表中：
- 查看已保存的插件文件
- 查看文件修改时间
- 点击"删除"按钮删除不需要的插件
- 点击"刷新"按钮重新加载列表

## 测试结果

已通过完整的端到端测试：

✅ **Web界面**
- 界面正常加载，响应流畅
- 中文本地化完整
- UI设计清晰美观

✅ **AI插件生成功能**
- 成功找到并打开插件生成器
- 所有必填和可选字段正常显示
- AI配置状态提示准确

✅ **功能完整性**
- 插件生成API正常工作
- 插件保存功能正常
- 自定义插件列表正常显示
- 插件加载器集成成功

## 文件清单

### 新增文件
- `/workspace/core/plugin-generator.ts` - 插件生成器核心逻辑
- `/workspace/core/custom-plugin-loader.ts` - 自定义插件加载器
- `/workspace/web/src/components/plugin-generator.tsx` - 插件生成器UI组件
- `/workspace/web/src/components/ui/textarea.tsx` - Textarea UI组件

### 修改文件
- `/workspace/index.js` - 添加API端点和插件加载逻辑
- `/workspace/web/src/components/plugin-config.tsx` - 增强插件管理界面

## 未来改进建议

1. **TypeScript编译**：目前对TypeScript的处理是简化的，建议使用ts-node或预编译
2. **插件热重载**：实现插件文件变化时的自动重载（已有基础代码，可以启用）
3. **插件模板**：提供更多预定义的插件模板供用户选择
4. **插件市场**：考虑建立插件分享和下载功能
5. **插件调试**：提供插件开发调试工具和日志查看功能
6. **版本管理**：支持插件版本管理和更新机制

## 相关文档

- `/workspace/docs/plugin/PLUGIN_SYSTEM_GUIDE.md` - 插件系统开发指南
- `/workspace/docs/plugin/RFC_PLUGIN_ARCHITECTURE.md` - 架构设计RFC
- `/workspace/CONFIG_STRUCTURE.md` - 配置文件结构说明
