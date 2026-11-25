import type { TicketCategory, TicketPriority } from '../domain/ticket'
import type { TicketRepository } from '../repositories/ticket-repository'

type Classify = (ticket: { title: string; description: string }) => Promise<{
  category: TicketCategory
  priority: TicketPriority
}>

const BATCH_SIZE = 10

export class TriageService {
  constructor(
    private tickets: Pick<TicketRepository, 'findPendingTriage' | 'update'>,
    private classify: Classify,
  ) {}

  async runOnce() {
    const tickets = await this.tickets.findPendingTriage(BATCH_SIZE)
    for (const ticket of tickets) {
      try {
        const result = await this.classify(ticket)
        await this.tickets.update(ticket.id, {
          category: result.category,
          priority: result.priority,
          triageStatus: 'done',
        })
        console.log(`chamado ${ticket.id} triado: ${result.category}/${result.priority}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.log(`falha na triagem do chamado ${ticket.id}: ${message}`)
        await this.tickets.update(ticket.id, { triageStatus: 'failed' })
      }
    }
  }
}
