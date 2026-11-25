// Ponto de composição da API: monta repositórios, integrações e serviços e entrega à camada HTTP.
import { env } from './config/env'
import { createApp } from './http/app'
import { suggestReply } from './integrations/ai-client'
import { attachmentRepository } from './repositories/attachment-repository'
import { databaseHealth } from './repositories/health-repository'
import { replyRepository } from './repositories/reply-repository'
import { statsRepository } from './repositories/stats-repository'
import { ticketRepository } from './repositories/ticket-repository'
import { userRepository } from './repositories/user-repository'
import { AttachmentService } from './services/attachment-service'
import { AuthService } from './services/auth-service'
import { HealthService } from './services/health-service'
import { StatsService } from './services/stats-service'
import { SuggestionService } from './services/suggestion-service'
import { TicketService } from './services/ticket-service'

const ticketService = new TicketService(ticketRepository, replyRepository)

const app = createApp({
  authService: new AuthService(userRepository),
  ticketService,
  attachmentService: new AttachmentService(attachmentRepository, ticketService),
  suggestionService: new SuggestionService(ticketService, userRepository, suggestReply),
  healthService: new HealthService(databaseHealth),
  statsService: new StatsService(statsRepository),
})

app.listen(env.PORT, () => {
  console.log(`API rodando na porta ${env.PORT}`)
})
