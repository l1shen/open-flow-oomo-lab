# Flow 顶层化重置计划

## 1. 决策

移除 Project 这一产品资源、持久化聚合和运行时边界，让 Flow 成为当前 deployment scope 下的顶层、独立、可版本化资源。

这是一次直接重置，不做旧数据迁移：

- Control API 继续使用 `/v1` 和顶层 `version: 1`，直接用新的 Flow 合同替换旧 Project 合同；
- 不提供 `/v2`，不同时维护两套 API；
- 不保留 `/v1/projects` adapter、隐藏 Project、双读或双写；
- 不转换旧 Project、Flow、ProjectRevision、Presentation、Publication、Live、Trigger、Run、RunEvent 或 result；
- 不保留旧 Flow identity、旧 URL、旧幂等记录或历史；
- 不提供 migration-only decoder、projector 或 encoder；
- Server 和 Hosted 都从空的 Flow 产品数据开始；
- Connector credential 等不由 Open Flow 拥有的外部资源不因本次重置而删除。

旧 API client、CLI 和 Workbench 与新合同不兼容，必须与服务端一起升级。

## 2. 目标模型

```text
Deployment scope
├── Flow
│   ├── mutable Draft head
│   ├── immutable FlowRevision history
│   ├── Presentation
│   ├── Publication / Live
│   ├── Trigger bindings
│   └── Run references
├── Connections / Secrets
└── Run
```

### 2.1 Flow

Flow 是 deployment scope 内由服务生成稳定 opaque identity 的资源，拥有名称、状态、Draft head、Presentation 和不可变 FlowRevision 历史。

每个 Flow 独立执行：

- 创建、读取、重命名和删除；
- Draft sync 和带预期 Revision 的原子变更；
- validation；
- Draft Run admission；
- Publish、Rollback 和 Live 更新；
- Trigger 查询与人工状态变更；
- Run 列表和 Flow 通知。

删除 Flow 时进入 `retiring`，立即阻断新的 Draft mutation、Run、Publish、Rollback 和 Trigger admission，再由唯一 lifecycle owner 清理该 Flow 的 Live、Trigger、Run 和部署资源。删除完成后不保留可恢复 tombstone。

### 2.2 FlowDocument 与 FlowRevision

```ts
interface FlowDocument {
  readonly bindings: Readonly<Record<string, BindingDeclaration>>
  readonly graph: Graph
  readonly subflows: Readonly<Record<string, SubflowDefinition>>
  readonly tasks: Readonly<Record<string, ManagedTaskDefinition>>
}

interface RevisionContent {
  readonly document: FlowDocument
  readonly modelVersion: 1
  readonly modules: Readonly<Record<string, CodeModule>>
}
```

Flow name 是资源元数据，不进入 FlowRevision digest。创建、重命名和删除 Flow 是资源操作，不是 Draft `ChangeOperation`。Draft change 只修改当前 Flow 内的 graph、Subflow、Task、CodeModule 和 binding declaration。

Subflow、Task、CodeModule 和 binding declaration 都属于单个 Flow。不同 Flow 不共享可变 Draft 资产；本次重置不新增 Folder、Collection、Package 或跨 Flow library。

Validation、closure 和 `prepareFlow` 直接接收固定 FlowRevision，不再通过 `ProjectDocument.flows[flowId]` 选择主 graph。

### 2.3 Deployment scope 资源

Connector provider catalog、Connection、Secret、credential、认证、配额和审计不进入 FlowRevision。FlowRevision 只保存 binding declaration 或稳定 opaque Connection identity。

Connector catalog 和 Connection 查询使用 deployment-scope route。Capability host 校验 Flow、Run、Task、invocation、binding/action 和当前 Run 状态。

## 3. 必须保持的新不变量

- 一个 Flow 只有一个可变 Draft head；FlowRevision 一经创建不可修改。
- Draft mutation 必须以该 Flow 的预期 Revision 为前提，不能静默覆盖 stale head。
- Presentation 使用独立 CAS revision，不进入 FlowRevision digest。
- Publication 固定一个 FlowRevision、closure、model version 和 Engine identity。
- 已接受 Run 的目标不因后续 Draft、Publish 或 Rollback 改变。
- `runId` 和 `publicationId` 在 deployment scope 内全局唯一。
- Trigger occurrence 仍然最多准入一个普通 Run。
- 同一 Flow 的 Run 串行 claim；不同 Flow 在全局并发上限内独立推进。
- Flow A 的 Draft、删除、失败或长 Run 不得改变 Flow B 的 Draft head、Live、Trigger 或调度资格。
- Workbench 和 CLI 只通过当前 deployment 的 Control API 操作 Flow，不建立本地事实来源。

## 4. Control API v1 重置

核心 route 直接改成：

```text
GET    /v1/flows
POST   /v1/flows
GET    /v1/flows/:flowId
PATCH  /v1/flows/:flowId
DELETE /v1/flows/:flowId

GET    /v1/flows/:flowId/draft
GET    /v1/flows/:flowId/draft/sync
POST   /v1/flows/:flowId/draft/changes
GET    /v1/flows/:flowId/revisions/:revisionId
GET    /v1/flows/:flowId/presentation
PUT    /v1/flows/:flowId/presentation

POST   /v1/flows/:flowId/revisions/:revisionId/check
POST   /v1/flows/:flowId/revisions/:revisionId/runs
GET    /v1/flows/:flowId/runs

GET    /v1/flows/:flowId/live
GET    /v1/flows/:flowId/publications
POST   /v1/flows/:flowId/revisions/:revisionId/publications
POST   /v1/flows/:flowId/publications/:publicationId/rollback

GET    /v1/flows/:flowId/triggers
GET    /v1/flows/:flowId/triggers/:triggerNodeId
GET    /v1/flows/:flowId/triggers/:triggerNodeId/activities
POST   /v1/flows/:flowId/triggers/:triggerNodeId/pause
POST   /v1/flows/:flowId/triggers/:triggerNodeId/resume
POST   /v1/flows/:flowId/triggers/:triggerNodeId/test

GET    /v1/flows/notifications
GET    /v1/flows/:flowId/notifications

GET    /v1/runs/:runId
GET    /v1/runs/:runId/events
GET    /v1/runs/:runId/result
POST   /v1/runs/:runId/cancel
POST   /v1/runs
```

Connector catalog、action 和 Connection route 移到 `/v1/connector/...`。Trigger definition catalog 继续是 deployment-scoped。

通知分成两条窄通道：

- `/v1/flows/notifications` 是 deployment scope 内低频的 Flow catalog invalidation，只在 Flow 创建、重命名、进入 retirement 或物理删除后发送 `{ flowId, kind: 'flow.catalog.changed', version: 1 }`；Workbench 在整个 scope session 中保持该订阅，收到后重新读取 `/v1/flows`。CLI 创建 Flow 后，已经打开的 Workbench 因此可以刷新列表。
- `/v1/flows/:flowId/notifications` 只承载当前 Flow 的 `draft.changed` 和 `run.created`，继续按 Flow 分片。

`/v1/flows/notifications` 必须作为静态 route 优先于 `/v1/flows/:flowId` 匹配，并按 deployment scope 的 `flow.list` authority 授权。`/v1/flows/:flowId/notifications` 按目标 Flow 的 `flow.read` authority 授权，不存在、无权访问或属于其他 scope 的 Flow 不能建立订阅。

通知不是产品事实，发送失败不回滚已经提交的 Flow mutation。每次 SSE 或 WebSocket 首次连接成功和重连成功时，host 都先调用对应 listener：catalog listener 重新读取 `/v1/flows`，当前 Flow listener 重新读取 Draft 和相关状态。这同时覆盖 catalog read 与订阅建立之间的竞态，不增加持久事件日志。catalog 通道不承载 Draft、Run、Trigger Activity 或其他高频事件。

公共 Workbench host contract 提供两个 transport-neutral 订阅方法：`subscribeFlowCatalog(listener)` 和 `subscribeFlow(flowId, listener)`。开源 Server host 沿用现有 `fetch` + `text/event-stream` 实现，分别建立 catalog SSE 和当前 Flow SSE；Flow 列表只有 catalog stream，打开具体 Flow 时共两个 stream，切换 Flow 保留 catalog stream 并只替换当前 Flow stream，切换 deployment scope 或离开 Workbench 才关闭两者。Cloud host 可以用两个 WebSocket 实现同一逻辑合同，公共 Workbench runtime 不解析或统一两种 transport。

精确 request、response、错误码、cursor 和幂等合同在 Control API 实施阶段写入技术参考。

## 5. 重置前清理

允许删除全部旧产品数据，不代表可以遗留仍在运行的用户代码或 Provider subscription。部署重置前使用旧版本已有的 lifecycle owner 完成清理：

1. 阻断新的 mutation、Run、Publish 和 Trigger admission；
2. 对所有旧 Project 发起 retirement；
3. 等待全部 queued、starting、running Run terminal 或被取消，并确认执行 host/Workflow 已停止；
4. 等待 Trigger schedule、endpoint route 和 Integration subscription 退役；
5. 确认旧 lifecycle owner 没有 pending Project；
6. 停止旧服务；
7. 删除旧产品 schema/object 并创建空的新 Flow schema；
8. 启动新服务。

如果旧 lifecycle cleanup 失败，先修复并继续同一个删除流程，不能通过直接删除数据库掩盖仍存在的执行或外部 subscription。

本次重置不要求备份、数据回填或旧版本回滚。新服务接受写入后直接以新 Flow 数据为唯一事实来源。

## 6. 实施阶段

所有改动在同一个 breaking-change 分支或受控 stacked changes 中完成。最终合并前不发布半完成的公共 package。

### 阶段 0：冻结新合同和重置步骤

- 更新架构边界，明确 Flow、FlowRevision、删除、调度和 Capability owner；
- 在 Control API 技术参考中直接替换 `/v1` Project 合同；
- 固定 Server 与 Hosted 的旧 Project retirement、清空和新 schema 初始化步骤；
- 确认 Connector credential 等外部 owner 资源不在删除范围。

退出条件：新合同不含 Project，重置步骤不会遗留用户执行或 Provider subscription。

### 阶段 1：修改公共 Flow 模型与确定性语义

- 将 `ProjectDocument` 改为单 Flow document，移除 `flows` record；
- 将 Project change/authoring 公共入口改为 Flow change/authoring，删除旧 subpath 和 re-export；
- 移除 Draft 中的 `flow.create`、`flow.rename`、`flow.delete` operation；
- 改写 canonical encoding、change application、dependency closure、validation 和 `prepareFlow`；
- 更新 schema、公共类型和对应测试；
- 保持 RuntimeProgram、Engine Contract 和 RunEvent 的无关部分不变。

退出条件：单 Flow Revision 的 canonical digest、closure、validation、Subflow cycle、Task、Module 和 Trigger 测试通过。

### 阶段 2：重置 Control API v1 和 conformance

- 重写公共 API types、严格 decoder、ControlClient 和 error code；
- 删除 Project route、type、notification 和 client method；
- 将 conformance cases 改成顶层 Flow；
- 增加两个 Flow 独立提交、独立删除、独立 Live 和独立调度的 black-box cases；
- 增加 Flow catalog、Flow-scoped event shape 和两个 Workbench host subscriber contract，覆盖静态 catalog route 优先级、scope/Flow authorization、一个 client 创建 Flow 后另一个 client 重读 catalog，以及首次连接和重连成功时主动重读；不把 SSE 或 WebSocket transport 提升为跨部署公共合同。

退出条件：公共 client 和 conformance 不再暴露 Project，`/v1` Flow route、body version、cursor、幂等和错误合同完整。

### 阶段 3：重置 Server

- 在升级说明中要求旧版本先 retirement 全部 Project；
- 增加 destructive SQLite migration，删除旧产品表并创建空的 Flow、FlowRevision、Presentation、Publication、Live、Run 和 Trigger schema；
- 将 Control service、HTTP、notification、Trigger runtime、lifecycle owner 和 recovery 改成 Flow owner；
- Server Browser host 使用两个可独立取消和重连的 SSE stream 实现 Flow catalog 与当前 Flow subscription；
- Scheduler 从 Project claim 改成 Flow claim；
- Capability 校验和日志上下文移除 Project identity；
- 删除 Project store、migration conversion 和旧 schema reader。

退出条件：空库和旧库重置后都得到相同的新 schema；旧 lifecycle cleanup gate、Flow lifecycle 和四类 Trigger 测试通过；schema 中没有 Project 表或 `project_id`。

### 阶段 4：迁移 Workbench

- 首页直接列出和创建 Flow；
- 路由改为 `/flows/:flowId/{design,publications,runs}`；
- session 只加载一个 Flow 的 Draft、Presentation、Live、Trigger 和 Run；
- 移除 Project catalog、selector、header 和 create/delete UI；
- Subflow、Task 和 CodeModule 只显示当前 Flow-local 资产；
- Browser host 在 scope session 中订阅 Flow catalog notification，并为当前 Flow 订阅 Flow notification；切换 Flow 只销毁当前 Flow 的 Draft、请求和订阅，切换 scope 才销毁两条订阅。

退出条件：创建、编辑、刷新、Revision conflict、Presentation CAS、发布、运行、Trigger 和删除只需要 `flowId`。不启动或自动化浏览器。

### 阶段 5：迁移 CLI 和 Command Host

- 删除 `oo flow project <...>` 和 `--project`；
- Flow 命令直接操作顶层 Flow；
- node、code、connector、trigger、publish、rollback 和 run 命令显式解析目标 Flow；
- 删除 Command Host 的 Project 当前选择状态；
- Workbench URL 只接收 `flowId`；
- JSON 输出移除 `project` 和 `projectId`。

退出条件：所有 CLI 操作不需要 Project 上下文，旧命令没有兼容转发。

### 阶段 6：删除旧结构并发布

- 删除旧 Project files、types、routes、stores、localization、tests 和文档，不保留 shim、alias 或 re-export；
- 清理产品代码中的 `ProjectRevision`、`ProjectDocument`、`projectId` 和 `/projects`；
- 运行 Server 与 Hosted 的同一套重置后 `/v1` conformance；
- 同步发布公共 package、CLI、Server、Hosted 和 Workbench；
- 明确 release note：旧 API 与全部旧 Open Flow 数据不兼容且已删除。

退出条件：正式实现只提供新的 `/v1` Flow 合同，没有 Project runtime 或旧数据 reader。

## 7. 测试矩阵

### 公共语义

- Flow-local change 只移动当前 Flow Draft head；
- FlowRevision closure 只包含当前 Flow 的依赖；
- stale Flow Draft mutation 返回稳定 conflict；
- Flow A 的修改不改变 Flow B 的 Revision、Live 或 Trigger。

### 重置与 Server

- 有旧 Project 数据的数据库被清空并建立新 schema；
- active Project 未完成 retirement 时拒绝 destructive reset；
- 全部 Project retirement 后重置成功；
- 重置不删除外部 Connector credential；
- 新 Flow retirement 清理 Live、Trigger、Run 和持久资源；
- 同一 Flow 的 Run 串行，不同 Flow 能并行。

### Workbench 与 CLI

- 根页面直接创建和列出 Flow；
- CLI 或另一个客户端创建 Flow 后，已打开的 Workbench 收到 catalog invalidation 并刷新列表；
- Flow 创建发生在首次 catalog read 与订阅建立之间时，连接成功后的主动重读仍能显示新 Flow；
- catalog 或当前 Flow 订阅重连成功后主动重读并恢复最新状态；
- catalog 静态 route 不会被识别成 `flowId`，跨 scope 或无权访问、不存在的 Flow 不能建立订阅；
- deep link 只含 `flowId`；
- Flow 列表保持一个 catalog stream，打开 Flow 后保持两个 stream，切换 Flow 只替换当前 Flow stream；
- 切换 Flow 销毁旧 Draft 和当前 Flow 请求，切换 deployment scope 销毁全部请求和订阅；
- CLI 没有 Project 当前选择或 `--project`；
- JSON、帮助文本和错误信息没有 Project 产品概念。

## 8. 完成检查

最终运行：

```bash
rtk bun run check
rtk bun run test
rtk bun run build
rtk bun run test:package
```

逐条审阅残留：

```bash
rtk rg -n "ProjectRevision|ProjectDocument|projectId|/projects" packages apps docs -g '!**/migrations/**'
```

逐条判断剩余命中，不改写已经应用的历史 migration，也不删除 GitLab Project 等外部 provider 的固有领域术语；这些例外只允许存在于明确的历史文件或 provider 边界。只有 Flow 成为唯一 authoring aggregate，旧数据被清空，Project 公共资源、路由、持久化和客户端状态全部删除，并且全部仓库检查通过，重置才算完成。
