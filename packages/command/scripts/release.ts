import type { OpenFlowCommandRelease } from '../src/distribution/common/commandRelease.ts'

import { execFile } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildBunVersion } from '../src/cli/common/version.ts'
import { commandReleaseFormat, commandReleaseVersion, encodeCommandRelease } from '../src/distribution/common/commandRelease.ts'
import { decodeCommandArchive } from '../src/distribution/node/commandArchive.ts'
import { sha256 } from '../src/distribution/node/commandTree.ts'

const execFileAsync = promisify(execFile)
const rootPath = path.resolve(import.meta.dirname, '..')
const releaseRoot = path.join(rootPath, 'dist/release')
const cdnBaseUrl = readOption('--cdn-base-url')
if (cdnBaseUrl == null) throw new TypeError('Usage: bun scripts/release.ts --cdn-base-url <immutable-base-url>')

await execFileAsync(process.execPath, [path.join(rootPath, 'scripts/build.ts'), '--quiet'], { cwd: rootPath })
const archiveNames = (await readdir(releaseRoot)).filter((file) => file.endsWith('.tar.gz'))
if (archiveNames.length != 1) throw new Error(`Expected one command archive; received ${archiveNames.length}.`)
const archiveName = archiveNames[0]!
const archiveBytes = await readFile(path.join(releaseRoot, archiveName))
const { manifest } = await decodeCommandArchive(archiveBytes)
if (manifest.bunVersion != buildBunVersion) {
  throw new Error(`Command artifact was built with Bun ${manifest.bunVersion}; release expects ${buildBunVersion}.`)
}

const baseUrl = new URL(cdnBaseUrl)
if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new TypeError('CDN base URL must use HTTP or HTTPS.')
if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/'
const release: OpenFlowCommandRelease = {
  archive: {
    digest: sha256(archiveBytes),
    length: archiveBytes.byteLength,
    url: new URL(archiveName, baseUrl).href,
  },
  bunVersion: buildBunVersion,
  format: commandReleaseFormat,
  openFlowVersion: manifest.openFlowVersion,
  version: commandReleaseVersion,
}
const source = encodeCommandRelease(release)
await writeFile(path.join(releaseRoot, 'open-flow-command-release.json'), source)
process.stdout.write(source)

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  const value = index < 0 ? undefined : process.argv[index + 1]
  if (value == null || value.startsWith('--')) return
  return value
}
