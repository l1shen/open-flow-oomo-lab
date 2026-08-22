import type { NodeStore } from '../../src/designer/browser/stores/node/node.store.ts'
import type { NodeId } from '../../src/schema/index.ts'

import { send } from '@wopjs/event'
import { val } from 'value-enhancer'
import { reactiveMap } from 'value-enhancer/collections'
import { describe, expect, it, vi } from 'vitest'
import { setupAutoSaveUIFile } from '../../src/designer/browser/actions/autoSaveUiFile.ts'
import { BrowserDirtyResourceTracker } from '../../src/designer/browser/dirtyResourceTracker.ts'
import { DesignerUIStore } from '../../src/designer/browser/stores/designer/designerUI.store.ts'

describe('Designer UI file auto-save', () => {
  it('round-trips viewport changes through Designer UI data', async () => {
    const nodes = reactiveMap<NodeId, NodeStore>()
    const viewport = val<{ x: number; y: number; zoom: number } | undefined>()
    const store = new DesignerUIStore({ viewport, nodeStores: nodes })
    let changes = 0
    store.onChanged(() => changes++)

    try {
      store.loadDesignerUIData({ viewport: { x: 12, y: 34, zoom: 0.75 } })
      expect(viewport.value).toEqual({ x: 12, y: 34, zoom: 0.75 })
      expect(store.toUIData()).toEqual({
        nodes: undefined,
        pseudoNodes: undefined,
        commentNodes: undefined,
        viewport: { x: 12, y: 34, zoom: 0.75 },
        layouts: {
          detail: {
            nodes: undefined,
            pseudoNodes: undefined,
            viewport: { x: 12, y: 34, zoom: 0.75 },
          },
        },
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(changes).toBe(0)

      viewport.set({ x: 56, y: 78, zoom: 1.25 })
      await vi.waitFor(() => expect(changes).toBe(1))
      expect(store.toUIData()?.viewport).toEqual({ x: 56, y: 78, zoom: 1.25 })
    } finally {
      store.dispose()
      nodes.dispose()
    }
  })

  it('loads the positions and viewport for the active display mode', () => {
    const nodes = reactiveMap<NodeId, NodeStore>()
    const viewport = val<{ x: number; y: number; zoom: number } | undefined>()
    const store = new DesignerUIStore({ viewport, nodeStores: nodes })

    try {
      store.loadDesignerUIData(
        {
          nodes: {
            example: { rfNode: { position: { x: 1, y: 2 } } },
          },
          viewport: { x: 3, y: 4, zoom: 0.5 },
          layouts: {
            overview: {
              nodes: { example: { x: 10, y: 20 } },
              viewport: { x: 30, y: 40, zoom: 0.75 },
            },
            detail: {
              nodes: { example: { x: 100, y: 200 } },
              viewport: { x: 300, y: 400, zoom: 1.25 },
            },
          },
        },
        'overview',
      )

      expect(store.peekNodeUIData('example' as NodeId)?.rfNode?.position).toEqual({ x: 10, y: 20 })
      expect(viewport.value).toEqual({ x: 30, y: 40, zoom: 0.75 })
    } finally {
      store.dispose()
      nodes.dispose()
    }
  })

  it('preserves loaded layout positions before node stores are populated', () => {
    const nodes = reactiveMap<NodeId, NodeStore>()
    const viewport = val<{ x: number; y: number; zoom: number } | undefined>()
    const store = new DesignerUIStore({ viewport, nodeStores: nodes })

    try {
      store.loadDesignerUIData(
        {
          layouts: {
            detail: {
              nodes: { example: { x: 100, y: 200 } },
              viewport: { x: 300, y: 400, zoom: 1.25 },
            },
          },
        },
        'detail',
      )

      expect(store.toUIData()?.layouts?.detail).toEqual({
        nodes: { example: { x: 100, y: 200 } },
        pseudoNodes: undefined,
        viewport: { x: 300, y: 400, zoom: 1.25 },
      })
    } finally {
      store.dispose()
      nodes.dispose()
    }
  })

  it('flushes an edit made while the previous UI generation is saving', async () => {
    const dirtyResources = new BrowserDirtyResourceTracker()
    const nodes = reactiveMap<NodeId, NodeStore>()
    const store = new DesignerUIStore({ viewport: val(), nodeStores: nodes })
    const firstSave = Promise.withResolvers<void>()
    const firstSaveStarted = Promise.withResolvers<void>()
    let saveCount = 0
    const autoSave = setupAutoSaveUIFile(dirtyResources, '/project/flows/main/flow.oo.yaml', '/project/flows/main/.flow.ui.oo.json', store, async () => {
      saveCount++
      if (saveCount == 1) {
        firstSaveStarted.resolve()
        await firstSave.promise
      }
    })

    try {
      send(store.onChanged, store)
      const flushing = autoSave.flush()
      await firstSaveStarted.promise
      send(store.onChanged, store)
      expect(dirtyResources.resources$.value.has('/project/flows/main/flow.oo.yaml')).toBe(true)
      firstSave.resolve()
      await flushing

      expect(saveCount).toBe(2)
      expect(dirtyResources.resources$.value.has('/project/flows/main/flow.oo.yaml')).toBe(false)
    } finally {
      autoSave.dispose()
      store.dispose()
      nodes.dispose()
      dirtyResources.dispose()
    }
  })
})
