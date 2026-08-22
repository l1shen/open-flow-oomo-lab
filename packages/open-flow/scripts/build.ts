import { toPlainObject } from '@wopjs/cast'
import { execFile } from 'node:child_process'
import { chmod, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire, isBuiltin } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildJavaScriptBundle } from '../src/build/node/bundle.ts'
import { buildBunVersion } from '../src/cli/common/version.ts'
import { buildBrowserPackage } from '../src/distribution/node/browserPackage.ts'
import { encodeCommandArchive } from '../src/distribution/node/commandArchive.ts'
import { collectCommandArchiveFiles, sha256, writeCommandArtifactManifest } from '../src/distribution/node/commandTree.ts'
import { stageNpmPackage } from '../src/distribution/node/npmPackage.ts'

const rootPath = path.resolve(import.meta.dirname, '..')
const workspaceRoot = path.resolve(rootPath, '../..')
const outputPath = path.join(rootPath, 'dist')
const commandRoot = path.join(outputPath, 'command/open-flow-command')
const npmPackageRoot = path.join(outputPath, 'npm-package/package')
const releaseRoot = path.join(outputPath, 'release')
const quiet = process.argv.includes('--quiet')
const typesOnly = process.argv.includes('--types-only')
const execFileAsync = promisify(execFile)
const packageRequire = createRequire(import.meta.url)
const packageManifest = await readManifest(path.join(rootPath, 'package.json'))
const workspaceManifest = await readManifest(path.join(workspaceRoot, 'package.json'))
const openFlowVersion = readString(packageManifest, 'version')

interface BundledPackageLicense {
  readonly license: string
  readonly licenseText: string
  readonly name: string
  readonly version: string
}

await validateVersions()
await rm(outputPath, { force: true, recursive: true })
await mkdir(releaseRoot, { recursive: true })
await Promise.all([buildNpmPackage(), ...(typesOnly ? [] : [buildCommandArtifact()])])

async function buildCommandArtifact(): Promise<void> {
  await mkdir(commandRoot, { recursive: true })
  await copyCommandFiles()
  const result = await buildJavaScriptBundle(
    {
      entrypoints: [path.join(rootPath, 'src/cli/node/commandEntry.ts')],
      define: { openFlowVersionBuildConstant: JSON.stringify(openFlowVersion) },
      env: 'disable',
      format: 'esm',
      minify: true,
      root: rootPath,
      splitting: false,
      target: 'bun',
    },
    {
      failureMessage: 'Command entry build failed.',
      onWarning: quiet ? undefined : (message) => process.stderr.write(`${message}\n`),
      projectRoot: rootPath,
    },
  )

  for (const imported of result.externalImports) {
    if (!isBuiltin(imported)) {
      throw new Error(`Unexpected external import ${imported}. Bundle it into the command entry.`)
    }
  }
  const forbiddenInputs = ['/src/workbench/', '/src/compiler/', '/src/project/node/']
  for (const input of result.resolvedInputPaths) {
    const normalized = input.split(path.sep).join('/')
    if (forbiddenInputs.some((part) => normalized.includes(part))) throw new Error(`Command entry includes forbidden product code: ${input}`)
  }

  const bunShebang = '#!/usr/bin/env bun\n'
  const entryPath = path.join(commandRoot, 'entry.js')
  if (!new TextDecoder().decode(result.bytes.subarray(0, bunShebang.length)).startsWith(bunShebang)) {
    throw new Error('Command entry bundle did not preserve the required Bun shebang.')
  }
  await writeFile(entryPath, result.bytes)
  await chmod(entryPath, 0o755)

  const [projectLicense, nodeLicenses] = await Promise.all([readFile(path.join(rootPath, 'LICENSE'), 'utf8'), renderNodeLicenses(result.resolvedInputPaths)])
  await writeFile(
    path.join(commandRoot, 'LICENSE.md'),
    ['# Open Flow license', '', projectLicense.trim(), '', '# Licenses of bundled dependencies', '', nodeLicenses.trim(), ''].join('\n'),
  )

  await writeCommandArtifactManifest(commandRoot, { bun: buildBunVersion, openFlow: openFlowVersion })
  const archive = await encodeCommandArchive(await collectCommandArchiveFiles(commandRoot))
  const archiveName = `open-flow-${openFlowVersion}-${sha256(archive)}.tar.gz`
  await writeFile(path.join(releaseRoot, archiveName), archive)
}

async function buildNpmPackage(): Promise<void> {
  await stageNpmPackage({ packageRoot: npmPackageRoot, sourceRoot: rootPath, version: openFlowVersion })
  const compiler = path.join(path.dirname(packageRequire.resolve('typescript/package.json')), 'bin/tsc')
  await Promise.all([
    execFileAsync(
      process.execPath,
      [
        compiler,
        '--ignoreConfig',
        '--declaration',
        '--emitDeclarationOnly',
        '--outDir',
        path.join(npmPackageRoot, 'dist'),
        '--rootDir',
        path.join(rootPath, 'src/types'),
        '--module',
        'nodenext',
        '--moduleResolution',
        'nodenext',
        '--target',
        'esnext',
        '--skipLibCheck',
        'true',
        path.join(rootPath, 'src/types/index.ts'),
      ],
      { cwd: rootPath },
    ),
    buildBrowserPackage({ packageRoot: npmPackageRoot, quiet, sourceRoot: rootPath }),
  ])
  await execFileAsync(
    process.execPath,
    ['pm', 'pack', '--ignore-scripts', '--filename', path.join(releaseRoot, `oomol-lab-open-flow-${openFlowVersion}.tgz`), ...(quiet ? ['--quiet'] : [])],
    { cwd: npmPackageRoot },
  )
}

async function copyCommandFiles(): Promise<void> {
  await Promise.all([
    copyFile(path.join(rootPath, 'LICENSE'), path.join(commandRoot, 'LICENSE')),
    copyFile(path.join(rootPath, 'NOTICE'), path.join(commandRoot, 'NOTICE')),
  ])
}

async function validateVersions(): Promise<void> {
  const bunVersionFile = (await readFile(path.join(workspaceRoot, '.bun-version'), 'utf8')).trim()
  const packageManager = readString(workspaceManifest, 'packageManager')
  const bun = Reflect.get(globalThis, 'Bun')
  const runtimeVersion = bun != null && typeof bun == 'object' ? Reflect.get(bun, 'version') : undefined
  if (bunVersionFile != buildBunVersion) {
    throw new Error(`.bun-version must be ${buildBunVersion}; received ${bunVersionFile}.`)
  }
  if (packageManager != `bun@${buildBunVersion}`) {
    throw new Error(`packageManager must be bun@${buildBunVersion}; received ${packageManager}.`)
  }
  if (runtimeVersion != buildBunVersion) {
    throw new Error(`Build requires Bun ${buildBunVersion}; received ${String(runtimeVersion ?? 'an unsupported runtime')}.`)
  }
}

async function readManifest(filePath: string): Promise<Record<string, unknown>> {
  const manifest = toPlainObject(JSON.parse(await readFile(filePath, 'utf8')))
  if (manifest == null) throw new Error(`Invalid package manifest: ${filePath}`)
  return manifest
}

function readString(manifest: Record<string, unknown>, field: string): string {
  const value = manifest[field]
  if (typeof value != 'string' || value.length == 0) throw new Error(`Package manifest field ${field} must be a non-empty string.`)
  return value
}

async function renderNodeLicenses(inputs: readonly string[]): Promise<string> {
  const packagePaths = new Set<string>()
  for (const input of inputs) {
    if (!input.split(path.sep).includes('node_modules')) continue
    const packagePath = await findPackageManifest(input)
    if (packagePath != null) packagePaths.add(packagePath)
  }
  const packages = await Promise.all([...packagePaths].map(readPackageLicense))
  return packages
    .toSorted((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
    .map((dependency) => [`### ${dependency.name} - ${dependency.version} (${dependency.license})`, '', dependency.licenseText].join('\n').trim())
    .join('\n\n')
}

async function findPackageManifest(inputPath: string, excludedPath?: string): Promise<string | undefined> {
  let directory = path.dirname(inputPath)
  while (true) {
    const packagePath = path.join(directory, 'package.json')
    if (packagePath == excludedPath) {
      const parent = path.dirname(directory)
      if (parent == directory) return
      directory = parent
      continue
    }
    try {
      await readFile(packagePath)
      return packagePath
    } catch (error) {
      if (error == null || typeof error != 'object' || !('code' in error) || error.code != 'ENOENT') throw error
    }
    const parent = path.dirname(directory)
    if (parent == directory) return
    directory = parent
  }
}

async function readPackageLicense(packagePath: string): Promise<BundledPackageLicense> {
  const manifest = toPlainObject(JSON.parse(await readFile(packagePath, 'utf8')))
  if (manifest == null) throw new Error(`Bundled dependency has invalid package metadata: ${packagePath}`)
  const name = manifest?.name
  const version = manifest?.version
  if (typeof name != 'string' || typeof version != 'string') {
    const ownerPackagePath = await findPackageManifest(packagePath, packagePath)
    if (ownerPackagePath != null) return readPackageLicense(ownerPackagePath)
    throw new Error(`Bundled dependency has invalid package metadata: ${packagePath}`)
  }

  const directory = path.dirname(packagePath)
  const licenseFile = (await readdir(directory)).find((file) => /^licen[cs]e(?:\.|$)/i.test(file))
  return {
    license: typeof manifest.license == 'string' ? manifest.license : 'unknown',
    licenseText: licenseFile == null ? '' : (await readFile(path.join(directory, licenseFile), 'utf8')).trim(),
    name,
    version,
  }
}
