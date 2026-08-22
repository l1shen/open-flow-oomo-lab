import type { CommandArtifactManifest } from '../common/commandArtifact.ts'
import type { CommandArchiveFile } from './commandArchive.ts'

import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  commandArtifactEntryFile,
  commandArtifactFormat,
  commandArtifactManifestFile,
  commandArtifactVersion,
  compareCommandArtifactPaths,
  encodeCommandArtifactManifest,
} from '../common/commandArtifact.ts'

export async function writeCommandArtifactManifest(
  commandRoot: string,
  versions: { readonly bun: string; readonly openFlow: string },
): Promise<CommandArtifactManifest> {
  const files = await collectCommandFiles(commandRoot, true)
  const manifest: CommandArtifactManifest = {
    bunVersion: versions.bun,
    entry: commandArtifactEntryFile,
    files: files.map(({ bytes, path: filePath }) => ({
      digest: sha256(bytes),
      length: bytes.byteLength,
      path: filePath,
    })),
    format: commandArtifactFormat,
    openFlowVersion: versions.openFlow,
    version: commandArtifactVersion,
  }
  await writeFile(path.join(commandRoot, commandArtifactManifestFile), encodeCommandArtifactManifest(manifest))
  return manifest
}

export async function collectCommandArchiveFiles(commandRoot: string): Promise<readonly CommandArchiveFile[]> {
  return collectCommandFiles(commandRoot, false)
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function collectCommandFiles(commandRoot: string, excludeManifest: boolean): Promise<readonly CommandArchiveFile[]> {
  const files: CommandArchiveFile[] = []
  await walk('')
  return files.toSorted((left, right) => compareCommandArtifactPaths(left.path, right.path))

  async function walk(relativeDirectory: string): Promise<void> {
    const directory = path.join(commandRoot, relativeDirectory)
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const relativePath = relativeDirectory == '' ? entry.name : `${relativeDirectory}/${entry.name}`
      if (entry.isDirectory()) {
        await walk(relativePath)
      } else if (entry.isFile()) {
        if (!excludeManifest || relativePath != commandArtifactManifestFile) {
          files.push({ bytes: await readFile(path.join(commandRoot, relativePath)), path: relativePath })
        }
      } else {
        throw new TypeError(`Command artifact contains a non-regular file: ${relativePath}`)
      }
    }
  }
}
