# Designer Lab

Run the local-only Designer component playground from the repository root:

```bash
bun run dev:designer
```

Add component scenarios to `stories.tsx`. Keep scenarios deterministic and use the action logger instead of external services. Every story renders inside a real flow node so canvas scaling and popup placement use the same context as Designer. The Lab is a development tool and has no production build or package entry.
