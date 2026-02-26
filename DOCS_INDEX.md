# Easy Proxy 文档索引

本文档提供了 Easy Proxy 项目所有文档的索引，帮助开发者快速找到需要的信息。

## 用户文档

### 使用指南

- **[README.md](./README.md)** - 项目主文档
  - 安装和使用说明
  - 配置文件格式
  - MCP Server 使用
  - 浏览器控制工具

## 插件开发文档

### 快速入门

- **[插件系统完整开发指南](./PLUGIN_SYSTEM_GUIDE.md)** ⭐ 推荐首选
  - 插件系统概述和核心概念
  - 插件 Manifest 规范详解
  - 插件生命周期（setup/start/stop/dispose）
  - Hook 协议详解（onRequestStart/onBeforeProxy/onBeforeResponse/onAfterResponse/onError）
  - 上下文对象（RequestContext/ResponseContext/ErrorContext）
  - 插件能力 API（Logger/Config/Store/EventBus/HTTP）
  - 错误处理与超时机制
  - 权限模型
  - 四个完整的实战示例
  - 最佳实践（性能优化/错误处理/资源管理/日志/测试）

### 架构设计文档

- **[RFC: 插件化架构重构方案](./RFC_PLUGIN_ARCHITECTURE.md)**
  - 背景和目标
  - 架构原则
  - 目标架构分层
  - 插件模型草案
  - 现有功能迁移映射
  - 安全与治理
  - 性能预算与可观测性
  - 分阶段里程碑
  - 风险与缓解

- **[ADR-001: 插件 API 与 Hook 协议定版](./ADR-001-plugin-api.md)**
  - 决策背景和结果
  - 插件 Manifest 定义
  - 插件运行时接口
  - Hook 协议语义
  - 上下文对象定义
  - 能力 API 规范
  - 错误与超时策略
  - 权限模型
  - 版本与兼容策略

- **[ADR-002: 权限隔离](./ADR-002-permission-isolation.md)**
  - 权限与隔离策略

- **[ADR-003: 迁移回滚](./ADR-003-migration-rollback.md)**
  - 迁移与回滚机制

## 架构重构文档

- **[架构重构 README](./README_ARCH_REFACTOR.md)**
  - 架构重构说明

- **[Phase 1 任务看板](./PHASE1_TASK_BOARD.md)**
  - Phase 1 任务拆解

- **[架构重构评审清单](./ARCH_REFACTOR_REVIEW_CHECKLIST.md)**
  - 评审检查项

- **[路线图](./ROADMAP.md)**
  - 项目路线图

## 代码实现文档

### 核心模块

#### 插件运行时

- **[core/plugin-runtime.js](./core/plugin-runtime.js)**
  - `PluginManager` - 插件管理器
  - `HookDispatcher` - Hook 调度器
  - `validateManifest` - Manifest 验证
  - `runWithTimeout` - 超时控制

- **[core/plugin-bootstrap.js](./core/plugin-bootstrap.js)**
  - `bootstrapPlugins` - 插件启动流程

- **[core/plugin-health.js](./core/plugin-health.js)**
  - `buildPluginHealth` - 插件健康状态构建

### 测试文件

- **[tests/plugin-runtime.spec.js](./tests/plugin-runtime.spec.js)**
  - PluginManager 测试
  - HookDispatcher 测试
  - 优先级调度测试
  - 超时和统计测试

- **[tests/plugin-bootstrap.spec.js](./tests/plugin-bootstrap.spec.js)**
  - 插件启动流程测试

- **[tests/plugin-health.spec.js](./tests/plugin-health.spec.js)**
  - 健康状态构建测试

## 快速导航

### 我想了解...

- **如何开发一个插件？**
  → 查看 [插件系统完整开发指南](./PLUGIN_SYSTEM_GUIDE.md)

- **插件系统的设计理念？**
  → 查看 [RFC: 插件化架构重构方案](./RFC_PLUGIN_ARCHITECTURE.md)

- **插件 API 的详细规范？**
  → 查看 [ADR-001: 插件 API 与 Hook 协议定版](./ADR-001-plugin-api.md)

- **如何使用 Easy Proxy？**
  → 查看 [README.md](./README.md)

- **插件运行时是如何工作的？**
  → 查看 [core/plugin-runtime.js](./core/plugin-runtime.js) 源码
  → 查看 [tests/plugin-runtime.spec.js](./tests/plugin-runtime.spec.js) 测试用例

- **有哪些插件示例？**
  → 查看 [插件系统完整开发指南](./PLUGIN_SYSTEM_GUIDE.md) 第 10 章节

## 文档贡献

如果您发现文档有误或需要改进，欢迎提交 Pull Request 或 Issue。

---

最后更新：2026-02-26
