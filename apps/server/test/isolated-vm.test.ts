import type { RuntimeHarness, RuntimeProgram } from '@oomol-lab/open-flow/runtime-contract'

import { runtimeConformanceCases } from '@oomol-lab/open-flow/runtime-contract'
import { afterAll, describe, expect, it } from 'vitest'
import { IsolatedVmError, isolatedVmEngineDigest, isolatedVmLimits, IsolatedVmHost } from '../node/isolated-vm.ts'

const host = new IsolatedVmHost()

const harness: RuntimeHarness = {
  engineDigest: isolatedVmEngineDigest,
  invoke: (invocation) => host.invoke(invocation),
}

afterAll(async () => await host.close())

function program(source: string): RuntimeProgram {
  return {
    engineContract: 'open-flow-engine/v1',
    engineDigest: isolatedVmEngineDigest,
    entryModuleId: 'main',
    modules: { main: { imports: [], source } },
  }
}

function invoke(source: string, limits = isolatedVmLimits) {
  return host.invoke(
    {
      capability: async () => ({ body: null, status: 200 }),
      input: null,
      invocationId: 'isolated-runtime-test',
      program: program(source),
    },
    limits,
  )
}

describe('isolated-vm runtime conformance', () => {
  for (const conformance of runtimeConformanceCases) {
    it(conformance.name, async () => await conformance.verify(harness))
  }

  it('does not expose Node or network globals to the user realm', async () => {
    await expect(
      invoke(`export default () => ({
        fetch: typeof fetch,
        process: typeof process,
        require: typeof require,
      })`),
    ).resolves.toEqual({ fetch: 'undefined', process: 'undefined', require: 'undefined' })
  })

  it('terminates synchronous user code at the CPU limit and keeps the parent alive', async () => {
    await expect(invoke('export default () => { while (true) {} }', { ...isolatedVmLimits, cpuMs: 20, wallMs: 2_000 })).rejects.toMatchObject({
      code: 'limit-exceeded',
    })
    await expect(invoke('export default () => "still-alive"')).resolves.toBe('still-alive')
  })

  it('rejects oversized results without returning partial data', async () => {
    await expect(invoke('export default () => "x".repeat(2048)', { ...isolatedVmLimits, maxResultBytes: 256 })).rejects.toMatchObject({
      code: 'limit-exceeded',
    })
  })

  it('rejects an Engine digest not owned by this Executor before spawning user code', async () => {
    await expect(
      host.invoke({
        capability: async () => ({ body: null, status: 200 }),
        input: null,
        invocationId: 'wrong-engine',
        program: { ...program('export default () => true'), engineDigest: 'sha256:other' },
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<IsolatedVmError>>({ code: 'invalid-program' }))
  })

  it('routes concurrent invocations independently and gives each invocation a fresh isolate', async () => {
    const first = host.invoke({
      capability: async ({ payload }) => ({ body: payload, status: 200 }),
      input: { value: 'first' },
      invocationId: 'concurrent-first',
      program: program(
        `export default async (input, capability) => {
  globalThis.count = (globalThis.count ?? 0) + 1
  return { count: globalThis.count, response: await capability.connector(input) }
}`,
      ),
    })
    const second = host.invoke({
      capability: async ({ payload }) => ({ body: payload, status: 200 }),
      input: { value: 'second' },
      invocationId: 'concurrent-second',
      program: program(
        `export default async (input, capability) => {
  globalThis.count = (globalThis.count ?? 0) + 1
  return { count: globalThis.count, response: await capability.connector(input) }
}`,
      ),
    })

    await expect(Promise.all([first, second])).resolves.toEqual([
      { count: 1, response: { body: { value: 'first' }, status: 200 } },
      { count: 1, response: { body: { value: 'second' }, status: 200 } },
    ])
  })

  it('cancels one concurrent invocation without canceling another', async () => {
    const cancellation = new AbortController()
    let capabilityStarted!: () => void
    const started = new Promise<void>((resolve) => {
      capabilityStarted = resolve
    })
    const canceled = host.invoke({
      capability: async ({ signal }) => {
        capabilityStarted()
        return await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      },
      input: null,
      invocationId: 'concurrent-canceled',
      program: program(`export default async (_input, capability) => capability.connector({ wait: true })`),
      signal: cancellation.signal,
    })
    const completed = host.invoke({
      capability: async () => ({ body: 'completed', status: 200 }),
      input: null,
      invocationId: 'concurrent-completed',
      program: program(`export default async (_input, capability) => capability.connector({ wait: false })`),
    })

    await started
    cancellation.abort(new Error('Cancel only the first invocation.'))
    await expect(canceled).rejects.toThrow('Cancel only the first invocation.')
    await expect(completed).resolves.toEqual({ body: 'completed', status: 200 })
  })
})
