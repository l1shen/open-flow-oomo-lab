import type { ChangeOperation } from './change.ts'

export async function imports(source: string): Promise<readonly string[]> {
  try {
    const { parse } = await import('@babel/parser')
    const program = parse(source, { errorRecovery: true, sourceType: 'module' }).program
    const dependencies = new Set<string>()
    for (const statement of program.body) {
      if (statement.type != 'ImportDeclaration') continue
      const match = /^\.\/(.+)\.mjs$/.exec(statement.source.value)
      if (match?.[1] != null) dependencies.add(match[1])
    }
    return [...dependencies].toSorted()
  } catch {
    return []
  }
}

export function replaceSource(moduleId: string, source: string, moduleImports: readonly string[]): readonly ChangeOperation[] {
  return [{ imports: moduleImports, kind: 'module.source.replace', moduleId, source }]
}

export function rename(moduleId: string, name: string): readonly ChangeOperation[] {
  return [{ kind: 'module.rename', moduleId, name }]
}
