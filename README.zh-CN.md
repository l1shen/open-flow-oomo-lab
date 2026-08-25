# Open Flow

[English](README.md) | 简体中文

**在画布上搭工作流，需要时直接写代码，最后部署到自己的环境。**

Open Flow 是一个开源的工作流自动化平台。你可以在画布上连接有类型约束的节点，在合适的位置编写 JavaScript 或
TypeScript，直接运行和调试 Flow，再把它发布成持续工作的自动化流程。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./docs/assets/light.png">
    <img alt="Open Flow Workbench 中正在运行的 Hacker News 工作流" src="./docs/assets/light.png">
  </picture>
</p>

> [!IMPORTANT]
> Open Flow 目前处于 Alpha 阶段。公开协议有版本管理，但产品还没有发布第一个稳定版本。

## 从想法到线上运行

- 在画布上组合节点和 Subflow，并用类型约束输入与输出。遇到更适合代码的逻辑，可以直接使用 Script 或 CodeModule。
- 运行前检查输入和 Flow 结构，运行时查看每个节点的进度、输出和完整事件记录。
- Flow 可以手动启动，也可以由 Cron、Webhook、轮询数据源或 Provider Event 触发。
- Project、不可变 Revision、Publication、Live 版本、Run 和 Trigger 状态都由当前部署管理，不会散落在本地文件和隐藏服务中。
- 可以使用仓库自带的 Server 自行部署，也可以让同一套 Workbench 和 CLI 连接其他兼容 Control API 的实现。

Open Flow 适合已经超过简单无代码原型，但又不想变成一堆脚本和基础设施的工作流。流程图仍然容易理解，需要写的代码也保留为正常代码，运行环境由你选择。

## 快速开始

准备好 [Docker](https://docs.docker.com/get-docker/) 和 OpenSSL，然后克隆仓库、生成管理员 Token 并启动 Server：

```bash
git clone https://github.com/oomol-lab/open-flow.git
cd open-flow

export OPEN_FLOW_TOKEN="$(openssl rand -hex 32)"
docker build --file apps/server/Dockerfile --tag open-flow-server:dev .
docker run --rm \
  --publish 3000:3000 \
  --env OPEN_FLOW_TOKEN="$OPEN_FLOW_TOKEN" \
  --volume open-flow-data:/data/open-flow \
  open-flow-server:dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)，使用 `OPEN_FLOW_TOKEN` 的值登录。Project 和 Run 历史会保存在
`open-flow-data` Docker volume 中。

不接外部服务时，Server 仍然可以独立使用。Connector Action、Provider Trigger 和 LLM Task 在没有配置对应 Host Capability
时会拒绝执行，不会退回到来源不明的服务。

生产环境所需的配置、健康检查、数据持久化、备份和 Connector 接入方式，参见
[Server 部署文档](docs/server/container-delivery.md)。

## 一套产品，多种部署

Workbench 和 CLI 通过有版本的 Control API 工作，不依赖特定数据库或云运行时。部署端负责执行和持久化；客户端不会创建第二套本地
Project 格式，也不会在请求失败时暗中切换后端。

仓库主要包含：

- [`packages/open-flow`](packages/open-flow)：公开的 Authoring、Execution、Trigger、Control API、Conformance 和 Workbench Runtime；
- [`apps/server`](apps/server)：可自行部署的 Workbench、Control API、SQLite 存储、Trigger Scheduler 和隔离的 JavaScript Runtime。

长期成立的产品模型记录在[产品与架构边界](docs/architecture.md)中，HTTP 接口定义参见
[Control API 文档](docs/control/contracts/control-api.md)。

## 从源码开发

Open Flow 使用 [Bun](https://bun.sh/)。

```bash
bun install --frozen-lockfile
bun run dev
```

开发环境的 Workbench 位于 [http://127.0.0.1:5173](http://127.0.0.1:5173)，API 请求会代理到
`http://127.0.0.1:3000` 上的 Server。

第一次启动开发环境时，Server 会把管理员 Token 写入 `apps/server/.open-flow-dev/operator-token`，后续启动继续使用同一个
Token，因此重启开发服务不会让当前 Workbench 登录态失效。如果需要指定 Token，可以设置 `OPEN_FLOW_TOKEN`。

提交代码前运行：

```bash
bun run check
bun run test
bun run build
bun run test:package
```

本机有 Docker 时，还可以运行 `bun run test:docker`，检查发布镜像、隔离运行时、Workbench、正常退出和 SQLite volume 恢复。

## 文档

可以从[文档索引](docs/README.md)开始，常用内容包括：

- [产品与架构边界](docs/architecture.md)
- [Control API](docs/control/contracts/control-api.md)
- [Server 部署](docs/server/container-delivery.md)

## 许可证

[Apache-2.0](LICENSE)
