import type { NodeId } from '../../../../schema/index.ts'
import type { NodeStatus } from './constants.ts'
import type { NodeStoreDisplay$ } from './node.store.ts'
import type { INodeSectionStore } from './nodeSection/interface.ts'

import { val } from 'value-enhancer'
import { reactiveMap } from 'value-enhancer/collections'
import { describe, expect, it, vi } from 'vitest'
import { DesignerUIStore } from '../designer/designerUI.store.ts'
import { NODE_STATUS, NODE_TYPE } from './constants.ts'
import { NodeStore } from './node.store.ts'

function createDesignerUIStore(): DesignerUIStore {
  return new DesignerUIStore({ viewport: val(), nodeStores: reactiveMap() })
}

function createSection(hasError: boolean): INodeSectionStore {
  return {
    type: 'test',
    hasError$: val(hasError),
    uiState$: val(),
    dispose: () => {},
  }
}

function createNodeStore(display$: Partial<NodeStoreDisplay$>): NodeStore {
  return new NodeStore('node' as NodeId, NODE_TYPE.TaskNode, {
    display$: {
      icon: val(),
      title: val(),
      description: val(),
      timeout: val(),
      progressWeight: val(),
      status: val<NodeStatus>(NODE_STATUS.Idle),
      progress: val(),
      showSettings: val(),
      ignore: val(),
      sections: val([]),
      inputs_def: val(),
      outputs_def: val(),
      ...display$,
    },
    designerUIStore: createDesignerUIStore(),
  })
}

describe('NodeStore', () => {
  it('disposes owned state once', () => {
    const designerUIStore = createDesignerUIStore()
    const display$ = {
      icon: val(),
      title: val(),
      description: val(),
      status: val<NodeStatus>(NODE_STATUS.Idle),
      progress: val(),
      showSettings: val(),
      ignore: val(),
      sections: val([]),
      inputs_def: val(),
      outputs_def: val(),
    }
    const manifest$ = {
      icon: val(),
      title: val(),
      description: val(),
    }
    const disposeManifestTitle = vi.spyOn(manifest$.title, 'dispose')
    const disposeDisplayTitle = vi.spyOn(display$.title, 'dispose')

    const nodeStore = new NodeStore('node' as NodeId, NODE_TYPE.TaskNode, {
      manifest$,
      display$,
      designerUIStore,
    })

    nodeStore.dispose()
    nodeStore.dispose()

    expect(disposeManifestTitle).toHaveBeenCalledTimes(1)
    expect(disposeDisplayTitle).toHaveBeenCalledTimes(1)
  })

  it('owns runtime sections without adding them to persisted display sections', () => {
    const nodeStore = createNodeStore({})
    const first = createSection(false)
    const second = createSection(false)
    const disposeFirst = vi.spyOn(first, 'dispose')
    const disposeSecond = vi.spyOn(second, 'dispose')

    nodeStore.setRuntimeSections([first])
    expect(nodeStore.display$.sections.value).toEqual([])
    expect(nodeStore.runtimeSections$.value).toEqual([first])

    nodeStore.setRuntimeSections([second])
    expect(disposeFirst).toHaveBeenCalledTimes(1)
    expect(disposeSecond).not.toHaveBeenCalled()

    nodeStore.dispose()
    nodeStore.dispose()
    expect(disposeFirst).toHaveBeenCalledTimes(1)
    expect(disposeSecond).toHaveBeenCalledTimes(1)
  })

  describe('hasError', () => {
    it('includes section errors', () => {
      const nodeStore = createNodeStore({
        sections: val([createSection(true)]),
      })

      expect(nodeStore.$.hasError.value).toBe(true)
    })
  })
})
