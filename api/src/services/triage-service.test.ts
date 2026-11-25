import { describe, expect, it, vi } from 'vitest'
import type { Ticket } from '../domain/ticket'
import { TriageService } from './triage-service'

function pending(id: string, title: string): Ticket {
  return {
    id,
    title,
    description: 'Descrição do chamado',
    status: 'open',
    category: null,
    priority: null,
    triageStatus: 'pending',
    customerId: 'c1',
    assigneeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('TriageService', () => {
  it('grava a classificação e marca falha quando a IA erra', async () => {
    const update = vi.fn(async (id: string) => pending(id, 'x'))
    const service = new TriageService(
      { findPendingTriage: async () => [pending('t1', 'Fatura'), pending('t2', '[falha-ia]')], update },
      async (ticket) => {
        if (ticket.title.includes('[falha-ia]')) throw new Error('classificacao falhou')
        return { category: 'billing', priority: 'high' }
      },
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await service.runOnce()

    expect(update).toHaveBeenCalledWith('t1', { category: 'billing', priority: 'high', triageStatus: 'done' })
    expect(update).toHaveBeenCalledWith('t2', { triageStatus: 'failed' })
  })
})
