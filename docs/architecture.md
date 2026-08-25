# 产品与架构边界

本文只记录 Open Flow 必须长期成立的产品事实、模块所有权和运行时不变量。字段、路由、错误码和分页属于
[Control API 技术参考](control/contracts/control-api.md)；部署、存储、调度和恢复细节属于对应实现或交付文档。

## 1. 产品边界

Open Flow 由一套公共产品合同和多个彼此独立的部署实现组成。Hosted 是在线实现，Server 是可自行部署的实现；两者通过版本化
Control API 和 black-box conformance 对齐，不共享 application service、数据库 schema 或部署 runtime。

```text
Workbench ─┐                         ┌── Hosted implementation
           ├── Control API protocol ┤
CLI ───────┘                         └── Server implementation
```

Workbench 和 CLI 只操作当前选定的一个部署，不拥有本地 Project、第二套持久化或执行模型，也不能在部署之间静默 fallback。

### Project 与 Revision

Project 是部署生成的稳定 opaque identity，不是目录、Git 仓库、文件路径或单个 Flow。一个 Project 可以包含多个 Flow，并共享
Subflow、Task 和 CodeModule。

Project 有一个可变 Draft head 和不可变的 ProjectRevision 历史。ProjectRevision 是工作流语义与 CodeModule source 的完整事实来源；
语义修改必须以预期 Revision 为前提原子提交，不能静默覆盖 stale head。内部索引、缓存、增量记录和存储布局不能成为第二个事实来源。

Presentation 独立保存布局、viewport 和 Comment 等展示状态，不进入 Revision digest，也不影响 validation、Run、Publication 或 Live。
ProjectRevision 不保存 credential、Run、Engine IR、Provider 状态或部署缓存。

### Scope 与身份

Hosted 以认证 principal 中的稳定 tenant identity 隔离产品资源。Server 首版提供单 deployment workspace，由同一 deployment operator
credential 认证浏览器 session 与 machine client。
客户端选择的 scope、operator identity、workload authority 和 callback endpoint identity 不能互相替代。

每个 Workbench session 只绑定一个 deployment scope。切换 scope 必须销毁旧 session、请求和实时订阅。实时通知只表示权威资源可能变化，
客户端仍通过普通 Control API 读取恢复状态；通知不是 Revision、RunEvent 或协作日志。

### 生命周期与 retention

Project 删除先进入 `retiring`，立即阻断新的 mutation、Run、Publish 和 Trigger admission，再由该部署唯一的 lifecycle owner 完成关联资源清理和
物理删除。完成后不保留可恢复 tombstone；失败恢复只能继续同一个删除流程，不能形成第二条清理状态机。

RunEvent 明细可以按部署声明的 retention 到期，但唯一 terminal result 必须独立保留。归档、缓存和对象存储 listing 都不能替代产品记录或改变
公开 cursor、隔离和删除语义。

## 2. 源码与模块所有权

本仓库是公共合同、可移植实现、Workbench runtime 和 Server 的唯一可编辑源码事实源。

- `packages/open-flow` 拥有公共类型、严格 decoder、Control API client、black-box conformance、Project/Run/Trigger 的确定性语义、
  程序化 authoring API、产品中立 Workbench runtime 和内层 UI。
- `packages/command` 拥有 CLI 行为、Command Host boundary、Command Artifact 协议、确定性 archive 构建和发布。它只通过
  `packages/open-flow` 的公开 package entry 消费产品合同；公共 package 不能反向依赖 CLI 或 Command Artifact。
- `apps/server` 拥有 Server application lifecycle、SQLite、HTTP adapter、本地调度、具体 `isolated-vm` host、同源 Workbench host 和 Docker 交付。
- Hosted deployment 只拥有自己的基础设施接入、认证、application lifecycle、Capability mediation、Provider 配置和正式 Workbench 宿主。

Hosted deployment 必须消费精确版本的公开 package artifact 并运行其中的 conformance cases。它不能通过源码复制、Git dependency、deep import、
转发 package 或同步脚本保留公共实现的第二份可编辑副本。

Workbench runtime、类型声明和样式只通过 `@oomol-lab/open-flow/workbench` 与 `workbench.css` 同版本发布。正式宿主只负责登录、scope、
顶层路由、locale、theme、通知呈现和请求接入；不能复制领域 store、内层页面或 Designer 集成，也不能建立第二个 Workbench package。

Common 代码不能依赖 Browser 或 Node，Browser 代码不能依赖 Node。部署应用通过公开 subpath 消费 package，不 deep-import 另一个 workspace 的源码。

## 3. Validation 与执行

权威 validation 的输入是固定 ProjectRevision、目标 Flow、Project Model version 和 Engine Contract。它必须确定性检查 graph、Module、Task 和
目标 Flow closure，不读取 credential value、Provider 当前状态、调用权限或部署资源。非确定性 eligibility 必须在 Run 或 Publish 的 operation
boundary 重新检查。

Engine Contract、部署中立 Runtime invocation、Scheduler 图执行语义、RunEvent 投影和 conformance 属于 `packages/open-flow`。具体执行隔离、
Engine digest、资源限制和恢复属于部署实现；`isolated-vm` RuntimeHost 只属于 Server，不作为公共 package 能力发布。

Server RuntimeHost 以长驻 Executor 子进程隔离 V8 故障域，并为每个代码 Task invocation 创建全新的 isolate；Executor 丢失时终止其中未完成的
invocation，后续调用重建 Executor，不能自动重放可能已产生外部副作用的 Task。

Run admission 通过 Draft Revision path 或当前 Live Publication identity 固定 scope、Project、Flow、Revision、closure 和 Engine identity。接受后，
`runId` 是部署 scope 内的唯一资源 identity，可直接反查固定 Project；Project path 只用于按 Project 列表，不再参与单个 Run 的寻址。用户代码开始执行后
不能通过重试创建第二次执行；无法确认的恢复结果必须显式结束为不确定失败。取消与完成竞争时，权威 Run store 中只能有一个 terminal。

用户代码只在隔离 realm 中获得目标 closure、固定 platform module 和当前 Task invocation 明确声明的窄 Capability。Capability host 必须校验当前
Project、Run、Task、invocation、binding 和 Run 状态；Task 或 Run 结束后旧 Capability 必须 fail closed。

Runtime Capability 和 LLM Task 的部署中立 invocation、result、取消和稳定失败分类属于公共合同。Provider 请求、模型 catalog、credential、路由、
quota、审计、内容安全、计量和计费属于部署实现，不能进入 ProjectRevision、用户 realm 或通用 RunEvent。

## 4. Publication、Connector 与 Trigger

Publication 是指定 Flow 在固定 ProjectRevision 上的不可变发布记录。每个 Flow 独立拥有 Publication 历史和最多一个 Live pointer。Publish 必须在
一个权威 operation boundary 内完成 validation、binding、eligibility 和 Live 更新；Rollback 创建新 Publication，不修改历史记录。

从 Draft 删除 Flow 或删除 Project 必须停止新的 Live Run 和 Trigger admission，同时保留已接受 Run 与不可变历史直到各自 retention 或 Project
物理删除生效。

Connector service 拥有 Provider 授权、credential、Connection lifecycle 和 proxy transport。Open Flow 只保存稳定的 opaque Connection identity，
不能把 credential、token 或 Connector 数据库复制进 Revision、Browser 或 RunEvent。

公共 package 定义 Workbench 所需的 Connector 投影、部署中立 `connector-proxy` 调用合同、具体 Provider Trigger definitions 与唯一内置 Registry，
但不拥有 Connector HTTP transport。Hosted 与 Server 消费同一 Registry；Server 通过部署配置接入 Connector，没有 Connector 时相关执行能力必须
fail closed。

Trigger 是 Flow graph 中的 source node。Webhook、Cron、Poll 和 Integration 的确定性协议、Provider definitions、Registry 与 conformance 属于公共
package；subscription、checkpoint、调度持久化、endpoint routing 和 admission 事务属于部署实现。Trigger 通过 Connector 的通用 Action 或 proxy
调用 Provider，不能要求 Connector 增加 Trigger 专用接口，也不由用户或部署者注册 definitions。

一次有效 Trigger occurrence 只能准入普通 Flow Run，之后复用相同的 Run、执行、事件、取消和 terminal 语义。Trigger lifecycle 不能扩张成第二套
执行系统；重投 occurrence 必须通过稳定 identity 和权威 store 约束为最多一个 Run。

## 5. 文档所有权

- 修改产品事实、跨模块 owner、安全边界或运行时不变量时更新本文。
- 修改 serialized model、HTTP、错误、分页或 conformance profile 时更新
  [Control API 技术参考](control/contracts/control-api.md)。
- Server 容器、环境变量、SQLite、备份和运维约束写入 [Server 容器交付](server/container-delivery.md)。
- 前端交互约束写入 [Workbench 与 Designer 前端注意事项](authoring/frontend-ui.md)。
- 实现步骤和采纳历史只保存在 Git 历史或阶段计划中，不属于当前架构合同。
