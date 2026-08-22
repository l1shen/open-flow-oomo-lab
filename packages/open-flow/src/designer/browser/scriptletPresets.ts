/// <reference types="vite/client" />

import type { InlineTaskBlock, JavascriptExecutor } from '../../schema/index.ts'

import javascriptTemplate from './scriptletTemplates/javascript.txt?raw'
import typescriptTemplate from './scriptletTemplates/typescript.txt?raw'

export type ScriptletLanguage = 'javascript' | 'typescript'

export const DEFAULT_SCRIPTLET_CONTENT_WIDTH = 450

export interface ScriptletPreset {
  readonly id: ScriptletLanguage
  readonly title: string
  readonly icon: string
  readonly task: InlineTaskBlock & { readonly executor: JavascriptExecutor }
}

export const scriptletExtensions: Readonly<Record<ScriptletLanguage, string>> = {
  javascript: '.js',
  typescript: '.ts',
}

export const scriptletLanguageByExtension: ReadonlyMap<string, string> = new Map([
  ['.js', 'javascript'],
  ['.ts', 'typescript'],
  ['.txt', 'plaintext'],
])

export const scriptletTemplates: Readonly<Record<ScriptletLanguage, string>> = {
  javascript: javascriptTemplate,
  typescript: typescriptTemplate,
}

export const scriptletIndentation: Readonly<Record<ScriptletLanguage, string>> = {
  javascript: '  ',
  typescript: '  ',
}

function countPrefixes(value: string, prefix: string): number {
  let index = 0
  let count = 0
  while (value.startsWith(prefix, index)) {
    index += prefix.length
    count++
  }
  return count
}

export function applyIndentation(content: string, oldIndent: string, indent: string): string {
  if (oldIndent == indent) {
    return content
  }

  const lines = content.split('\n')
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line) {
      const count = countPrefixes(line, oldIndent)
      lines[index] = indent.repeat(count) + line.slice(oldIndent.length * count)
    }
  }
  return lines.join('\n')
}

function createScriptletTask(): InlineTaskBlock & { readonly executor: JavascriptExecutor } {
  return {
    inputs_def: [],
    outputs_def: [],
    executor: {
      name: 'javascript',
      options: { entry: '' },
    },
  }
}

const typescriptScriptlet: ScriptletPreset = {
  id: 'typescript',
  title: 'TypeScript',
  icon: ':carbon:script:',
  task: createScriptletTask(),
}

const javascriptScriptlet: ScriptletPreset = {
  id: 'javascript',
  title: 'JavaScript',
  icon: ':carbon:code:',
  task: createScriptletTask(),
}

export const scriptletPresets: ReadonlyMap<string, ScriptletPreset> = new Map([
  [typescriptScriptlet.id, typescriptScriptlet],
  [javascriptScriptlet.id, javascriptScriptlet],
])
