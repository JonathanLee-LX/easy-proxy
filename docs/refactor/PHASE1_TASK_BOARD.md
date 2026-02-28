# Phase 1 任务看板（插件化重构）

> 目标：在**不改变现有外部行为**的前提下，建立插件运行骨架并完成首批内置插件迁移路径验证。

## 1. 里程碑与验收

### 里程碑 M1：内核可调度（Week 1）

- 完成 Pipeline 与 HookDispatcher 骨架
- 可注册最小插件并收到 Hook 回调
- 代理核心流程回归通过

### 里程碑 M2：内置插件首迁移（Week 2）

- `builtin-logger` 与 `builtin-router` 完成迁移
- 指标采集与错误隔离机制可用
- 性能回退控制在阈值内（P95 回退 < 5%）

### 里程碑 M3：功能闭环验证（Week 3）

- `builtin-mock` 与 `builtin-replay` 迁移方案验证通过
- 控制面具备基础插件状态展示（可读）
- 具备灰度开关和回滚路径

---

## 2. 多 Agent 分工（执行版）

## Agent A - 平台架构与规范

- A1: 冻结 Hook 协议和上下文字段（依据 ADR-001）
- A2: 定义错误码与降级语义
- A3: 设计 Plugin 生命周期状态机图
- A4: 输出接口变更评审模板

**产出物**:

- `ADR-001-plugin-api.md`（已产出）
- `ADR-002-permission-isolation.md`（待产出）
- `api-contracts/plugin-runtime.v1.md`

**依赖**: 无  
**风险**: 协议频繁改动影响开发并行  
**完成标准**: 协议冻结并通过技术评审

## Agent B - Proxy Kernel 与 Pipeline

- B1: 将请求主流程拆分为阶段化 pipeline
- B2: 接入 HookDispatcher（可插拔执行）
- B3: 封装 Request/Response/Error Context 构建器
- B4: 保留旧路径旁路开关（`EP_PLUGIN_MODE=off`）

**产出物**:

- `core/pipeline/*`
- `core/context/*`
- `core/feature-flags.ts`

**依赖**: A1/A2  
**风险**: 请求链路改动导致隐性回归  
**完成标准**: 现有 E2E 全通过，日志与行为一致

## Agent C - Plugin Runtime

- C1: 实现 Manifest 校验器
- C2: 实现 PluginManager（load/start/stop/dispose）
- C3: 实现 Hook 执行器（priority + timeout + try/catch）
- C4: 插件健康状态机（healthy/degraded/disabled）

**产出物**:

- `plugins/runtime/plugin-manager.ts`
- `plugins/runtime/hook-dispatcher.ts`
- `plugins/runtime/manifest-validator.ts`

**依赖**: A1  
**风险**: 超时与异常策略不一致  
**完成标准**: 故障注入测试可通过

## Agent D - 可观测与诊断

- D1: 定义插件指标模型（count/avg/p95/error/timeout）
- D2: 实现 Hook Trace（按 requestId 串联）
- D3: 输出慢插件告警规则
- D4: 提供基础查询接口（供 UI 读取）

**产出物**:

- `observability/plugin-metrics.ts`
- `observability/hook-trace.ts`
- `/api/plugins/health`（只读）

**依赖**: B2, C3  
**风险**: 指标采集影响性能  
**完成标准**: 指标可见，开销可控

## Agent E - 控制面前端（只读版）

- E1: 新增“插件状态”页签（只读）
- E2: 展示插件列表、状态、版本、hook、错误率
- E3: 展示最近慢调用与错误摘要
- E4: 打通后端健康接口

**产出物**:

- `web/src/components/plugin-status.tsx`
- `web/src/hooks/use-plugin-health.ts`

**依赖**: D4  
**风险**: 信息量大但可读性不足  
**完成标准**: 页面可读、可用于排障

## Agent F - 迁移与兼容

- F1: logger -> builtin-logger 迁移
- F2: router -> builtin-router 迁移
- F3: mock/replay 迁移设计与拆分计划
- F4: 双路径比对工具（legacy vs plugin）

**产出物**:

- `plugins/builtin/logger/*`
- `plugins/builtin/router/*`
- `migration/compare-reports/*`

**依赖**: B2, C2  
**风险**: 行为边界差异引起线上问题  
**完成标准**: 双路径 diff 在可接受范围

## Agent G - 安全治理

- G1: 定义权限清单与默认策略
- G2: 落地运行时权限校验（deny by default）
- G3: 审计日志规范
- G4: local 插件风险评估基线

**产出物**:

- `security/plugin-permissions.ts`
- `security/audit-log-spec.md`

**依赖**: A1, C2  
**风险**: 权限过严影响开发效率  
**完成标准**: 内置插件最小权限可运行

## Agent H - 测试与发布保障

- H1: 建立回归矩阵（功能 + 协议 + UI）
- H2: 构建性能基线（QPS、延迟、内存）
- H3: 混沌测试（插件超时/抛错/崩溃）
- H4: 灰度发布与回滚预案

**产出物**:

- `testplans/plugin-architecture-regression.md`
- `testplans/plugin-chaos.md`
- `release/plugin-rollout-playbook.md`

**依赖**: B/C/D/F  
**风险**: 基线样本不足导致误判  
**完成标准**: 发布演练通过

---

## 3. 任务优先级队列

### P0（必须）

- A1, B1, B2, C2, C3, F1, F2, H1

### P1（高优先）

- C1, D1, D2, G1, G2, H2, F4

### P2（可后置）

- E1-E4（只读控制面）
- G3, G4
- H3, H4

---

## 4. 依赖关系图（简化）

- `A1 -> B2 -> C3 -> D2 -> E1`
- `A1 -> C2 -> F1/F2 -> H1`
- `A1 -> C2 -> G2`
- `B/C/F -> H2/H3/H4`

---

## 5. 周节奏建议

### Week 1

- 完成 A1、B1、B2、C2 骨架
- 输出首个可运行最小插件 demo

### Week 2

- 完成 C3、F1、F2、D1、H1
- 打通基础指标与回归

### Week 3

- 完成 D2、E1（只读）、G2、H2
- 准备灰度与回滚演练

---

## 6. 风险台账

| 风险 | 影响 | 触发信号 | 缓解动作 |
|------|------|----------|----------|
| Hook 语义频繁变更 | 开发停滞 | PR 反复返工 | 冻结 ADR，变更走 RFC 补丁 |
| 性能回退 | 线上体验下降 | P95 增长 > 5% | 增加慢插件预算和降级 |
| 行为不一致 | 功能回归 | 双路径 diff 激增 | 灰度、旁路开关、快速回滚 |
| 权限设计不合理 | 安全或效率问题 | 拒绝率异常/越权操作 | 调整最小权限模板 |

---

## 7. 验收清单（Phase 1 完成定义）

- [x] 内核支持插件调度，且默认可关闭插件模式。
- [x] Logger/Router 迁移完成并通过回归。
- [x] 插件超时与异常不会中断主请求链路。
- [x] 插件级指标可见并可用于排障。
- [x] 至少一次灰度与回滚演练通过。

---

## 8. 下一步（Phase 2 预热）

- 编写 `ADR-002-permission-isolation.md`
- 编写 `ADR-003-migration-rollback.md`
- 准备 `builtin-mock` 迁移切分（匹配、短路响应、配置持久化三子模块）

