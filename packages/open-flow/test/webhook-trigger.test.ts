import { describe, expect, it } from 'vitest'
import { maximumWebhookBodyBytes, webhookEndpointId, webhookOccurrenceId } from '../src/trigger/common/webhook.ts'

describe('Webhook Trigger protocol', () => {
  it('parses only canonical endpoint paths', () => {
    expect(webhookEndpointId(new URL('https://flow.example/v1/webhooks/endpoint_0123456789abcdef0123456789abcdef'))).toBe(
      'endpoint_0123456789abcdef0123456789abcdef',
    )
    expect(webhookEndpointId(new URL('https://flow.example/v1/webhooks/endpoint_0123456789ABCDEF0123456789ABCDEF'))).toBeUndefined()
    expect(webhookEndpointId(new URL('https://flow.example/v1/webhooks/endpoint_0123456789abcdef0123456789abcdef/'))).toBeUndefined()
  })

  it('preserves the deployed keyed occurrence identity', async () => {
    await expect(webhookOccurrenceId('endpoint_0123456789abcdef0123456789abcdef', 7, 'delivery-1')).resolves.toBe(
      'a398c8e440d2dd9b3ab39ea685982b85797e61f9e476e92ab77f274a7c4d9b71',
    )
  })

  it('rejects invalid keys and creates opaque unkeyed identities', async () => {
    await expect(webhookOccurrenceId('endpoint_0123456789abcdef0123456789abcdef', 1, '   ')).resolves.toBeUndefined()
    await expect(webhookOccurrenceId('endpoint_0123456789abcdef0123456789abcdef', 1, 'x'.repeat(257))).resolves.toBeUndefined()
    await expect(webhookOccurrenceId('endpoint_0123456789abcdef0123456789abcdef', 1, null)).resolves.toMatch(/^webhook_[0-9a-f]{32}$/)
    expect(maximumWebhookBodyBytes).toBe(64 * 1024)
  })
})
