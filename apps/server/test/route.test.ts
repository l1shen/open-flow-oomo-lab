import { expect, it } from 'vitest'
import { parseRoute, routePath } from '../browser/route.ts'

it('maps Server paths without a Team segment', () => {
  expect(parseRoute('/')).toEqual({ view: 'design' })
  expect(parseRoute('/projects/project%201')).toEqual({ projectId: 'project 1', view: 'design' })
  expect(parseRoute('/projects/project%201/flows/main%2Fflow/runs')).toEqual({
    flowId: 'main/flow',
    projectId: 'project 1',
    view: 'runs',
  })
  expect(parseRoute('/teams/example')).toEqual({ view: 'design' })
  expect(parseRoute('/projects/%E0%A4%A')).toEqual({ view: 'design' })

  expect(routePath({ view: 'design' })).toBe('/')
  expect(routePath({ projectId: 'project 1', view: 'design' })).toBe('/projects/project%201')
  expect(routePath({ flowId: 'main/flow', projectId: 'project 1', view: 'publications' })).toBe('/projects/project%201/flows/main%2Fflow/publications')
})
