import { expect, it } from 'vitest'
import { parseRoute, routePath } from '../browser/route.ts'

it('maps Server paths without a Team segment', () => {
  expect(parseRoute('/')).toEqual({ view: 'design' })
  expect(parseRoute('/flows/main%2Fflow/runs')).toEqual({
    flowId: 'main/flow',
    view: 'runs',
  })
  expect(parseRoute('/teams/example')).toEqual({ view: 'design' })
  expect(parseRoute('/flows/%E0%A4%A/design')).toEqual({ view: 'design' })

  expect(routePath({ view: 'design' })).toBe('/')
  expect(routePath({ flowId: 'main/flow', view: 'publications' })).toBe('/flows/main%2Fflow/publications')
})
