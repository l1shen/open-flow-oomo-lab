# Open Flow

[English](README.md) | [简体中文](README.zh-CN.md)

**Build workflows you can see, code, run, and own.**

Open Flow is an open-source workflow automation platform for building on a visual canvas without
giving up code. Connect typed steps, write JavaScript or TypeScript where it belongs, run flows
interactively, and publish them for continuous execution.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./docs/assets/light.png">
    <img alt="A Hacker News workflow running in the Open Flow Workbench" src="./docs/assets/light.png">
  </picture>
</p>

> [!IMPORTANT]
> Open Flow is in alpha. Its contracts are versioned, but the product has not reached its first
> stable release.

## From idea to running workflow

- **Design visually, extend with code.** Compose typed nodes and subflows on the canvas, then use
  script and code modules for logic that should stay explicit.
- **Run and debug in one place.** Validate inputs before execution, inspect node progress and
  outputs, and follow the complete event history of every run.
- **Publish long-running automation.** Start flows manually or from cron schedules, webhooks,
  polling sources, and provider events.
- **Keep operational state together.** Projects, immutable revisions, publications, live versions,
  runs, and trigger state belong to one selected deployment instead of being split across local
  files and hidden services.
- **Choose where it runs.** Use the included self-hosted Server or connect the same Workbench and
  CLI to another implementation of the versioned Control API.

Open Flow is built for workflows that outgrow a no-code prototype but should not become an opaque
collection of scripts and infrastructure. The graph remains understandable, the code remains
code, and the deployment remains under your control.

## Quick start

You need [Docker](https://docs.docker.com/get-docker/) and OpenSSL. Clone the repository, create an
operator token, and start the self-hosted Server:

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

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) and sign in with the value of
`OPEN_FLOW_TOKEN`. Projects and run history are persisted in the `open-flow-data` Docker volume.

The Server is useful without external services. Connector-backed actions, provider triggers, and
LLM tasks fail closed until their corresponding host capability is configured.

For production configuration, health checks, persistence, backup, and Connector integration, see
the [Server deployment guide](docs/server/container-delivery.md).

## One product, portable deployments

The Workbench and CLI speak a versioned Control API rather than depending on a particular database
or cloud runtime. A deployment owns execution and persistence; clients do not create a second local
project format or silently switch to another backend.

This repository contains:

- [`packages/open-flow`](packages/open-flow): public authoring, execution, trigger, Control API,
  conformance, and Workbench runtime packages;
- [`apps/server`](apps/server): the self-hosted Workbench, Control API, SQLite persistence, trigger
  scheduler, and isolated JavaScript runtime.

Read the [product and architecture boundaries](docs/architecture.md) for the durable model, or the
[Control API reference](docs/control/contracts/control-api.md) for the HTTP contract.

## Develop from source

Open Flow uses [Bun](https://bun.sh/).

```bash
bun install --frozen-lockfile
bun run dev
```

Open the development Workbench at
[http://127.0.0.1:5173](http://127.0.0.1:5173). Its API requests are proxied to the Server at
`http://127.0.0.1:3000`.

The first development run creates an operator token at
`apps/server/.open-flow-dev/operator-token`. Later runs reuse it, so restarting the development
server does not invalidate the current Workbench session. Set `OPEN_FLOW_TOKEN` to use an explicit
token instead.

Before submitting a change, run:

```bash
bun run check
bun run test
bun run build
bun run test:package
```

Use `bun run test:docker` when Docker is available to verify the release image, isolated runtime,
Workbench, graceful shutdown, and SQLite volume recovery.

## Documentation

Start with the [documentation index](docs/README.md). The most useful references are:

- [Product and architecture boundaries](docs/architecture.md)
- [Control API](docs/control/contracts/control-api.md)
- [Server deployment](docs/server/container-delivery.md)

## License

[Apache-2.0](LICENSE)
