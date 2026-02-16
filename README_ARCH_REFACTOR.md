# 架构重构文档导航

> 本目录用于插件化架构重构的设计与执行基线。  
> 阅读顺序建议：先看总 RFC，再看 ADR，最后看执行与评审清单。

## 1) 总体方案

- `RFC_PLUGIN_ARCHITECTURE.md`
  - 全局目标、分层架构、插件模型、迁移路径、里程碑

## 2) 关键决策（ADR）

- `ADR-001-plugin-api.md`
  - 插件 API、Hook 协议、上下文模型、版本策略
- `ADR-002-permission-isolation.md`
  - 权限模型、隔离策略、审计治理
- `ADR-003-migration-rollback.md`
  - 双路径迁移（off/shadow/on）、灰度与回滚机制

## 3) 执行计划

- `PHASE1_TASK_BOARD.md`
  - 多 Agent 任务拆解、依赖、里程碑、风险台账

## 4) 评审与拍板

- `ARCH_REFACTOR_REVIEW_CHECKLIST.md`
  - 评审会逐项勾选清单、Go/No-Go 标准、行动项模板

## 5) 当前状态建议

- 设计文档阶段：已完成
- 下一步：进入 Phase 1 实施前，先补齐和跑通基线单元测试
- 实施中要求：每个关键重构步骤后运行测试，确保行为一致

### Phase 1 实施进度（持续更新）

- [x] 建立插件运行时骨架（PluginManager + HookDispatcher）
- [x] 建立 Pipeline 骨架（off/shadow/on）
- [x] 接入 router/logger builtin 插件（可开关）
- [x] shadow 对照统计与 readiness 判定接口
- [x] on 模式 host 白名单 gate
- [x] logger 聚合统计与插件健康接口
- [x] mock builtin 插件（仅 inline，默认关闭）
- [x] 重构期一键回归脚本（`npm run test:refactor`）
- [x] 关键重构 API 运行态 smoke 验证（含高端口基线）
- [ ] 进入按白名单小流量 on 模式验证（下一阶段灰度执行）

## 6) 重构实施运行手册（当前）

### 必跑测试

- 基线/回归测试：
  - `npm test`
  - `npm run test:refactor`（语法检查 + 单元测试）

### 推荐启动命令（重构演练）

- `npm run start:plugin:off`
- `npm run start:plugin:shadow`
- `npm run start:plugin:on`
- `npm run smoke:refactor`（服务启动后检查关键重构 API）
- `npm run drill:rollout`（一键演练 `shadow -> on(allowlist) -> off(rollback)`）

建议：

- 每次改动核心链路后都执行 `npm test`
- 每次改动 `index.js` 后先执行 `node -c index.js` 再跑测试

### 关键环境变量

- `EP_PLUGIN_MODE`
  - `off`：关闭插件决策（默认）
  - `shadow`：仅观测，不生效
  - `on`：插件决策生效
- `EP_PLUGIN_ON_HOSTS`
  - `on` 模式 host 白名单，逗号分隔；为空表示全部 host
- `EP_ENABLE_BUILTIN_ROUTER`
  - 是否启用 builtin router 插件，默认 `true`
- `EP_ENABLE_BUILTIN_LOGGER`
  - 是否启用 builtin logger 插件，默认 `true`
- `EP_ENABLE_BUILTIN_MOCK`
  - 是否启用 builtin mock 插件，默认 `false`
  - 当前仅接管 `inline` mock；`file` mock 仍走 legacy 逻辑
- `EP_SHADOW_WARN_MIN_SAMPLES`
  - shadow 告警最小样本数，默认 `200`
- `EP_SHADOW_WARN_DIFF_RATE`
  - shadow 告警差异率阈值，默认 `0.05`

### 观测 API（重构阶段）

- `GET /api/pipeline/config`
  - 查看当前 pipeline 配置、阈值、allowlist、on-mode gate 统计
- `GET /api/pipeline/shadow-stats`
  - 查看 shadow 对照统计（含 diff 样本、topDiffs）
- `POST /api/pipeline/shadow-stats`
- `DELETE /api/pipeline/shadow-stats`
  - 重置 shadow 统计与 on-mode gate 统计
- `GET /api/pipeline/readiness`
  - 根据阈值输出是否达到切 `on` 的 readiness 判定
- `GET /api/refactor/status`
  - 聚合返回模式、readiness、建议动作、shadow 统计、插件健康和 logger 摘要
- `GET /api/plugins`
  - 查看当前注册插件、生命周期状态、Hook 统计
- `GET /api/plugins/health`
  - 查看插件聚合健康状态（overall/counts）与各插件错误率
- `GET /api/plugins/logger`
  - 查看 builtin logger 的 recent + summary
- `GET /api/plugins/mock`
  - 查看 builtin mock 是否启用以及当前接管策略

