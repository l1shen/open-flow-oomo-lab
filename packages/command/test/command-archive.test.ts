import type { TarEntry } from 'modern-tar'
import type { CommandArtifactManifest } from '../src/distribution/common/commandArtifact.ts'
import type { CommandArchiveFile } from '../src/distribution/node/commandArchive.ts'

import { packTar, unpackTar } from 'modern-tar'
import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, test } from 'vitest'
import { buildBunVersion } from '../src/cli/common/version.ts'
import {
  commandArtifactEntryFile,
  commandArtifactFormat,
  commandArtifactManifestFile,
  commandArtifactVersion,
  compareCommandArtifactPaths,
  decodeCommandArtifactManifest,
  encodeCommandArtifactManifest,
} from '../src/distribution/common/commandArtifact.ts'
import { commandReleaseFormat, commandReleaseVersion, decodeCommandRelease, encodeCommandRelease } from '../src/distribution/common/commandRelease.ts'
import { commandArchiveRoot, decodeCommandArchive, encodeCommandArchive, extractCommandArchive } from '../src/distribution/node/commandArchive.ts'

const encoder = new TextEncoder()

function bytes(source: string): Uint8Array {
  return encoder.encode(source)
}

function digest(source: Uint8Array): string {
  return createHash('sha256').update(source).digest('hex')
}

function fixture(): { readonly files: readonly CommandArchiveFile[]; readonly manifest: CommandArtifactManifest } {
  const payload = [
    { bytes: bytes('#!/usr/bin/env bun\\nconsole.log("flow")\\n'), path: commandArtifactEntryFile },
    { bytes: bytes('Open Flow license\\n'), path: 'LICENSE' },
  ].toSorted((left, right) => compareCommandArtifactPaths(left.path, right.path))
  const manifest: CommandArtifactManifest = {
    bunVersion: buildBunVersion,
    entry: commandArtifactEntryFile,
    files: payload.map((file) => ({ digest: digest(file.bytes), length: file.bytes.byteLength, path: file.path })),
    format: commandArtifactFormat,
    openFlowVersion: '1.2.3',
    version: commandArtifactVersion,
  }
  const manifestFile = { bytes: bytes(encodeCommandArtifactManifest(manifest)), path: commandArtifactManifestFile }
  return { files: [manifestFile, ...payload], manifest }
}

function canonicalGzip(tar: Uint8Array): Uint8Array {
  const archive = new Uint8Array(gzipSync(tar, { level: 9 }))
  archive[3] = 0
  archive[4] = 0
  archive[5] = 0
  archive[6] = 0
  archive[7] = 0
  archive[8] = 2
  archive[9] = 255
  return archive
}

function header(name: string, size: number, overrides: Partial<TarEntry['header']> = {}): TarEntry['header'] {
  const path = name.slice(`${commandArchiveRoot}/`.length)
  return {
    gid: 0,
    gname: '',
    mode: path == commandArtifactEntryFile ? 0o755 : 0o644,
    mtime: new Date(0),
    name,
    size,
    type: 'file',
    uid: 0,
    uname: '',
    ...overrides,
  }
}

async function archiveEntries(entries: readonly TarEntry[]): Promise<Uint8Array> {
  return canonicalGzip(await packTar([...entries]))
}

async function archiveFiles(files: readonly CommandArchiveFile[]): Promise<Uint8Array> {
  return archiveEntries(
    files
      .toSorted((left, right) => compareCommandArtifactPaths(left.path, right.path))
      .map((file) => ({
        body: file.bytes,
        header: header(`${commandArchiveRoot}/${file.path}`, file.bytes.byteLength),
      })),
  )
}

describe('command artifact manifest', () => {
  test('round-trips canonical JSON with a trailing newline', () => {
    const { manifest } = fixture()
    const encoded = encodeCommandArtifactManifest(manifest)

    expect(encoded.endsWith('\n')).toBe(true)
    expect(decodeCommandArtifactManifest(encoded)).toEqual(manifest)
  })

  test('orders paths by Unicode code point rather than UTF-16 code unit', () => {
    expect(compareCommandArtifactPaths('\ue000', '\u{10000}')).toBeLessThan(0)
    expect(compareCommandArtifactPaths('\u{10000}', '\ue000')).toBeGreaterThan(0)
  })

  test('rejects unknown fields, unsorted files, bad digests, and non-canonical JSON', () => {
    const { manifest } = fixture()
    const encoded = encodeCommandArtifactManifest(manifest)

    expect(() => decodeCommandArtifactManifest(`${JSON.stringify({ ...manifest, unknown: true })}\n`)).toThrow(/Invalid command artifact manifest/)
    expect(() => decodeCommandArtifactManifest(`${JSON.stringify({ ...manifest, files: manifest.files.toReversed() })}\n`)).toThrow(/Unicode code-point order/)
    expect(() =>
      decodeCommandArtifactManifest(
        `${JSON.stringify({ ...manifest, files: [{ ...manifest.files[0], digest: 'A'.repeat(64) }, ...manifest.files.slice(1)] })}\n`,
      ),
    ).toThrow(/Invalid command artifact manifest/)
    expect(() => decodeCommandArtifactManifest(encoded.slice(0, -1))).toThrow(/not canonical/)
  })
})

describe('command release', () => {
  test('round-trips a canonical immutable archive pin', () => {
    const archiveDigest = 'a'.repeat(64)
    const release = {
      archive: {
        digest: archiveDigest,
        length: 123,
        url: `https://cdn.example/open-flow/open-flow-1.2.3-${archiveDigest}.tar.gz`,
      },
      bunVersion: buildBunVersion,
      format: commandReleaseFormat,
      openFlowVersion: '1.2.3',
      version: commandReleaseVersion,
    } as const
    const encoded = encodeCommandRelease(release)

    expect(decodeCommandRelease(encoded)).toEqual(release)
    expect(() => decodeCommandRelease(encoded.slice(0, -1))).toThrow(/not canonical/)
    expect(() => encodeCommandRelease({ ...release, archive: { ...release.archive, url: 'https://cdn.example/archive.tar.gz' } })).toThrow(
      /delimited components/,
    )
    expect(() =>
      encodeCommandRelease({
        ...release,
        archive: {
          ...release.archive,
          url: `https://cdn.example/prefix1.2.3suffix-${archiveDigest}extra.tar.gz`,
        },
      }),
    ).toThrow(/delimited components/)
  })
})

describe('command archive', () => {
  test('produces stable canonical tar.gz bytes independent of input order and time', async () => {
    const { files } = fixture()
    const first = await encodeCommandArchive(files)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const second = await encodeCommandArchive(files.toReversed())

    expect(second).toEqual(first)
    expect(first.slice(0, 10)).toEqual(new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 255]))

    const tar = new Uint8Array(gunzipSync(first))
    const entries = await unpackTar(tar, { strict: true })
    expect(entries.map((entry) => entry.header.name)).toEqual(
      files.toSorted((left, right) => compareCommandArtifactPaths(left.path, right.path)).map((file) => `${commandArchiveRoot}/${file.path}`),
    )
    for (const entry of entries) {
      const path = entry.header.name.slice(`${commandArchiveRoot}/`.length)
      expect(entry.header).toMatchObject({
        gid: 0,
        gname: '',
        mode: path == commandArtifactEntryFile ? 0o755 : 0o644,
        mtime: new Date(0),
        type: 'file',
        uid: 0,
        uname: '',
      })
    }
    for (let offset = 0; offset < tar.byteLength - 1024;) {
      expect(tar[offset + 156]).toBe(0x30)
      const size = Number.parseInt(
        new TextDecoder()
          .decode(tar.subarray(offset + 124, offset + 136))
          .replaceAll('\0', '')
          .trim(),
        8,
      )
      offset += 512 + Math.ceil(size / 512) * 512
    }
  })

  test('decodes and extracts only after validating the complete archive', async () => {
    const { files, manifest } = fixture()
    const archive = await encodeCommandArchive(files)
    const decoded = await decodeCommandArchive(archive)

    expect(decoded.manifest).toEqual(manifest)
    expect(decoded.files.map((file) => [file.path, file.mode])).toEqual([
      ['LICENSE', 0o644],
      [commandArtifactManifestFile, 0o644],
      [commandArtifactEntryFile, 0o755],
    ])

    const written: string[] = []
    await expect(
      extractCommandArchive(archive, async (entry) => {
        written.push(entry.path)
      }),
    ).resolves.toEqual(manifest)
    expect(written).toEqual(decoded.files.map((file) => file.path))
  })

  test('rejects traversal, absolute paths, duplicates, and entries outside the archive root', async () => {
    const cases = [`${commandArchiveRoot}/../escape`, `${commandArchiveRoot}//escape`, `${commandArchiveRoot}/C:\\escape`, '/absolute', 'another-root/entry.js']
    for (const name of cases) {
      const archive = await archiveEntries([{ body: bytes('x'), header: header(name, 1) }])
      await expect(decodeCommandArchive(archive)).rejects.toThrow(/invalid file path|outside/)
    }

    const duplicateName = `${commandArchiveRoot}/entry.js`
    const duplicate = await archiveEntries([
      { body: bytes('a'), header: header(duplicateName, 1) },
      { body: bytes('b'), header: header(duplicateName, 1) },
    ])
    await expect(decodeCommandArchive(duplicate)).rejects.toThrow(/sorted uniquely/)
  })

  test('rejects links, devices, directories, and PAX metadata before extraction', async () => {
    for (const type of ['link', 'symlink', 'character-device', 'block-device', 'fifo', 'directory'] as const) {
      const archive = await archiveEntries([
        {
          header: header(`${commandArchiveRoot}/unsafe`, 0, {
            linkname: type == 'link' || type == 'symlink' ? 'target' : undefined,
            type,
          }),
        },
      ])
      await expect(decodeCommandArchive(archive)).rejects.toThrow(/non-file tar entry/)
    }

    const paxPath = `${commandArchiveRoot}/${'x'.repeat(101)}`
    const pax = await archiveEntries([{ body: bytes('x'), header: header(paxPath, 1) }])
    await expect(decodeCommandArchive(pax)).rejects.toThrow(/non-file tar entry/)
  })

  test('rejects non-canonical metadata and gzip framing', async () => {
    const wrongMode = await archiveEntries([
      {
        body: bytes('x'),
        header: header(`${commandArchiveRoot}/entry.js`, 1, { mode: 0o644 }),
      },
    ])
    await expect(decodeCommandArchive(wrongMode)).rejects.toThrow(/invalid type or metadata/)

    const { files } = fixture()
    const valid = await encodeCommandArchive(files)
    const trailing = new Uint8Array(valid.byteLength + 1)
    trailing.set(valid)
    await expect(decodeCommandArchive(trailing)).rejects.toThrow(/trailing data|cannot be decoded/)

    const changedHeader = new Uint8Array(valid)
    changedHeader[9] = 19
    await expect(decodeCommandArchive(changedHeader)).rejects.toThrow(/canonical gzip header/)

    const tar = new Uint8Array(gunzipSync(valid))
    const firstSize = Number.parseInt(new TextDecoder().decode(tar.subarray(124, 136)).replaceAll('\0', '').trim(), 8)
    tar[512 + firstSize] = 1
    await expect(decodeCommandArchive(canonicalGzip(tar))).rejects.toThrow(/tar stream is not canonically encoded/)
  })

  test('rejects a manifest file-set or digest mismatch', async () => {
    const { files, manifest } = fixture()
    const wrongManifest: CommandArtifactManifest = {
      ...manifest,
      files: manifest.files.map((file, index) => (index == 0 ? { digest: '0'.repeat(64), length: file.length, path: file.path } : file)),
    }
    const wrongDigestFiles = files.map((file) =>
      file.path == commandArtifactManifestFile ? { bytes: bytes(encodeCommandArtifactManifest(wrongManifest)), path: file.path } : file,
    )
    await expect(decodeCommandArchive(await archiveFiles(wrongDigestFiles))).rejects.toThrow(/digest does not match/)

    const missingFile = files.filter((file) => file.path != 'LICENSE')
    await expect(decodeCommandArchive(await archiveFiles(missingFile))).rejects.toThrow(/file set does not match/)
  })

  test('rejects paths that require tar extensions during encoding', async () => {
    const { files } = fixture()
    const longPath = `assets/${'x'.repeat(101)}`
    await expect(encodeCommandArchive([...files, { bytes: bytes('x'), path: longPath }])).rejects.toThrow(/represented by USTAR/)
    await expect(encodeCommandArchive([...files, { bytes: bytes('x'), path: 'assets/\ud800' }])).rejects.toThrow(/invalid file path/)
  })
})
