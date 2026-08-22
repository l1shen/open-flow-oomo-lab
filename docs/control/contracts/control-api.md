# Control API 技术参考

本文记录 Open Flow Control API 跨部署成立的 HTTP 合同。Hosted 与 Server 分别实现该合同；数据库、对象存储、认证 provider、事务实现、调度器和部署资源不属于本文。

当前可执行 profile 包括 P0 authoring、P1 Publication / Live、P2 Trigger 与 P3 Connector。公共 black-box cases 由
`@oomol-lab/open-flow/control-api-conformance` 分别导出为 `controlApiConformanceCases`、`publicationControlApiConformanceCases`、
`triggerControlApiConformanceCases` 和 `connectorControlApiConformanceCases`；实现必须显式选择自己声明支持的 profile。Hosted 与 Server
均实现这四个 profile。

## 1. Transport

- 路径以 `/v1` 开头；资源 identity 放入 path segment 时使用 UTF-8 percent encoding。
- 带 JSON body 的请求使用 `Content-Type: application/json`。
- JSON response 顶层包含 `version: 1`；本文列出的 `204` 或协议空响应除外。
- 错误 response 使用：

```json
{
  "error": {
    "code": "project.revision-conflict",
    "message": "The Draft changed."
  },
  "version": 1
}
```

- `message` 可以由部署实现本地化或补充上下文；客户端按稳定 `code` 分支。
- 认证与部署 scope 由 adapter 提供。公共合同不要求特定 Team header、cookie、host token 或 Server 的具体 session 形式。
- 创建 Project 和 Run 的 `Idempotency-Key` 必须是非空、受限长度的 opaque value。相同 key 与相同 operation 重放同一资源；相同 key 与不同 operation 返回 conflict。

## 2. 公共资源

### 2.1 Project

```ts
interface Project {
  createdAt: string
  draftRevisionId: string
  name: string
  projectId: string
  status: 'active' | 'retiring'
  updatedAt: string
  version: 1
}
```

Project identity 由服务生成。`draftRevisionId` 是当前 Draft head；Presentation mutation 不移动它。删除请求把 Project 原子推进到 `retiring`，此后新的 Draft mutation fail closed。

列表 response：

```ts
interface ProjectPage {
  nextCursor?: string
  projects: readonly Project[]
  total?: number
  version: 1
}
```

`total` 只在 `includeTotal=true` 时要求返回。

### 2.2 Revision 与 Draft

```ts
interface RevisionMetadata {
  actorId: string
  createdAt: string
  digest: string
  modelVersion: number
  parentRevisionId: string | null
  projectId: string
  revisionId: string
  version: 1
}

interface Draft extends RevisionMetadata {
  content: RevisionContent
}
```

`RevisionContent` 的 canonical ProjectDocument、CodeModule 和 `ChangeOperation` 定义由 `@oomol-lab/open-flow/project-change` 拥有。Revision 是完整 immutable snapshot；部署实现可以内部增量保存，但旧 Revision read 不能随 Draft head 变化。

Draft change response：

```ts
interface DraftChange {
  draftFlows: readonly {
    closureDigest: string
    flowId: string
    name: string
  }[]
  revision: RevisionMetadata
  version: 1
}
```

Draft sync response 是以下 union：

```ts
type DraftSync =
  | {
      draftFlows: readonly DraftFlow[]
      kind: 'changes'
      revisions: readonly {
        operations: readonly ChangeOperation[]
        revision: RevisionMetadata
      }[]
      version: 1
    }
  | {
      draft: Draft
      draftFlows: readonly DraftFlow[]
      kind: 'snapshot'
      version: 1
    }
```

未提供 `fromRevisionId` 时返回 snapshot。提供已知 Revision 时，实现可以返回从该 Revision 开始的连续 changes；无法提供连续 changes 时可以返回等价 snapshot。客户端必须支持两种分支，不能假设部署保存 operation history。

### 2.3 Presentation

```ts
interface Presentation {
  revision: number
  updatedAt: string
  value: Readonly<Record<string, JsonValue>>
  version: 1
}
```

Presentation 使用独立的整数 CAS revision，不进入 ProjectRevision digest。更新 request：

```ts
{
  expectedRevision: number
  value: Readonly<Record<string, JsonValue>>
  version: 1
}
```

### 2.4 Flow projection 与 validation

Flow list response：

```ts
interface Flow {
  draft: {
    closureDigest: string
    name: string
    revisionDigest: string
    revisionId: string
  } | null
  flowId: string
  hasUnpublishedChanges: boolean
  live: {
    publication: Publication
    revision: number
    status: 'runnable' | 'suspended'
  } | null
}

interface FlowPage {
  flows: readonly Flow[]
  projectId: string
  version: 1
}
```

P0 只要求 Draft projection；`live` 可以是 `null`。Flow 是当前 Draft 与 Live 的确定性投影，不是第二个持久化事实源。

Flow check response：

```ts
interface FlowCheck {
  closureDigest: string
  diagnostics: readonly {
    code: string
    column: number
    line: number
    message: string
    path: string
  }[]
  engineContract: string
  flowId: string
  modelVersion: number
  projectId: string
  revisionDigest: string
  revisionId: string
  valid: boolean
  version: 1
}
```

Check request 当前使用：

```json
{
  "engineContract": "open-flow-engine/v1",
  "version": 1
}
```

Validation 始终针对 path 中固定的 Project、Revision 和 Flow，不读取当前 Draft head 替换它。

### 2.5 Run

Run summary：

```ts
interface Run {
  createdAt: string
  finishedAt?: string
  flowId: string
  projectId: string
  revisionId: string
  runId: string
  source: 'draft' | 'live' | 'trigger'
  startedAt?: string
  status: RunStatus
  version: 1
}
```

Draft Run detail 在 summary 上增加：

```ts
{
  closureDigest: string
  engineContract: string
  engineDigest: string
  eventsExpiresAt?: string
  modelVersion: number
  revisionDigest: string
  source: 'draft'
}
```

Live Run detail 使用相同固定执行 identity，并增加：

```ts
{
  publicationId: string
  source: 'live'
}
```

Trigger Run detail 同样使用固定执行 identity，并增加：

```ts
{
  occurrenceId: string
  publicationId: string
  source: 'trigger'
  triggerNodeId: string
}
```

P0 Draft Run create request：

```ts
{
  engineContract: 'open-flow-engine/v1'
  inputs: Readonly<Record<string, Readonly<Record<string, JsonValue>>>>
  version: 1
}
```

首次接受返回 `202`，幂等重放返回 `200`。服务从 path 中固定 ProjectRevision 和 Flow，不接受调用方提交完整 Revision content。

Run list response：

```ts
interface RunPage {
  nextCursor?: string
  projectId: string
  runs: readonly Run[]
  version: 1
}
```

Run events response：

```ts
interface RunEvents {
  done: boolean
  events: readonly {
    createdAt: string
    kind: RunEventKind
    payload: Readonly<Record<string, JsonValue>>
    sequence: number
    sourceSequence?: number
  }[]
  eventsExpiresAt?: string
  historyComplete: boolean
  nextAfter: number
  runId: string
  version: 1
}
```

`after` 是已观察的最后 sequence，response 只返回更大的事件。sequence 对一个 Run 单调递增；terminal Run 最多有一个 terminal event。

`node.output` 的 `payload` 除节点、scope 和 output handle 元数据外，必须包含公开 output：小于实现事件上限的值使用
`{ kind: 'inline', value: JsonValue }`；实现将较大值保存到独立对象存储时使用
`{ kind: 'stored', outputId: string, digest: string, encodedBytes: number }`。内部事件的独立 `value` 字段不得直接出现在公共响应中。

取消 response：

```ts
interface RunCancellation {
  cancelAccepted: boolean
  runId: string
  status: 'canceled' | 'completed' | 'failed' | 'indeterminate'
  version: 1
}
```

第一次成功提交取消时 `cancelAccepted: true`；重复取消返回同一 terminal 且 `cancelAccepted: false`。

结果 response 是以下 union：

```ts
type RunResult =
  | { finishedAt: string; result: JsonValue; runId: string; status: 'completed'; version: 1 }
  | {
      error: { code: string; message: string }
      finishedAt: string
      runId: string
      status: 'failed' | 'indeterminate'
      version: 1
    }
  | { finishedAt: string; runId: string; status: 'canceled'; version: 1 }
```

非 terminal Run 的 result 返回 `409 run.not-terminal`。

### 2.6 Publication 与 Live

Publication 是一个 immutable 发布事实：

```ts
interface Publication {
  actorId: string
  closureDigest: string
  createdAt: string
  engineContract: 'open-flow-engine/v1'
  flowId: string
  modelVersion: number
  operation: 'publish' | 'rollback'
  projectId: string
  publicationId: string
  revisionDigest: string
  revisionId: string
  sourcePublicationId?: string
  version: 1
}
```

`publish` 固定 path 中的当前 Draft Revision 和 Flow；如果 path Revision 已不再是 Draft head，返回 `project.revision-conflict`。`rollback` 创建新的 Publication，并从 path 中的历史 Publication 固定 Revision、closure 与 Engine Contract；它不修改历史 Publication，也不移动 Draft head。只有 `rollback` 包含 `sourcePublicationId`。

Publication 固定 Engine Contract，但不固定某个 Engine implementation digest。Live Run 在准入时选择当前 eligible implementation，并把实际 digest 固定到 Run。

Live response：

```ts
interface Live {
  flowId: string
  hasUnpublishedChanges: boolean
  projectId: string
  publication: Publication | null
  revision: number
  status: 'not-published' | 'runnable' | 'suspended'
  version: 1
}
```

从未发布或已经因 Flow 删除、Project retirement 而退役的 Live 使用 `publication: null`、`revision: 0` 和 `status: not-published`。成功 Publish 或 Rollback 后，Live revision 从 1 开始单调递增。`hasUnpublishedChanges` 比较当前 Draft Flow closure 与 Live Publication closure；当前 Draft 没有该 Flow 且没有 Live 时为 `false`。

Publication list response：

```ts
interface PublicationPage {
  nextCursor?: string
  publications: readonly Publication[]
  total?: number
  version: 1
}
```

列表按 `createdAt`、`publicationId` 逆序稳定分页。`total` 只在 `includeTotal=true` 时要求返回。

Publish request：

```ts
{
  engineContract: 'open-flow-engine/v1'
  expectedLivePublicationId: string | null
  version: 1
}
```

Rollback request：

```ts
{
  expectedLivePublicationId: string
  version: 1
}
```

Publish 与 Rollback 都要求 `Idempotency-Key`。首次提交返回 `201`，相同 key 与相同 logical operation 重放原 Publication 并返回 `200`；相同 key 与不同 operation 返回 `publication.conflict`。`expectedLivePublicationId` 是 Live CAS：首次发布必须为 `null`，后续操作必须等于当前 Live Publication，否则返回 `live.conflict`。Idempotency replay 优先于再次执行 Live precondition，不会把历史 operation 重放成一次新的 Live move。

Live Run create request：

```ts
{
  inputs: Readonly<Record<string, Readonly<Record<string, JsonValue>>>>
  version: 1
}
```

Live Run 首次接受返回 `202`，幂等重放返回 `200`。服务在 admission transaction 中固定当前 Live Publication、Revision、closure、model version、Engine Contract 与当前 eligible Engine implementation；调用方不能提交这些字段。Run detail 的 `source` 是 `live`，并增加 `publicationId`。后续 Draft change、Publish 或 Rollback 不改变已接受 Run 的固定目标。

## 3. P0 routes

| Method   | Path                                                                | 成功状态 | 说明                                                  |
| -------- | ------------------------------------------------------------------- | -------: | ----------------------------------------------------- |
| `GET`    | `/v1/projects`                                                      |      200 | 支持 `cursor`、`limit`、`includeTotal`                |
| `POST`   | `/v1/projects`                                                      |  201/200 | body `{ name, version: 1 }`；要求 idempotency key     |
| `GET`    | `/v1/projects/:projectId`                                           |      200 | 读取 Project 与当前 Draft head                        |
| `DELETE` | `/v1/projects/:projectId`                                           |      202 | 进入 `retiring`                                       |
| `GET`    | `/v1/projects/:projectId/draft`                                     |      200 | 读取当前完整 Draft snapshot                           |
| `GET`    | `/v1/projects/:projectId/draft/sync`                                |      200 | 可选 `fromRevisionId`                                 |
| `POST`   | `/v1/projects/:projectId/draft/changes`                             |      200 | body `{ expectedRevisionId, operations, version: 1 }` |
| `GET`    | `/v1/projects/:projectId/revisions/:revisionId`                     |      200 | 读取 immutable Revision                               |
| `GET`    | `/v1/projects/:projectId/flows`                                     |      200 | 当前 Flow projection                                  |
| `GET`    | `/v1/projects/:projectId/presentation`                              |      200 | 读取 Presentation                                     |
| `PUT`    | `/v1/projects/:projectId/presentation`                              |      200 | 独立 CAS update                                       |
| `POST`   | `/v1/projects/:projectId/revisions/:revisionId/flows/:flowId/check` |      200 | 固定 Revision validation                              |
| `POST`   | `/v1/projects/:projectId/revisions/:revisionId/flows/:flowId/runs`  |  202/200 | 固定 Draft Run admission                              |
| `GET`    | `/v1/projects/:projectId/runs`                                      |      200 | 支持 `cursor`、`limit`、`flowId`、`status`            |
| `GET`    | `/v1/projects/:projectId/runs/:runId`                               |      200 | Run detail                                            |
| `GET`    | `/v1/projects/:projectId/runs/:runId/events`                        |      200 | 支持 `after`、`limit`                                 |
| `GET`    | `/v1/projects/:projectId/runs/:runId/result`                        |      200 | terminal result                                       |
| `POST`   | `/v1/projects/:projectId/runs/:runId/cancel`                        |      200 | body `{ version: 1 }`                                 |

## 4. P1 Publication / Live routes

P1 依赖 P0 Project、Draft、Flow projection 与 Run observation routes，并增加：

| Method | Path                                                                         | 成功状态 | 说明                                        |
| ------ | ---------------------------------------------------------------------------- | -------: | ------------------------------------------- |
| `GET`  | `/v1/projects/:projectId/flows/:flowId/live`                                 |      200 | 读取当前 Live 或 `not-published` projection |
| `GET`  | `/v1/projects/:projectId/flows/:flowId/publications`                         |      200 | 支持 `cursor`、`limit`、`includeTotal`      |
| `POST` | `/v1/projects/:projectId/revisions/:revisionId/flows/:flowId/publications`   |  201/200 | Publish 当前固定 Draft Revision；要求幂等键 |
| `POST` | `/v1/projects/:projectId/flows/:flowId/publications/:publicationId/rollback` |  201/200 | 从历史 Publication 创建 Rollback            |
| `POST` | `/v1/projects/:projectId/flows/:flowId/runs`                                 |  202/200 | 从当前 Live 接受 Run；要求幂等键            |

Draft 删除 Flow 时，实现必须在提交新 Draft head 的同一原子边界中移除对应 Live 并退役 Trigger binding。Project delete 进入 `retiring` 时必须移除该 Project 的全部 Live 并退役 Trigger binding。immutable Publication 历史继续可读；新的 Publish、Rollback、Live Run 均不能越过 retirement fence。

## 5. P2 Trigger resources 与语义

Trigger Key catalog 只包含当前部署实际提供的 Poll 和 Integration definition；内容和 Provider 范围可以因部署而不同，也可以为空。Webhook 和 Cron 是 Project Model 的内建 Trigger，不进入该 catalog。三个 response 分别是：

```ts
{ keys: readonly TriggerKeySummary[]; version: 1 }
{ definitions: readonly TriggerKeySnapshot[]; version: 1 }
{ definition: TriggerKeySnapshot; version: 1 }
```

`keys` 与 `definitions` 使用相同 identity 和顺序。`TriggerKeySnapshot` 的精确字段、Integration endpoint declaration 和 Poll/Integration discriminator 由 `@oomol-lab/open-flow/project-change` 拥有。catalog 不暴露 definition implementation、Connector credential、Provider token 或部署 Registry 存储。

成功 Publication 为每个 Trigger node 原子提交一个稳定 Live binding。公共投影为：

```ts
interface TriggerBinding {
  currentPublicationId?: string
  currentRevisionId?: string
  endpointUrl?: string
  flowId: string
  health: 'failed' | 'healthy' | 'initializing' | 'needs_reauth' | 'suspended'
  kind: 'cron' | 'integration' | 'poll' | 'webhook'
  lastErrorCode?: string
  operatorState: 'active' | 'paused'
  projectId: string
  runtimeVersion: number
  triggerNodeId: string
  updatedAt: string
  version: 1
}
```

列表 response 是 `{ bindings, flowId, projectId, version: 1 }`，按 `triggerNodeId` 稳定排序并且永不包含 `endpointUrl`。详情 response 是 `{ binding, version: 1 }`；只有仍有 current target 的 Webhook binding 返回完整 callback URL。Cron、Poll、Integration 和 retired Webhook 均不返回 endpoint URL。

`operatorState` 是人工控制面，`health` 是运行时状态，两者互不覆盖。pause/resume request 都严格为 `{ version: 1 }`，返回更新后的 `TriggerBinding`。实际状态改变必须在权威 binding transaction 中递增 `runtimeVersion`，使旧版本的 Webhook、Cron、Poll 和 Integration occurrence 不能通过最终 admission guard；重复设置相同状态返回当前 binding，不重复递增 version 或写 Activity。pause 跨 Publish/Rollback 保留，只有显式 resume 才恢复。retired binding 没有 current target，不能 pause/resume/test。

Trigger Activity 是没有形成普通 Run、但会改变用户运维判断的窄记录：

```ts
type TriggerActivityKind =
  'delivery.failed' | 'health.failed' | 'health.needs_reauth' | 'health.recovered' | 'health.suspended' | 'operator.paused' | 'operator.resumed'

interface TriggerActivity {
  activityId: string
  createdAt: string
  errorCode?: string
  errorMessage?: string
  kind: TriggerActivityKind
}

interface TriggerActivityPage {
  activities: readonly TriggerActivity[]
  nextCursor?: string
  version: 1
}
```

Activity 按 `createdAt`、`activityId` 逆序稳定分页，cursor 绑定 Project、Flow 和 Trigger node scope；无效或跨 scope cursor 返回 `page.invalid-cursor`。`errorMessage` 最长 512 字符，只能包含部署实现已经去敏的基础设施摘要，不能保存 request、Provider body、header、credential、checkpoint、subscription、普通 Run result 或执行事件。成功 Trigger admission 和执行历史仍只由普通 Run/RunEvent 表达。retired binding 的有限 Activity 历史仍可读。

Poll test request 严格为 `{ version: 1 }`，response 为：

```ts
interface PollTriggerTestResult {
  events: readonly Readonly<Record<string, JsonValue>>[]
  filtered: number
  hasMore: boolean
  version: 1
}
```

test 使用 current Publication 固定的 Revision、Trigger snapshot、Connection 和当前 checkpoint 调用一次当前 definition。它不认领 schedule、不写 dedupe、不推进 checkpoint、不创建 Run，也不改变 operator/health。部署实现使用当前已认证调用者允许的 Connector authority，不能把 credential 或 token 暴露到 response。非 Poll 或 retired binding 返回 `trigger.not-found`。

## 6. P2 Trigger routes

P2 依赖 P0 Project authoring 和 P1 Publication / Live，并增加：

| Method | Path                                                                       | 成功状态 | 说明                                       |
| ------ | -------------------------------------------------------------------------- | -------: | ------------------------------------------ |
| `GET`  | `/v1/trigger-keys`                                                         |      200 | 当前部署的 Trigger Key summaries           |
| `GET`  | `/v1/trigger-keys/catalog`                                                 |      200 | 当前部署的完整 Trigger definition snapshot |
| `GET`  | `/v1/trigger-keys/:key`                                                    |      200 | 读取一个 Trigger definition snapshot       |
| `GET`  | `/v1/projects/:projectId/flows/:flowId/triggers`                           |      200 | 读取一个 Flow 的 Live bindings             |
| `GET`  | `/v1/projects/:projectId/flows/:flowId/triggers/:triggerNodeId`            |      200 | 读取 binding 详情                          |
| `GET`  | `/v1/projects/:projectId/flows/:flowId/triggers/:triggerNodeId/activities` |      200 | 支持 `cursor`、`limit`                     |
| `POST` | `/v1/projects/:projectId/flows/:flowId/triggers/:triggerNodeId/pause`      |      200 | body `{ version: 1 }`                      |
| `POST` | `/v1/projects/:projectId/flows/:flowId/triggers/:triggerNodeId/resume`     |      200 | body `{ version: 1 }`                      |
| `POST` | `/v1/projects/:projectId/flows/:flowId/triggers/:triggerNodeId/test`       |      200 | 对 current Poll binding 做无状态测试       |

## 7. P3 Connector resources 与 routes

P3 把部署中可用的 Connector catalog 与获准 Connection 投影到 Project authoring scope。Project scope只表示本次请求的授权与审计范围；Provider、
Connection、credential、OAuth 和 token继续由 Connector拥有，不进入 ProjectRevision或 Flow persistence。

公共 Provider与 Connection为：

```ts
interface ConnectorProvider {
  icon?: string
  serviceId: string
  serviceName: string
}

interface ConnectorConnection {
  connectionId: string
  displayName: string
  isDefault: boolean
  serviceId: string
  status: 'active' | 'disconnected' | 'error' | 'reauth_required'
}
```

Provider catalog是公开元数据，不以当前 Connection作为事实源。Connection list只返回当前部署身份获准的 opaque identity、展示名、默认标记与状态；
不得返回 alias、auth type、scope、credential、Provider token、OAuth配置或 Connector管理字段。

Action descriptor为：

```ts
interface ConnectorAction {
  actionId: string
  defaultConnection?: ConnectorConnection
  description: string
  icon?: string
  inputs: Record<string, InputPortDefinition>
  name: string
  outputs: Record<string, PortDefinition>
  serviceId: string
  serviceName: string
}
```

Action inputs/outputs由 Connector公开 JSON Schema确定性投影为 Project Model端口。`defaultConnection`必须是同 service的 active Connection；它只在
authoring时作为自动选择，客户端把 `connectionId` 写入新 Task，之后 Connector默认值变化不能改写已有 Revision。未连接的 Provider仍可浏览和添加
Action，此时不返回 `defaultConnection`。

routes为：

| Method | Path                                                            | 成功状态 | 说明                                     |
| ------ | --------------------------------------------------------------- | -------: | ---------------------------------------- |
| `GET`  | `/v1/projects/:projectId/connector/providers`                   |      200 | 完整 Provider catalog                    |
| `GET`  | `/v1/projects/:projectId/connector/actions`                     |      200 | 完整 Action catalog                      |
| `GET`  | `/v1/projects/:projectId/connector/actions?service=:serviceId`  |      200 | 指定 Provider的 Action                   |
| `GET`  | `/v1/projects/:projectId/connector/actions?q=:query`            |      200 | 跨 Provider Action搜索                   |
| `GET`  | `/v1/projects/:projectId/connector/actions/:actionId`           |      200 | Action详情                               |
| `GET`  | `/v1/projects/:projectId/connector/connections/:serviceId`      |      200 | 当前获准 Connection                      |
| `POST` | `/v1/projects/:projectId/connector/connections/:serviceId/page` |      200 | 创建或返回 Connector-owned external page |

`service` 与 `q` 不能同时出现；`q` trim后必须是 1–256字符。所有 `serviceId`（包括 `service` query与 Connection route path）必须是
1–256字符。省略两者时返回完整 Action catalog，供显式 CLI请求使用；Workbench按 Provider懒加载，不在正常浏览路径调用全量形式。响应分别为：

```ts
{ providers: readonly ConnectorProvider[]; projectId: string; version: 1 }
{ actions: readonly ConnectorAction[]; projectId: string; version: 1 }
{ action: ConnectorAction; projectId: string; version: 1 }
{ connections: readonly ConnectorConnection[]; projectId: string; serviceId: string; version: 1 }
```

Connection page请求严格为 `{ returnUrl: string, version: 1 }`，响应严格为 `{ url: string, version: 1 }`，其中 `url` 使用 HTTP(S)。`returnUrl`
用于允许支持回跳的部署实现建立页面上下文；实现也可以返回不含回跳的 Connector Console页面。response不能包含 runtime/admin token、credential或账号资料。
Workbench先把 Connector Task加入 Draft，再从编辑上下文打开 external page；切回窗口后重新读取 Connection。

## 8. Stable errors

| Code                            | Status | 条件                                           |
| ------------------------------- | -----: | ---------------------------------------------- |
| `authentication.required`       |    401 | adapter 没有可认证 principal                   |
| `authorization.denied`          |    403 | principal 无权执行操作                         |
| `page.invalid-cursor`           |    400 | 分页 cursor 无效或不属于当前查询               |
| `project.invalid`               |    400 | Project name、change set 或 Project Model 无效 |
| `project.not-found`             |    404 | Project、Draft 或 Revision 不可见              |
| `project.busy`                  |    409 | Project 正在 retirement                        |
| `project.conflict`              |    409 | Project idempotency key 与请求冲突             |
| `project.revision-conflict`     |    412 | expected Draft head 已变化                     |
| `project.presentation-conflict` |    412 | expected Presentation revision 已变化          |
| `flow.invalid`                  |    400 | 固定 Flow validation 失败，不能准入 Run        |
| `flow.not-found`                |    404 | 固定 Revision 中没有目标 Flow                  |
| `engine.unsupported`            |    409 | 请求的 Engine Contract 不受支持                |
| `engine.unavailable`            |    503 | 当前没有 eligible Engine implementation        |
| `run.conflict`                  |    409 | Run idempotency key 与请求冲突                 |
| `run.invalid`                   |    400 | inputs 不是合法 JSON value 或不符合 Flow input |
| `run.not-found`                 |    404 | Run 不属于 path 中的 Project 或不可见          |
| `run.not-terminal`              |    409 | Run 尚未提交 terminal result                   |
| `run.events-expired`            |    410 | 指定的详细事件 history 已到期                  |
| `route.not-found`               |    404 | route 不属于 Control API                       |

P1 增加：

| Code                    | Status | 条件                                                                 |
| ----------------------- | -----: | -------------------------------------------------------------------- |
| `binding.unresolved`    |    409 | 固定 Flow closure 仍有未解析 binding                                 |
| `live.conflict`         |    412 | expected Live Publication 与当前 pointer 不一致                      |
| `live.not-found`        |    404 | active Project 中的 Flow 没有可运行 Live，或 Live 已因 Flow 删除退役 |
| `publication.conflict`  |    409 | Publication idempotency key 与 logical operation 冲突                |
| `publication.not-found` |    404 | Rollback source 不属于 path 中的 Project 与 Flow                     |
| `trigger-key.invalid`   |    409 | 固定 Trigger definition snapshot 与当前可用 definition 不一致        |

Publish、Rollback 与 Live Run 也复用 `project.*`、`flow.*`、`engine.*` 和 `run.*` errors。部署实现可以增加内部错误映射，但不能把私有数据库、Workflow、SQLite、Trigger reconciler 或 Cloudflare identity 暴露成公共 resource。

P2 增加：

| Code                    | Status | 条件                                                         |
| ----------------------- | -----: | ------------------------------------------------------------ |
| `trigger-key.not-found` |    404 | Trigger Key 不存在于当前部署 Registry                        |
| `trigger.not-found`     |    404 | binding 不存在、已 retired，或目标 operation 不适用于该 kind |

Trigger catalog 与 management 也复用 `project.invalid`、`project.not-found`、`project.busy`、`trigger-key.invalid` 和部署已有的 Connector error。错误不能返回内部 binding identity、Connection detail、credential、Provider body 或 runtime state。

P3 增加：

| Code                         | Status | 条件                                                            |
| ---------------------------- | -----: | --------------------------------------------------------------- |
| `connector.action-not-found` |    404 | Action不在当前 Connector catalog中                              |
| `connector.unavailable`      |    503 | Connector未配置、不可达、超时、响应超限或不符合公开 adapter合同 |

P3 routes也复用 `project.invalid` 与 `project.not-found`。实现不能把上游错误 body、Connector内部 route、runtime/admin token、credential或数据库信息
写入 error response；部署专属 transport error也必须在 P3 boundary映射为部署中立的 Connector error。

## 9. Conformance profiles

`controlApiConformanceCases` 固定 P0 的五组外部行为：

1. Project create/replay/conflict/list/get/retire 与 retirement fencing；
2. Draft CAS、immutable Revision、snapshot/changes sync 与 Flow projection；
3. Presentation 独立 CAS；
4. 固定 ProjectRevision Flow validation 与 missing Flow fencing；
5. Draft Run acceptance/replay/scope/list/events/pending result/cancel/terminal/repeated cancel。

`publicationControlApiConformanceCases` 固定 P1 的三组外部行为：

1. 未发布 Live、Publish idempotency/CAS、Live/Flow projection 与 immutable history；
2. 多次 Publish、Rollback、history pagination，以及 Live Run 固定准入时的 Publication/Revision；
3. Draft Flow 删除和 Project retirement 对 Live/Trigger admission 的 fencing，同时保留 Publication history。

`triggerControlApiConformanceCases` 固定 P2 的两组外部行为：

1. deployment-scoped Trigger Key summary/catalog/detail identity 与 missing key；
2. Webhook/Cron Live binding projection、endpoint visibility、pause/replay/republish/resume、runtime fencing、Activity pagination、non-Poll test 和 Trigger retirement。

`connectorControlApiConformanceCases` 固定 P3 的两组外部行为：

1. Provider、完整/按 service/search Action、Action详情、获准 Connection、default Connection与 external page的一致安全投影；
2. 冲突/空/超长 query、malformed page request、Project scope和 missing Action的稳定错误。

Harness 只提供 `origin`、`request(Request)` 和 `dispose()`。认证由 adapter 注入；case 不读取数据库、不调用 application service，也不要求测试专用 production route。

修改上述可观察语义时，顺序固定为：先修改本文、公共 types/decoder 和 conformance case，再分别让 Hosted 与 Server adapter 通过。不能用任一实现的私有 test、表结构或错误栈解释协议漂移。
