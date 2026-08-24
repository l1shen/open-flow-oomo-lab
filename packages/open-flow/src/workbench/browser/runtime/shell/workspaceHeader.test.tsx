import type { ReactElement, ReactNode } from 'react'
import type { WorkspaceStatus } from '../stores/workspaceModel.ts'

import { Children, isValidElement } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkspaceHeader } from './workspaceHeader.tsx'

const hooks = vi.hoisted(() => ({
  effectIndex: 0,
  effects: [] as { cleanup?: () => void; dependencies?: readonly unknown[] }[],
  refIndex: 0,
  refs: [] as { current: unknown }[],
  stateIndex: 0,
  states: [] as unknown[],
}))

vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>()
  return {
    ...original,
    useEffect: (callback: () => (() => void) | undefined, dependencies?: readonly unknown[]) => {
      const index = hooks.effectIndex++
      const previous = hooks.effects[index]
      const changed =
        previous == null ||
        dependencies == null ||
        previous.dependencies == null ||
        dependencies.length != previous.dependencies.length ||
        dependencies.some((dependency, dependencyIndex) => dependency !== previous.dependencies?.[dependencyIndex])
      if (!changed) return
      previous?.cleanup?.()
      hooks.effects[index] = { cleanup: callback(), dependencies }
    },
    useRef: <T,>(value: T) => {
      const index = hooks.refIndex++
      return (hooks.refs[index] ??= { current: value }) as { current: T }
    },
    useState: <T,>(initial: T | (() => T)) => {
      const index = hooks.stateIndex++
      if (!(index in hooks.states)) hooks.states[index] = typeof initial == 'function' ? (initial as () => T)() : initial
      const set = (value: T | ((current: T) => T)) => {
        const current = hooks.states[index] as T
        hooks.states[index] = typeof value == 'function' ? (value as (current: T) => T)(current) : value
      }
      return [hooks.states[index] as T, set] as const
    },
  }
})

vi.mock('use-value-enhancer', () => ({ useVal: <T,>(value: { readonly value: T }): T => value.value }))
vi.mock('val-i18n-react', () => ({ useTranslate: () => (key: string) => key }))
vi.mock('../icons.tsx', () => ({ Icon: () => null }))
vi.mock('./diagnosticsPanel.tsx', () => ({ DiagnosticsPanel: () => null }))
vi.mock('./resourceBrowser.tsx', () => ({ LanguageSelect: () => null }))

function signal<T>(value: T): { value: T } {
  return { value }
}

function render(status: { value: WorkspaceStatus }): ReactElement {
  hooks.effectIndex = 0
  hooks.refIndex = 0
  hooks.stateIndex = 0
  const store = {
    $: { busy: signal(undefined) },
    publications: { publish: () => undefined },
    runRequests: { $: { inputRequest: signal(undefined) }, dismissInputs: () => undefined },
    workspace: {
      $: {
        checkLoading: signal(false),
        diagnosticItems: signal([]),
        diagnostics: signal(undefined),
        draft: signal({}),
        project: signal(undefined),
        status,
        target: signal(undefined),
        targetFlow: signal(undefined),
        targetName: signal(undefined),
        workspaceLoading: signal(false),
      },
    },
  }
  return WorkspaceHeader({
    activeView: 'design',
    language: 'en',
    onLanguageChange: () => undefined,
    onOpenDesign: () => undefined,
    onOpenProject: () => undefined,
    onOpenProjects: () => undefined,
    onOpenPublications: () => undefined,
    onOpenRuns: () => undefined,
    onRunDraft: () => undefined,
    onRunLive: () => undefined,
    store: store as never,
  })
}

function findDisplayedStatus(node: ReactNode): string | undefined {
  if (!isValidElement(node)) return
  const props = node.props as { readonly children?: ReactNode; readonly className?: string }
  if (props.className == 'saved-state') return String(Children.toArray(props.children).at(-1))
  for (const child of Children.toArray(props.children)) {
    const found = findDisplayedStatus(child)
    if (found != null) return found
  }
}

function displayedStatus(view: ReactElement): string | undefined {
  return findDisplayedStatus(view)
}

beforeEach(() => {
  vi.useFakeTimers()
  hooks.effectIndex = 0
  hooks.effects = []
  hooks.refIndex = 0
  hooks.refs = []
  hooks.stateIndex = 0
  hooks.states = []
})

afterEach(() => {
  for (const effect of hooks.effects) effect.cleanup?.()
  vi.useRealTimers()
})

it('keeps fast saves visually stable', () => {
  const status = signal<WorkspaceStatus>('saved')
  expect(displayedStatus(render(status))).toBe('workspace.status.saved')

  status.value = 'saving'
  expect(displayedStatus(render(status))).toBe('workspace.status.saved')
  vi.advanceTimersByTime(399)
  status.value = 'saved'
  expect(displayedStatus(render(status))).toBe('workspace.status.saved')
  vi.runAllTimers()
  expect(displayedStatus(render(status))).toBe('workspace.status.saved')
})

it('shows sustained saves without flashing at the completion boundary', () => {
  const status = signal<WorkspaceStatus>('saved')
  render(status)
  status.value = 'saving'
  render(status)

  vi.advanceTimersByTime(400)
  expect(displayedStatus(render(status))).toBe('workspace.status.saving')

  status.value = 'saved'
  expect(displayedStatus(render(status))).toBe('workspace.status.saving')
  vi.advanceTimersByTime(399)
  expect(displayedStatus(render(status))).toBe('workspace.status.saving')
  vi.advanceTimersByTime(1)
  expect(displayedStatus(render(status))).toBe('workspace.status.saved')
})
