import type { Prisma } from '@prisma/client'
import { Ticket, TicketStatus } from '../domain/ticket'
import { prisma } from './prisma'

export type TicketFilter = {
  customerId?: string
  status?: TicketStatus
}

export type TicketUpdate = Partial<Pick<Ticket, 'status' | 'assigneeId' | 'category' | 'priority' | 'triageStatus'>>

const detailsInclude = {
  replies: {
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true, role: true } } },
  },
  attachments: { orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.TicketInclude

type TicketWithDetails = Prisma.TicketGetPayload<{ include: typeof detailsInclude }>

export interface TicketRepository {
  create(data: { title: string; description: string; customerId: string }): Promise<Ticket>
  findById(id: string): Promise<Ticket | null>
  findByIdWithDetails(id: string): Promise<TicketWithDetails | null>
  findPendingTriage(limit: number): Promise<Ticket[]>
  list(filter: TicketFilter, page: number, pageSize: number): Promise<{ items: Ticket[]; total: number }>
  update(id: string, data: TicketUpdate): Promise<Ticket>
}

class PrismaTicketRepository implements TicketRepository {
  create(data: { title: string; description: string; customerId: string }) {
    return prisma.ticket.create({ data })
  }

  findById(id: string) {
    return prisma.ticket.findUnique({ where: { id } })
  }

  findByIdWithDetails(id: string) {
    return prisma.ticket.findUnique({ where: { id }, include: detailsInclude })
  }

  findPendingTriage(limit: number) {
    return prisma.ticket.findMany({
      where: { triageStatus: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
  }

  async list(filter: TicketFilter, page: number, pageSize: number) {
    const where: Prisma.TicketWhereInput = {}
    if (filter.customerId) where.customerId = filter.customerId
    if (filter.status) where.status = filter.status
    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ticket.count({ where }),
    ])
    return { items, total }
  }

  update(id: string, data: TicketUpdate) {
    return prisma.ticket.update({ where: { id }, data })
  }
}

export const ticketRepository = new PrismaTicketRepository()
