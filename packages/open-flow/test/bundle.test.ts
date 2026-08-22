import { test } from 'bun:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { buildJavaScriptBundle, BundleError } from '../src/build/node/bundle.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')

test('normalizes Bun build output into one project-owned JavaScript bundle', async () => {
  const entryPath = path.join(projectRoot, '.open-flow-bundle-test-entry.mjs')
  const dependencyPath = path.join(projectRoot, '.open-flow-bundle-test-dependency.ts')
  const result = await buildJavaScriptBundle(
    {
      entrypoints: [entryPath],
      external: ['node:*'],
      files: {
        [dependencyPath]: 'export const value = 42;',
        [entryPath]: 'export { value } from "./.open-flow-bundle-test-dependency.ts"; export { createHash } from "node:crypto";',
      },
      format: 'esm',
      root: projectRoot,
      splitting: false,
      target: 'browser',
    },
    { projectRoot },
  )

  assert.ok(result.bytes.byteLength > 0)
  assert.deepEqual(result.externalImports, ['node:crypto'])
  assert.deepEqual(
    result.graph.inputs.map((input) => input.id),
    ['.open-flow-bundle-test-dependency.ts', '.open-flow-bundle-test-entry.mjs'],
  )
  assert.deepEqual(result.graph.inputs[1]?.imports, [
    {
      external: false,
      kind: 'import-statement',
      original: './.open-flow-bundle-test-dependency.ts',
      path: '.open-flow-bundle-test-dependency.ts',
    },
    {
      external: true,
      kind: 'import-statement',
      original: undefined,
      path: 'node:crypto',
    },
  ])
  assert.deepEqual(result.resolvedInputPaths, [dependencyPath, entryPath])
})

test('converts Bun build errors into BundleError diagnostics', async () => {
  const entryPath = path.join(projectRoot, '.open-flow-bundle-test-failure.mjs')
  await assert.rejects(
    buildJavaScriptBundle(
      {
        allowUnresolved: [],
        entrypoints: [entryPath],
        files: { [entryPath]: 'import "./missing-module.ts";' },
        root: projectRoot,
        target: 'browser',
      },
      { projectRoot },
    ),
    (error: unknown) => {
      assert.ok(error instanceof BundleError)
      assert.equal(error.diagnostics.length, 1)
      assert.equal(error.diagnostics[0]?.code, 'bundle.build-failed')
      assert.match(error.diagnostics[0]?.path ?? '', /^\.open-flow-bundle-test-failure\.mjs:\d+:\d+$/)
      assert.match(error.diagnostics[0]?.message ?? '', /Could not resolve/)
      return true
    },
  )
})
