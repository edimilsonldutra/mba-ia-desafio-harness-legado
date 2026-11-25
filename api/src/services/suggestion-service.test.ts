import { describe, expect, it } from 'vitest'
import type { Ticket } from '../domain/ticket'
import { SuggestionService } from './suggestion-service'

const ticket: Ticket = {
  id: 't1',
  title: 'Erro no login',
  description: 'Não consigo entrar desde ontem',
  status: 'open',
  category: null,
  priority: null,
  triageStatus: 'pending',
  customerId: 'c1',
  assigneeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const echo = async (input: { customerName: string; title: string }) => `${input.customerName}: ${input.title}`

describe('SuggestionService', () => {
  it('não deixa cliente pedir sugestão', async () => {
    const service = new SuggestionService({ getById: async () => ticket }, { findById: async () => null }, echo)
    await expect(service.suggestReply({ id: 'c1', role: 'customer' }, 't1')).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    })
  })

  it('usa o nome do cliente e cai para "cliente" quando ele não existe', async () => {
    const found = new SuggestionService(
      { getById: async () => ticket },
      {
        findById: async () => ({
          id: 'c1',
          name: 'Maria',
          email: 'm@x.com',
          passwordHash: 'h',
          role: 'customer',
          createdAt: new Date(),
        }),
      },
      echo,
    )
    expect(await found.suggestReply({ id: 'a1', role: 'agent' }, 't1')).toBe('Maria: Erro no login')

    const missing = new SuggestionService({ getById: async () => ticket }, { findById: async () => null }, echo)
    expect(await missing.suggestReply({ id: 'a1', role: 'agent' }, 't1')).toBe('cliente: Erro no login')
  })
})
