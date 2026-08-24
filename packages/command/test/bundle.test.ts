import type { BuildGraph, BundleDiagnostic } from '../src/build/node/bundle.ts'

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { test } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..')
const bundleModule = pathToFileURL(path.join(projectRoot, 'src/build/node/bundle.ts')).href
const execFileAsync = promisify(execFile)

async function runInBun<T>(body: string): Promise<T> {
  const { stdout } = await execFileAsync('bun', ['--eval', `import { buildJavaScriptBundle, BundleError } from ${JSON.stringify(bundleModule)};\n${body}`], {
    cwd: projectRoot,
  })
  return JSON.parse(stdout) as T
}

test('normalizes Bun build output into one project-owned JavaScript bundle', async () => {
  const entryPath = path.join(projectRoot, '.open-flow-bundle-test-entry.mjs')
  const dependencyPath = path.join(projectRoot, '.open-flow-bundle-test-dependency.ts')
  const config = {
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
  }
  const result = await runInBun<{
    readonly bytesLength: number
    readonly externalImports: readonly string[]
    readonly graph: BuildGraph
    readonly resolvedInputPaths: readonly string[]
  }>(`
    const result = await buildJavaScriptBundle(${JSON.stringify(config)}, { projectRoot: ${JSON.stringify(projectRoot)} });
    console.log(JSON.stringify({
      bytesLength: result.bytes.byteLength,
      externalImports: result.externalImports,
      graph: result.graph,
      resolvedInputPaths: result.resolvedInputPaths,
    }));
  `)

  assert.ok(result.bytesLength > 0)
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
      path: 'node:crypto',
    },
  ])
  assert.equal(result.graph.inputs[1]?.imports[1]?.original, undefined)
  assert.deepEqual(result.resolvedInputPaths, [dependencyPath, entryPath])
})

test('converts Bun build errors into BundleError diagnostics', async () => {
  const entryPath = path.join(projectRoot, '.open-flow-bundle-test-failure.mjs')
  const config = {
    allowUnresolved: [],
    entrypoints: [entryPath],
    files: { [entryPath]: 'import "./missing-module.ts";' },
    root: projectRoot,
    target: 'browser',
  }
  const result = await runInBun<{
    readonly diagnostics: readonly BundleDiagnostic[]
    readonly isBundleError: boolean
  }>(`
    try {
      await buildJavaScriptBundle(${JSON.stringify(config)}, { projectRoot: ${JSON.stringify(projectRoot)} });
    } catch (error) {
      console.log(JSON.stringify({
        diagnostics: error instanceof BundleError ? error.diagnostics : [],
        isBundleError: error instanceof BundleError,
      }));
    }
  `)

  assert.equal(result.isBundleError, true)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0]?.code, 'bundle.build-failed')
  assert.match(result.diagnostics[0]?.path ?? '', /^\.open-flow-bundle-test-failure\.mjs:\d+:\d+$/)
  assert.match(result.diagnostics[0]?.message ?? '', /Could not resolve/)
})
