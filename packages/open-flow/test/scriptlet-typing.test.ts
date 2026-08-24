import type { HandleName } from '../src/schema/interface.ts'

import assert from 'node:assert/strict'
import { test } from 'vitest'
import { generateTyping, mergeTypingIntoSourceFile, typescriptOf } from '../src/manifest/common/meta/block/generateTyping.ts'

function handle(name: string): HandleName {
  return name as HandleName
}

test('replaces only a complete generated scriptlet metadata region', () => {
  const source = ['//#region generated meta', 'type Inputs = {}', '//#endregion', '', 'export default async function () {}', ''].join('\n')
  const typing = ['type Inputs = {', '  name: string;', '};', ''].join('\n')
  assert.equal(
    mergeTypingIntoSourceFile(source, typing),
    ['//#region generated meta', 'type Inputs = {', '  name: string;', '};', '//#endregion', '', 'export default async function () {}', ''].join('\n'),
  )
  assert.equal(mergeTypingIntoSourceFile('export default 1\n', typing), 'export default 1\n')
})

test('generates the public ArtifactRef type for Artifact handles', () => {
  assert.equal(typescriptOf({ contentMediaType: 'oomol/artifact' }, false), 'ArtifactRef')
  assert.equal(typescriptOf({ contentMediaType: 'oomol/artifact' }, true), 'ArtifactRef | null')
  assert.equal(
    generateTyping(
      'typescript',
      [{ handle: handle('source'), json_schema: { contentMediaType: 'oomol/artifact' } }],
      [{ handle: handle('result'), json_schema: { contentMediaType: 'oomol/artifact' }, nullable: true }],
    ),
    [
      "import type { ArtifactRef } from '@oomol-lab/open-flow'",
      '',
      'type Inputs = {',
      '  source: ArtifactRef;',
      '};',
      'type Outputs = {',
      '  result: ArtifactRef | null;',
      '};',
      '',
    ].join('\n'),
  )
  assert.equal(
    generateTyping('javascript', [{ handle: handle('source'), json_schema: { contentMediaType: 'oomol/artifact' } }], []),
    [
      '/**',
      ' * @import { ArtifactRef } from "@oomol-lab/open-flow"',
      ' * @typedef {{',
      ' *   source: ArtifactRef;',
      ' * }} Inputs;',
      ' * @typedef {{',
      ' * }} Outputs;',
      ' */',
      '',
    ].join('\n'),
  )
  assert.doesNotMatch(generateTyping('typescript', [{ handle: handle('value'), json_schema: { enum: ['ArtifactRef'] } }], []), /import type/)
})
