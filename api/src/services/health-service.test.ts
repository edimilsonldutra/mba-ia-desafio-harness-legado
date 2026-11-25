import { describe, expect, it } from 'vitest'
import { HealthService } from './health-service'

describe('HealthService', () => {
  it('repassa o resultado do ping do banco', async () => {
    await expect(new HealthService({ ping: async () => {} }).checkDatabase()).resolves.toBeUndefined()
    await expect(new HealthService({ ping: async () => Promise.reject(new Error('fora')) }).checkDatabase()).rejects.toThrow(
      'fora',
    )
  })
})
