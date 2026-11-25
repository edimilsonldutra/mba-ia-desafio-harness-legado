import { prisma } from './prisma'

type ReplyRecord = {
  id: string
  ticketId: string
  authorId: string
  body: string
  createdAt: Date
  author?: { id: string; name: string; role: string }
}

export interface ReplyRepository {
  create(data: { ticketId: string; authorId: string; body: string }): Promise<ReplyRecord>
}

class PrismaReplyRepository implements ReplyRepository {
  create(data: { ticketId: string; authorId: string; body: string }) {
    return prisma.reply.create({
      data,
      include: { author: { select: { id: true, name: true, role: true } } },
    })
  }
}

export const replyRepository = new PrismaReplyRepository()
