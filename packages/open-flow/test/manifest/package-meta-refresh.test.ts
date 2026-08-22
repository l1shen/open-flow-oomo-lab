import type { Revision } from '../../src/base/common/revision.ts'
import type { BlockName, BlockPath, FlowPath, SearchPath } from '../../src/manifest/common/manifestTypes.ts'
import type { ManifestSource } from '../../src/manifest/common/source.ts'

import { describe, expect, it, vi } from 'vitest'
import { createMemoryPackage, memoryFile } from '../support/memory-package-meta.ts'

const root = '/workspace' as SearchPath
const revision = 'refresh-1' as Revision
const flowPath = '/workspace/flows/main/flow.oo.yaml' as FlowPath
const taskPath = '/workspace/tasks/greet/task.oo.yaml' as BlockPath

function createPackage(configureContext?: (context: ReturnType<typeof createMemoryPackage>['context']) => void) {
  return createMemoryPackage({
    configureContext,
    root,
    packageSource: 'name: local-package\n',
    packageRevision: revision,
    files: [memoryFile(flowPath, 'nodes: []\n', revision), memoryFile(taskPath, 'executor:\n  name: javascript\n  options:\n    entry: task.ts\n', revision)],
  })
}

describe('Package meta refresh', () => {
  it('retains existing manager entries when manifest listing fails', async () => {
    const { context, packageMeta } = createPackage()
    try {
      await packageMeta.flows.refreshAll()
      await packageMeta.sharedBlocks.refreshAll()
      const flow = packageMeta.flows.flowsByPath.get(flowPath)
      const task = packageMeta.sharedBlocks.sharedBlocksByPath.get(taskPath)
      const error = new Error('Manifest listing failed.')
      context.listManifestPathsError = error

      await expect(packageMeta.flows.refreshAll()).rejects.toBe(error)
      await expect(packageMeta.sharedBlocks.refreshAll()).rejects.toBe(error)
      expect(packageMeta.flows.flowsByPath.get(flowPath)).toBe(flow)
      expect(packageMeta.sharedBlocks.sharedBlocksByPath.get(taskPath)).toBe(task)
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('does not treat an open failure as a missing manifest', async () => {
    const { context, packageMeta } = createPackage()
    try {
      const flow = await packageMeta.flows.refreshFlow(flowPath, true)
      const error = new Error('Manifest open failed.')
      context.openManifestError = error

      await expect(packageMeta.flows.refreshFlow(flowPath, true)).rejects.toBe(error)
      expect(packageMeta.flows.flowsByPath.get(flowPath)).toBe(flow)
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('rejects an exclusive block create when the target file already exists', async () => {
    const { context, packageMeta } = createPackage()
    try {
      await expect(
        packageMeta.sharedBlocks.writeNewTaskBlock('greet' as BlockName, 'executor:\n  name: javascript\n  options:\n    entry: replacement.ts\n'),
      ).rejects.toThrow(`File already exists: ${taskPath}`)

      const task = await packageMeta.sharedBlocks.refreshTaskBlock(taskPath)
      if (!task) throw new Error('Expected the existing task block to remain readable.')
      expect(task.manifest.revision).toBe(revision)
      expect(task.manifest._toSaveFileString()).toBe('executor:\n  name: javascript\n  options:\n    entry: task.ts\n')
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('cleans up a scriptlet referenced by a freshly loaded Flow', async () => {
    const scriptletPath = '/workspace/flows/main/scriptlets/+scriptlet#1.ts'
    const { context, packageMeta } = createMemoryPackage({
      root,
      packageSource: 'name: local-package\n',
      packageRevision: revision,
      files: [
        memoryFile(
          flowPath,
          `nodes:
  - node_id: +typescript#1
    task:
      executor:
        name: javascript
        options:
          entry: scriptlets/+scriptlet#1.ts
`,
          revision,
        ),
        { path: scriptletPath, source: 'export default async function () {}\n', revision },
      ],
    })
    const removeFileDir = vi.spyOn(context, 'removeFileDir')
    try {
      const flow = await packageMeta.flows.refreshFlow(flowPath, true)
      const scriptletNode = flow?.nodes.values().next().value
      if (!flow || !scriptletNode) throw new Error('Expected the Scriptlet node fixture to load.')

      expect(flow.removeNodes(scriptletNode)).toBe(true)
      await vi.waitFor(() => expect(removeFileDir).toHaveBeenCalledWith(scriptletPath))
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('rejects writes under a sibling path that shares the project prefix', async () => {
    const siblingFlowPath = '/workspace-other/flows/main/flow.oo.yaml' as FlowPath
    const siblingTaskPath = '/workspace-other/tasks/greet/task.oo.yaml' as BlockPath
    const { context, packageMeta } = createMemoryPackage({
      root,
      packageSource: '',
      packageRevision: revision,
      files: [
        memoryFile(siblingFlowPath, 'nodes: []\n', revision),
        memoryFile(siblingTaskPath, 'executor:\n  name: javascript\n  options:\n    entry: task.ts\n', revision),
      ],
    })
    const removeFileDir = vi.spyOn(context, 'removeFileDir')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const flow = await packageMeta.flows.refreshFlow(siblingFlowPath, true)
      const task = await packageMeta.sharedBlocks.refreshTaskBlock(siblingTaskPath)
      if (!task) throw new Error('Expected the sibling Task fixture to load.')

      await packageMeta.flows.userRemoveFlow(flow)
      await packageMeta.sharedBlocks.userRemoveSharedBlock(task)

      expect(removeFileDir).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledTimes(2)
    } finally {
      consoleError.mockRestore()
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('applies a complete refresh only after all candidate manifests open', async () => {
    const { context, packageMeta } = createPackage()
    const newFlowPath = '/workspace/flows/new/flow.oo.yaml' as FlowPath
    try {
      await packageMeta.flows.refreshAll()
      const flow = packageMeta.flows.flowsByPath.get(flowPath)
      context.setExternalFile(newFlowPath, 'nodes: []\n', 'new-flow' as Revision)
      context.listManifestPathsHook = async () => [flowPath, newFlowPath]
      const error = new Error('New manifest open failed.')
      context.openManifestError = error
      context.openManifestErrorPath = newFlowPath

      await expect(packageMeta.flows.refreshAll()).rejects.toBe(error)
      expect(flow?.manifest.revision).toBe(revision)
      expect(packageMeta.flows.flowsByPath.has(newFlowPath)).toBe(false)
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('does not let a stale refresh overwrite a newer manifest candidate', async () => {
    const { context, packageMeta } = createPackage()
    try {
      await packageMeta.flows.refreshAll()
      const flow = packageMeta.flows.flowsByPath.get(flowPath)
      const stale = Promise.withResolvers<readonly string[]>()
      let calls = 0
      context.listManifestPathsHook = async () => {
        calls++
        if (calls == 1) return stale.promise
        return [flowPath]
      }

      const staleRefresh = packageMeta.flows.refreshAll()
      await vi.waitFor(() => expect(calls).toBe(1))
      context.setExternalFile(flowPath, 'title: Newer\nnodes: []\n', 'newer' as Revision)
      await expect(context.refreshManifest(flowPath)).resolves.toEqual({ status: 'applied' })
      await packageMeta.flows.refreshAll()
      stale.resolve([flowPath])
      await staleRefresh

      expect(flow?.manifest.revision).toBe('newer')
      expect(flow?.manifest.$.title.value).toBe('Newer')
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('keeps manager and writable manifest identities across inventory refreshes', async () => {
    const { context, packageMeta } = createPackage()
    try {
      await packageMeta.flows.refreshAll()
      await packageMeta.sharedBlocks.refreshAll()
      const flow = packageMeta.flows.flowsByPath.get(flowPath)
      const task = packageMeta.sharedBlocks.sharedBlocksByPath.get(taskPath)

      await packageMeta.flows.refreshAll()
      await packageMeta.sharedBlocks.refreshAll()

      expect(packageMeta.flows.flowsByPath.get(flowPath)).toBe(flow)
      expect(packageMeta.flows.flowsByPath.get(flowPath)?.manifest).toBe(flow?.manifest)
      expect(packageMeta.sharedBlocks.sharedBlocksByPath.get(taskPath)).toBe(task)
      expect(packageMeta.sharedBlocks.sharedBlocksByPath.get(taskPath)?.manifest).toBe(task?.manifest)
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('leaves invalid external source at the session boundary', async () => {
    const { context, packageMeta } = createPackage()
    try {
      const flow = await packageMeta.flows.refreshFlow(flowPath, true)
      const manifest = flow.manifest
      const yamlParent = manifest.yamlParent
      context.setExternalFile(flowPath, 'title: [broken\n', 'invalid' as Revision)

      await expect(context.refreshManifest(flowPath)).resolves.toMatchObject({ status: 'invalid' })
      await packageMeta.flows.refreshAll()

      expect(packageMeta.flows.flowsByPath.get(flowPath)).toBe(flow)
      expect(flow.manifest).toBe(manifest)
      expect(manifest.yamlParent).toBe(yamlParent)
      expect(manifest.revision).toBe(revision)
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('keeps the newest translation response', async () => {
    const { context, packageMeta } = createPackage()
    const translation = packageMeta.l10n.locales.en
    try {
      await Promise.resolve()
      const stale = Promise.withResolvers<ManifestSource | undefined>()
      let calls = 0
      context.readFileHook = async () => {
        calls++
        if (calls == 1) return stale.promise
        return { source: '{"value":"newer"}', revision: 'newer' as Revision }
      }

      const staleRefresh = translation.refresh()
      await vi.waitFor(() => expect(calls).toBe(1))
      await translation.refresh()
      stale.resolve({ source: '{"value":"stale"}', revision: 'stale' as Revision })
      await staleRefresh
      expect(translation.localize('value')).toBe('newer')
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('contains translation refresh failures started by the constructor', async () => {
    const error = new Error('Translation refresh failed.')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { context, packageMeta } = createPackage((memoryContext) => {
      memoryContext.readFileError = error
    })
    try {
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith(error))
    } finally {
      errorSpy.mockRestore()
      packageMeta.dispose()
      context.dispose()
    }
  })
})
