import { describe, expect, it } from 'vitest'
import {
  integrationCallbackSecret,
  integrationEndpointId,
  integrationOccurrenceId,
  maximumIntegrationBodyBytes,
  maximumIntegrationDeliveryPages,
} from '../src/trigger/common/integration.ts'

describe('Integration Trigger protocol', () => {
  it('parses only canonical endpoint paths', () => {
    expect(integrationEndpointId(new URL('https://flow.example/v1/integrations/endpoint_0123456789abcdef0123456789abcdef'))).toBe(
      'endpoint_0123456789abcdef0123456789abcdef',
    )
    expect(integrationEndpointId(new URL('https://flow.example/v1/integrations/endpoint_0123456789ABCDEF0123456789ABCDEF'))).toBeUndefined()
    expect(integrationEndpointId(new URL('https://flow.example/v1/integrations/endpoint_0123456789abcdef0123456789abcdef/'))).toBeUndefined()
  })

  it('preserves callback authentication and keyed occurrence identities', async () => {
    const endpointId = 'endpoint_0123456789abcdef0123456789abcdef'
    await expect(integrationCallbackSecret('callback-key', endpointId)).resolves.toBe('iObVVHElEV1AVvtXU7C4aUEmfeMZuFQzyxJ4utazHrA')
    await expect(integrationOccurrenceId('binding-main', 7, 'github.on_repo_event', 'delivery-1')).resolves.toBe(
      'f899dc14599cf817e8bf1d42b124440a1db6cb139e720b3104033818d6d3d021',
    )
    await expect(integrationOccurrenceId('binding-main', 8, 'github.on_repo_event', 'delivery-1')).resolves.not.toBe(
      'f899dc14599cf817e8bf1d42b124440a1db6cb139e720b3104033818d6d3d021',
    )
  })

  it('rejects missing callback keys and creates opaque unkeyed identities', async () => {
    await expect(integrationCallbackSecret('', 'endpoint_0123456789abcdef0123456789abcdef')).rejects.toThrow('callback key is required')
    await expect(integrationOccurrenceId('binding-main', 1, 'github.on_repo_event', null)).resolves.toMatch(/^integration_[0-9a-f]{32}$/)
    expect(maximumIntegrationBodyBytes).toBe(64 * 1024)
    expect(maximumIntegrationDeliveryPages).toBe(5)
  })
})
