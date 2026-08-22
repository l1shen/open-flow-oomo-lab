import type { IconifyJSON, IconifyJSONPackageExports } from '@iconify/types'
import type { Plugin } from 'vite'

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const virtualModuleId = 'virtual:open-flow-twemoji'
const resolvedVirtualModuleId = `\0${virtualModuleId}`
const resolvePackage = createRequire(import.meta.url).resolve

function includesSkinTone(name: string): boolean {
  return name.includes('-skin-tone')
}

export function filterTwemoji(source: IconifyJSONPackageExports): IconifyJSONPackageExports {
  const icons = Object.fromEntries(Object.entries(source.icons.icons).filter(([name]) => !includesSkinTone(name)))
  const aliases = Object.fromEntries(
    Object.entries(source.icons.aliases ?? {}).filter(([name, alias]) => !includesSkinTone(name) && !includesSkinTone(alias.parent)),
  )
  const available = new Set([...Object.keys(icons), ...Object.keys(aliases)])
  const chars = Object.fromEntries(Object.entries(source.chars).filter(([, name]) => available.has(name)))
  const categories = Object.fromEntries(
    Object.entries(source.metadata.categories ?? {})
      .map(([category, names]) => [category, names.filter((name) => available.has(name))])
      .filter(([, names]) => names.length > 0),
  )

  return {
    chars,
    icons: { ...source.icons, icons, aliases },
    info: source.info,
    metadata: { ...source.metadata, categories },
  }
}

function readJson<T>(specifier: string): T {
  return JSON.parse(readFileSync(resolvePackage(specifier), 'utf8')) as T
}

function loadTwemoji(): IconifyJSONPackageExports {
  return {
    chars: readJson<IconifyJSONPackageExports['chars']>('@iconify-json/twemoji/chars.json'),
    icons: readJson<IconifyJSON>('@iconify-json/twemoji/icons.json'),
    info: readJson<IconifyJSONPackageExports['info']>('@iconify-json/twemoji/info.json'),
    metadata: readJson<IconifyJSONPackageExports['metadata']>('@iconify-json/twemoji/metadata.json'),
  }
}

export function twemojiCollectionPlugin(): Plugin {
  let moduleSource: string | undefined
  return {
    name: 'open-flow-twemoji',
    resolveId(id) {
      return id == virtualModuleId ? resolvedVirtualModuleId : undefined
    },
    load(id) {
      if (id != resolvedVirtualModuleId) return undefined
      moduleSource ??= `export default ${JSON.stringify(filterTwemoji(loadTwemoji()))}`
      return moduleSource
    },
  }
}
