import type { ReactElement } from 'react'
import type { NavigationStore } from './navigation.ts'
import type { WorkbenchStore } from './stores/workbenchStore.ts'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import FlowWorkspace from './flowWorkspace.tsx'

const mocks = vi.hoisted(() => ({
  setOpen: vi.fn(),
  setVisible: vi.fn(),
  stateCall: 0,
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: vi.fn(),
  useRef: vi.fn(() => ({ current: undefined })),
  useState: vi.fn(() => (mocks.stateCall++ == 0 ? [false, mocks.setVisible] : [false, mocks.setOpen])),
}))

vi.mock('use-value-enhancer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('use-value-enhancer')>()),
  useVal: (value: { readonly value: unknown }) => value.value,
}))

vi.mock('val-i18n-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('val-i18n-react')>()),
  useTranslate: () => (key: string) => key,
}))

vi.mock('./designer/workbenchDesigner.tsx', () => ({ WorkbenchDesigner: () => null }))

const value = <T,>(current: T): { readonly value: T } => ({ value: current })

function renderWorkspace() {
  const navigation = {
    $: { view: value('design') },
    open: vi.fn(),
    openFlows: vi.fn(),
    openMainFlow: vi.fn(),
  } as unknown as NavigationStore
  const store = {
    requestDraftRun: vi.fn().mockResolvedValue('started'),
    requestLiveRun: vi.fn().mockResolvedValue('started'),
    runRequests: {
      $: { submitting: value(undefined) },
      dismissInputs: vi.fn(),
    },
    runs: { $: { externalRunId: value(undefined) } },
    workspace: {
      $: {
        draft: value({ revisionId: 'revision' }),
        flowId: value('flow'),
        workspaceLoadFailed: value(false),
        workspaceLoading: value(false),
      },
    },
  } as unknown as WorkbenchStore
  const element = FlowWorkspace({
    hrefFor: () => '/',
    navigation,
    store,
    theme: 'light',
  })
  const main = element.props.children as ReactElement
  const header = (main.props.children as ReactElement[])[0]! as ReactElement<{
    readonly onRunDraft: () => void
    readonly onRunLive: () => void
  }>
  return { header, navigation, store }
}

describe('FlowWorkspace run drawer', () => {
  beforeEach(() => {
    mocks.setOpen.mockReset()
    mocks.setVisible.mockReset()
    mocks.stateCall = 0
  })

  it.each(['onRunDraft', 'onRunLive'] as const)('opens the log panel after %s starts', async (action) => {
    const { header } = renderWorkspace()

    header.props[action]()
    await Promise.resolve()

    expect(mocks.setVisible).toHaveBeenCalledWith(true)
    expect(mocks.setOpen).toHaveBeenCalledWith(true)
  })
})
