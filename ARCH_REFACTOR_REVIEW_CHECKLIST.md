# 插件化架构重构评审清单

> 用于技术评审会 / 里程碑评审会的逐项核对。  
> 关联文档：`RFC_PLUGIN_ARCHITECTURE.md`、`ADR-001-plugin-api.md`、`ADR-002-permission-isolation.md`、`ADR-003-migration-rollback.md`、`PHASE1_TASK_BOARD.md`

---

## 1. 目标与边界确认

- [ ] 已明确重构目标：平台化、可扩展、可治理、可观测、兼容迁移。
- [ ] 已明确非目标：当前不做插件市场、不做跨语言运行时、不一次性全量替换。
- [ ] 已确认“先规划后实现”的阶段策略，无越界实现行为。
- [ ] 已确认本次重构不改变现有用户主路径体验（规则、日志、Mock、Replay）。

## 2. 架构设计评审（RFC）

- [ ] 内核职责边界清晰：仅协议处理 + 调度，不承载业务规则。
- [ ] Plugin Runtime 具备生命周期管理（setup/start/stop/dispose）。
- [ ] Hook 协议覆盖完整生命周期（request/proxy/response/error）。
- [ ] Control Plane 目标形态明确（插件状态、配置、健康可视化）。
- [ ] 数据流与控制流无循环依赖和隐性耦合。

## 3. API 合同评审（ADR-001）

- [ ] Manifest 字段已冻结（id/version/apiVersion/permissions/hooks/priority）。
- [ ] Hook 语义清晰，副作用边界明确（尤其 `onBeforeProxy` 的短路响应）。
- [ ] Context 字段已定义且不泄露内核内部结构。
- [ ] PluginContext 能力 API 与权限一一对应。
- [ ] API 版本策略已明确（1.x 兼容，破坏变更进 2.0）。

## 4. 安全与治理评审（ADR-002）

- [ ] 权限模型为默认拒绝（deny by default）。
- [ ] 高风险权限（network:outbound/config:write）策略已确认。
- [ ] 所有能力 API 具备权限门禁点。
- [ ] 审计日志字段完整（pluginId/requestId/allow-deny/error）。
- [ ] 插件异常与超时具备降级与自动禁用策略。

## 5. 迁移与回滚评审（ADR-003）

- [ ] 已采用双路径策略：`off/shadow/on` 模式清晰可切换。
- [ ] 迁移顺序确认：logger -> router -> mock -> replay。
- [ ] shadow 对照指标定义完成（target/mock/status/body parity）。
- [ ] 回滚触发阈值明确（错误率、延迟、行为偏差）。
- [ ] 回滚动作可分钟级执行，且已定义验证步骤。

## 6. 实施计划评审（Phase 1 Board）

- [ ] A-H 多 Agent 分工无重叠冲突，依赖关系清晰。
- [ ] 里程碑（M1/M2/M3）目标明确且可验证。
- [ ] 每个任务有产出物、风险、完成标准（DoD）。
- [ ] P0/P1/P2 优先级排序合理，资源分配可执行。
- [ ] 每周节奏（Week1/2/3）与团队容量匹配。

## 7. 测试与质量保障评审

- [ ] 已定义回归矩阵（功能、协议、UI、性能、稳定性）。
- [ ] 已定义混沌测试场景（插件抛错、超时、降级）。
- [ ] 已定义性能基线（P50/P95/P99、吞吐、内存）。
- [ ] 已定义灰度发布前的必过检查项。
- [ ] 已定义回滚演练频次和记录模板。

## 8. 可观测性评审

- [ ] 插件级指标清单完整（count/avg/p95/error/timeout/degrade）。
- [ ] 请求级 Hook Trace 可关联 requestId/traceId。
- [ ] 慢插件告警阈值与策略已定。
- [ ] 控制面可查看关键健康状态（至少只读）。
- [ ] 指标采集开销在可接受预算内。

## 9. 文档与协作评审

- [ ] RFC/ADR/Task Board 文档相互引用一致，无冲突描述。
- [ ] 关键术语已统一（plugin/hook/context/permission/shadow）。
- [ ] 迁移策略和回滚策略已对齐发布流程。
- [ ] 评审结论、遗留问题、owner 和截止时间已记录。
- [ ] 代码实施前已完成“最终拍板版本”文档冻结。

## 10. 立项通过标准（Go / No-Go）

- [ ] 若第 2-5 章存在未决阻断项，则 **No-Go**（不得进入开发）。
- [ ] 若第 6-8 章仅有可接受风险且有明确 owner/截止时间，则 **Conditional Go**。
- [ ] 若第 1-9 章核心项全部通过，则 **Go** 进入 Phase 1 开发。

---

## 11. 评审记录模板

### 本次评审结论

- 结论：`Go / Conditional Go / No-Go`
- 日期：
- 主持人：
- 记录人：

### 阻断项（Blocking Issues）

1.  
2.  
3.  

### 行动项（Action Items）

1. [Owner] [Deadline] [Action]
2. [Owner] [Deadline] [Action]
3. [Owner] [Deadline] [Action]

