import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserDesignerConfirmation } from '../../src/designer/browser/confirmation.ts'
import { BrowserDirtyResourceTracker } from '../../src/designer/browser/dirtyResourceTracker.ts'
import { BrowserDesignerNotification } from '../../src/designer/browser/notification.ts'
import { BrowserResourceNavigation } from '../../src/designer/browser/resourceNavigation.ts'
import { BrowserResourceService } from '../../src/designer/browser/resourceService.ts'

describe('BrowserResourceService', () => {
  it('keeps browser resource URIs unchanged', () => {
    const service = new BrowserResourceService()

    expect(service.resolveStaticResourceUri('https://example.test/image.png')).toBe('https://example.test/image.png')
  })
})

describe('browser Designer capabilities', () => {
  afterEach(() => vi.restoreAllMocks())

  it('tracks focused resources and delegates navigation', async () => {
    const calls: string[] = []
    const navigation = new BrowserResourceNavigation({
      focusedResource: '/workspace/main.oo.yaml',
      onOpen: async (path) => {
        calls.push(`open:${path}`)
        return !path.endsWith('.md')
      },
      onReplace: async (origin, next) => {
        calls.push(`replace:${origin}:${next}`)
      },
    })

    await navigation.open('/workspace/next.oo.yaml')
    expect(navigation.focusedResource$.value).toBe('/workspace/next.oo.yaml')

    await navigation.open('/workspace/readme.md')
    expect(navigation.focusedResource$.value).toBe('/workspace/next.oo.yaml')

    await navigation.replace('/workspace/next.oo.yaml', '/workspace/renamed.oo.yaml')
    expect(navigation.focusedResource$.value).toBe('/workspace/renamed.oo.yaml')
    expect(calls).toEqual(['open:/workspace/next.oo.yaml', 'open:/workspace/readme.md', 'replace:/workspace/next.oo.yaml:/workspace/renamed.oo.yaml'])
    navigation.dispose()
  })

  it('tracks dirty resources independently from navigation', () => {
    const dirtyResources = new BrowserDirtyResourceTracker(['/workspace/dirty.txt'])

    dirtyResources.mark('/workspace/flow.oo.yaml', true)
    dirtyResources.mark('/workspace/dirty.txt', false)
    dirtyResources.rename('/workspace/flow.oo.yaml', '/workspace/renamed.oo.yaml')

    expect([...dirtyResources.resources$.value]).toEqual(['/workspace/renamed.oo.yaml'])
    dirtyResources.dispose()
  })

  it('uses injected confirmation and notification actions', async () => {
    const calls: string[] = []
    const confirmation = new BrowserDesignerConfirmation({
      onConfirm: async (message) => {
        calls.push(`confirm:${message}`)
        return true
      },
    })
    const notification = new BrowserDesignerNotification((level, message) => calls.push(`${level}:${message}`))
    notification.onDidNotify(({ level, message }) => calls.push(`event:${level}:${message}`))

    expect(await confirmation.confirm('Continue?')).toBe(true)
    notification.success('Saved')
    notification.error('Failed')

    expect(calls).toEqual(['confirm:Continue?', 'event:success:Saved', 'success:Saved', 'event:error:Failed', 'error:Failed'])
    notification.dispose()
  })
})
