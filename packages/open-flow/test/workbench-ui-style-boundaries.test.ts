import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'vitest'

const packageRoot = new URL('..', import.meta.url)

test('keeps browser control normalization below Workbench component utilities', async () => {
  const [uiStyles, workbenchStyles] = await Promise.all([
    readFile(new URL('src/ui/browser/styles.css', packageRoot), 'utf8'),
    readFile(new URL('src/workbench/browser/runtime/styles.css', packageRoot), 'utf8'),
  ])

  assert.match(uiStyles, /@layer theme, base, utilities;/)
  assert.match(uiStyles, /@layer base \{[\s\S]*?:where\(\.open-flow-workbench, \.oo-designer-root\) button/)
  assert.match(uiStyles, /border: 0 solid;/)
  assert.doesNotMatch(workbenchStyles, /\n  button,\n  input,\n  select,\n  textarea \{/)
  assert.doesNotMatch(workbenchStyles, /\n  button \{\n    border: 0;/)
})

test('keeps Designer node controls in the compact root normalization', async () => {
  const designerRootStyles = await readFile(new URL('src/designer/browser/styles/root.scss', packageRoot), 'utf8')

  assert.match(designerRootStyles, /button:not\(\[data-canvas-control-scope\] button\)/)
  assert.doesNotMatch(designerRootStyles, /button:not\(\[data-slot\]\)/)
})
