# Local-first 协作重构计划

本文记录 Flow authoring 从受控快照同步迁移到 local-first 多作者模型的目标和实施顺序。它是重构计划，不是当前已经完成的协议合同；稳定后的产品边界应回写到 `docs/architecture.md`，精确 operation schema 应写入对应技术参考。

## 问题

当前 Designer、Workbench optimistic Draft 和 Server committed Revision 都保存可变的 Flow 投影。Designer 的本地编辑可能在保存期间被较旧的宿主 model 重新 reconcile，导致第一次操作消失、连接存在但 Edge 不显示，或用户需要重复操作。

Human 和 Agent 并行编辑时，按整份 node、port array 或 Flow snapshot 覆盖会扩大冲突范围，也无法区分 stale echo、远端修改和当前尚未确认的本地修改。

## 目标模型

Server 继续维护线性的 Revision 历史和 expected Revision contract，不引入通用文档 CRDT。Workbench 持有一个 committed base 和有序的 pending authoring operations；Designer 只消费两者的确定性投影并产生新的 semantic intent。

```text
committed Revision + pending operations = visible Flow
```

本地 operation 必须立即进入 pending queue，因此用户修改不会等待网络，也不会被旧 model 覆盖。Server 接受后，operation 从 pending 移入新的 committed base；发生 revision conflict 时，客户端先同步新 base，再按确定性规则 rebase pending operations。无法安全 rebase 的 operation 必须形成结构化 conflict，不能静默丢弃或使用 last-writer-wins 改变执行语义。

Human UI 和 Agent 使用同一套 authoring operation API、validation 和 revision precondition。Agent 可以提交较大的 atomic batch，但不能获得替换整份 Flow 的旁路。

## Operation 原则

- Operation 表达用户 intent，例如设置 node title、增加或重命名 Task input、连接 source、删除 node；避免用整份 node 或 array replacement 表达局部修改。
- 每次提交携带稳定的 operation identity、actor identity 和 base Revision identity，用于幂等、归因和冲突恢复。
- 一个用户动作需要同时修改多个字段时使用 atomic batch。拖动 Edge 创建 additional input 时，新增 port 和建立 mapping 必须在同一批次成功或失败。
- Node、Task 和其他资源继续使用稳定 identity。Handle rename 必须是显式 operation，不能依赖比较两个 array 猜测 rename。
- Array reorder 使用相邻 stable item 作为 anchor，不使用易漂移的 numeric index。
- 权威 reducer 在提交前检查 target 存在、port 唯一性、source output、schema compatibility、cardinality 和 Trigger 约束。

## Rebase 与冲突

- 不同 node 或不同独立字段的 operation 可以顺序重放。
- 不同 handle 的 add 可以同时保留；同名 add 形成 conflict。
- rename 后的 connect 必须跟随 rename；两个不同 rename 形成 conflict。
- delete 使针对已删除对象的 pending edit 失效，并向作者报告被拒绝的 operation。
- scalar field 只有在远端仍等于本地 operation 的 `before` 值时才能自动应用；双方都修改时形成 conflict。
- 多 source input 可以按集合语义合并；单 source 或 Trigger cardinality 冲突不能自动覆盖。
- Conflict 必须定位到 operation、node 和 field/handle，并允许作者 discard、基于新 base 重试或显式提交替代 intent。

## 客户端职责

Workbench 是 editable Draft 的唯一 owner。它负责 pending queue、optimistic projection、提交、同步、rebase、conflict 和失败回滚。Designer 不再维护一份可被宿主快照无条件覆盖的平行语义文档。

Designer 可以保留 hover、selection、展开状态、未提交文本输入等 transient UI state。进入 Flow 语义的操作必须通过 authoring intent 交给 Workbench；incoming projection 只更新 committed base，不能清除 pending intent。

Realtime channel 继续只发送 invalidation。收到 `draft.changed` 后同步 Revision chain 并 rebase pending operations。Presence、cursor 和 selection 属于可选的 ephemeral channel，不进入 Revision、digest 或 authoring operation log。

## 实施顺序

1. 为 Workbench 增加 committed base、pending operations 和统一 projection，停止由多个组件直接拼装 optimistic snapshot。
2. 定义最小 semantic operation 集合及其纯 reducer、precondition、affected targets 和结构化 conflict。
3. 先迁移 Task additional input；把 add、rename、remove、connect 和 disconnect 从 whole-node replacement 改成 operation，并让 connection-created handle 使用 atomic batch。
4. 让 Designer 只发 intent，移除 additional input 的双份 mutable state 和 stale reconcile 路径。
5. 依次迁移 node metadata、input value、Variable binding、Condition、Value、Code Task ports 和 graph delete/reorder，随后删除 `syncingPorts`、`syncingInput`、`syncingMetadata` 等 echo-suppression flags。
6. 在 Control API 暴露相同的 operation batch 给 Human 和 Agent，加入 actor attribution、idempotency 和 conflict response。
7. 增加双客户端 conformance cases，覆盖并行独立编辑、rename/connect、delete/edit、Trigger cardinality、断线重连、重试和 rejected operation rollback。

## 完成标准

- 保存中的本地修改不会因任何旧 host projection 消失。
- 两个客户端修改独立目标时无需人工处理并最终得到相同 Flow。
- 同一语义目标的冲突不会静默覆盖，并能定位到具体操作。
- connection-created additional input 只产生一个可验证、可重试的 atomic batch。
- Human 和 Agent 没有不同的 mutation 或 validation 路径。
- 任意时刻 visible Flow 都可由 committed Revision 和 pending operations 确定性重建。
