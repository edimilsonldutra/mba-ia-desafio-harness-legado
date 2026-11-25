import { AppError } from '../domain/errors'
import type { CurrentUser } from '../domain/ticket'
import type { UserRepository } from '../repositories/user-repository'
import type { TicketService } from './ticket-service'

type SuggestReply = (input: { customerName: string; title: string; description: string }) => Promise<string>

export class SuggestionService {
  constructor(
    private tickets: Pick<TicketService, 'getById'>,
    private users: Pick<UserRepository, 'findById'>,
    private suggest: SuggestReply,
  ) {}

  async suggestReply(user: CurrentUser, ticketId: string) {
    if (user.role === 'customer') {
      throw new AppError(403, 'forbidden', 'Só atendentes e admins podem pedir sugestão')
    }
    const ticket = await this.tickets.getById(user, ticketId)
    const customer = await this.users.findById(ticket.customerId)
    const customerName = customer ? customer.name : 'cliente'
    return this.suggest({ customerName, title: ticket.title, description: ticket.description })
  }
}
