import cors from 'cors'
import express from 'express'
import { env } from '../config/env'
import { AttachmentService } from '../services/attachment-service'
import { AuthService } from '../services/auth-service'
import { HealthService } from '../services/health-service'
import { StatsService } from '../services/stats-service'
import { SuggestionService } from '../services/suggestion-service'
import { TicketService } from '../services/ticket-service'
import { errorHandler, notFoundHandler } from './errors'
import { attachmentRoutes } from './routes/attachments'
import { authRoutes } from './routes/auth'
import { healthRoutes } from './routes/health'
import { statsRoutes } from './routes/stats'
import { ticketRoutes } from './routes/tickets'

// Os serviços chegam prontos do ponto de composição (src/main.ts): a camada HTTP
// não conhece repositórios nem o Prisma (G4).
export type AppServices = {
  authService: AuthService
  ticketService: TicketService
  attachmentService: AttachmentService
  suggestionService: SuggestionService
  healthService: HealthService
  statsService: StatsService
}

export function createApp(services: AppServices) {
  const app = express()

  app.use(cors({ origin: env.WEB_ORIGIN }))
  app.use(express.json())

  app.use('/api/health', healthRoutes(services.healthService))
  app.use('/api/auth', authRoutes(services.authService))
  app.use('/api/tickets', ticketRoutes(services))
  app.use('/api/attachments', attachmentRoutes(services.attachmentService))
  app.use('/api/stats', statsRoutes(services.statsService))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
