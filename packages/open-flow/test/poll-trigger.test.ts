import { describe, expect, it } from 'vitest'
import { maximumPollDedupeKeyBytes, pollPageClaimId, providerEventId } from '../src/trigger/common/poll.ts'

describe('Poll Trigger protocol', () => {
  it('preserves the deployed continuation claim identity', async () => {
    await expect(pollPageClaimId('binding-main', 4, 'root-occurrence', 1)).resolves.toBe(
      'sha256:541f1a4ce8ef5987ef89104f83e44e8d73ad414390b9b2ec02a578d3db537921',
    )
    await expect(pollPageClaimId('binding-main', 4, 'root-occurrence', 0)).rejects.toThrow('positive integer')
  })

  it('preserves the deployed Provider event identity and byte limit', async () => {
    await expect(providerEventId('binding-main', 'provider.on_event', 'event-main')).resolves.toBe(
      'sha256:aca3421dd9fd443ef4266a913b9bd877b351740371c9c330380539c278460c48',
    )
    await expect(providerEventId('binding-main', 'provider.on_event', '你'.repeat(maximumPollDedupeKeyBytes))).rejects.toThrow('1024 bytes')
  })
})
