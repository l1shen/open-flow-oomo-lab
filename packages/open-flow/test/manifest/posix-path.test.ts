import { describe, expect, it } from 'vitest'
import { basename, dirname, extname, isAbsolute, isParent, join } from '../../src/base/common/posixPath.ts'

describe('POSIX paths', () => {
  it('normalizes joined project paths without using the process working directory', () => {
    expect(join('/workspace', 'flows', '..', 'tasks', 'task.oo.yaml')).toBe('/workspace/tasks/task.oo.yaml')
    expect(join('scriptlets', 'task.ts')).toBe('scriptlets/task.ts')
    expect(join('//', 'workspace')).toBe('/workspace')
  })

  it('recognizes only POSIX absolute paths', () => {
    expect(isAbsolute('/workspace/task.oo.yaml')).toBe(true)
    expect(isAbsolute('C:/workspace/task.oo.yaml')).toBe(false)
    expect(isAbsolute('task.oo.yaml')).toBe(false)
  })

  it('uses segment boundaries for parent checks', () => {
    expect(isParent('/workspace/tasks/task.oo.yaml', '/workspace')).toBe(true)
    expect(isParent('/workspace-other/task.oo.yaml', '/workspace')).toBe(false)
    expect(isParent('/workspace', '/workspace')).toBe(false)
  })

  it('extracts descriptor path parts', () => {
    expect(dirname('/workspace/tasks/task.oo.yaml')).toBe('/workspace/tasks')
    expect(basename('/workspace/tasks/task.oo.yaml')).toBe('task.oo.yaml')
    expect(extname('/workspace/scriptlets/task.ts')).toBe('.ts')
  })
})
