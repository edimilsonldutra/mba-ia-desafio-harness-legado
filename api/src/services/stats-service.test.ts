import { describe, expect, it } from 'vitest'
import { StatsService } from './stats-service'

describe('StatsService', () => {
  it('preenche os zeros e agrupa os não triados', async () => {
    const service = new StatsService({
      countByStatus: async () => [{ key: 'open', count: 2 }],
      countByCategory: async () => [
        { key: 'billing', count: 1 },
        { key: null, count: 3 },
      ],
      countByPriority: async () => [{ key: null, count: 4 }],
    })
    expect(await service.summary()).toEqual({
      byStatus: { open: 2, in_progress: 0, resolved: 0 },
      byCategory: { billing: 1, technical: 0, account: 0, other: 0, untriaged: 3 },
      byPriority: { low: 0, medium: 0, high: 0, urgent: 0, untriaged: 4 },
    })
  })
})
