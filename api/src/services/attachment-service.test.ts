import { describe, expect, it } from 'vitest'
import { AppError } from '../domain/errors'
import type { CurrentUser, Ticket, UploadedFile } from '../domain/ticket'
import type { AttachmentRepository } from '../repositories/attachment-repository'
import { AttachmentService, type TicketLookup } from './attachment-service'

const ticket: Ticket = {
  id: 't1',
  title: 'Chamado',
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

const fakeTickets: TicketLookup = {
  getById: async (user, id) => {
    if (id !== ticket.id || (user.role === 'customer' && user.id !== ticket.customerId)) {
      throw new AppError(404, 'not_found', 'Chamado não encontrado')
    }
    return ticket
  },
}

const fakeAttachments: AttachmentRepository = {
  create: async (data) => ({ id: 'att1', createdAt: new Date(), ...data }),
  findById: async () => null,
}

const customer: CurrentUser = { id: 'c1', role: 'customer' }

function file(size: number, mimetype: string, originalname: string): UploadedFile {
  return { size, mimetype, originalname, buffer: Buffer.from('') }
}

describe('AttachmentService', () => {
  const service = new AttachmentService(fakeAttachments, fakeTickets)

  it('exige arquivo', async () => {
    await expect(service.upload(customer, 't1')).rejects.toMatchObject({ status: 422 })
  })

  it('recusa arquivo maior que 5 MB', async () => {
    await expect(service.upload(customer, 't1', file(5 * 1024 * 1024 + 1, 'text/plain', 'a.txt'))).rejects.toMatchObject({
      status: 413,
      code: 'file_too_large',
    })
  })

  it('recusa tipo não suportado', async () => {
    await expect(service.upload(customer, 't1', file(10, 'image/gif', 'a.gif'))).rejects.toMatchObject({
      status: 415,
      code: 'unsupported_type',
    })
  })

  it('não deixa outro cliente enviar', async () => {
    await expect(service.upload({ id: 'c2', role: 'customer' }, 't1')).rejects.toMatchObject({ status: 404 })
  })
})
