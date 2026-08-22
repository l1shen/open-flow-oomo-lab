import { describe, expect, it } from 'vitest'
import {
  scriptletExtensions,
  scriptletIndentation,
  scriptletLanguageByExtension,
  scriptletPresets,
  scriptletTemplates,
} from '../../src/designer/browser/scriptletPresets.ts'
import { scriptletDirectory } from '../../src/manifest/common/scriptlet.ts'

describe('Scriptlet presets', () => {
  it('provides two portable JavaScript templates', () => {
    expect([...scriptletPresets.keys()]).toEqual(['typescript', 'javascript'])
    expect(scriptletPresets.get('typescript')?.task.executor.name).toBe('javascript')
    expect(scriptletPresets.get('javascript')?.task.executor.name).toBe('javascript')
    expect(scriptletExtensions).toEqual({ javascript: '.js', typescript: '.ts' })
    expect(scriptletLanguageByExtension.get('.txt')).toBe('plaintext')
    expect(scriptletIndentation).toEqual({ javascript: '  ', typescript: '  ' })
  })

  it('generates imports for the public npm package', () => {
    expect(scriptletTemplates.javascript).toContain('@oomol-lab/open-flow')
    expect(scriptletTemplates.typescript).toContain('@oomol-lab/open-flow')
    expect(scriptletDirectory).toBe('scriptlets')
  })

  it('uses icons from the retained Carbon collection', () => {
    expect(scriptletPresets.get('typescript')?.icon).toBe(':carbon:script:')
    expect(scriptletPresets.get('javascript')?.icon).toBe(':carbon:code:')
  })
})
