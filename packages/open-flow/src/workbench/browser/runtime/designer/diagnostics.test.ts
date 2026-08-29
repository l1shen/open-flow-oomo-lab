import type { Diagnostic } from '../api.ts'

import { describe, expect, it } from 'vitest'
import { createI18n } from '../i18n.ts'
import { diagnosticMessage } from './diagnostics.ts'

const base = {
  column: 0,
  line: 1,
  path: '/document/graph',
} as const

describe('Workbench Diagnostic messages', () => {
  it('translates code variants with structured values', () => {
    const i18n = createI18n('zh-CN')
    const diagnostic: Diagnostic = {
      ...base,
      code: 'graph.target-missing',
      message: 'Task "missing" does not exist.',
      values: { taskId: 'missing', variant: 'task' },
    }

    expect(diagnosticMessage(diagnostic, i18n.t)).toBe('Task“missing”不存在。')
    i18n.dispose()
  })

  it('uses the canonical message for an unknown code', () => {
    const i18n = createI18n('zh-CN')
    const diagnostic: Diagnostic = {
      ...base,
      code: 'plugin.custom',
      message: 'Plugin-specific problem.',
      values: { name: 'plugin' },
    }

    expect(diagnosticMessage(diagnostic, i18n.t)).toBe('Plugin-specific problem.')
    i18n.dispose()
  })
})
