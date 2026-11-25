import { PrismaClient } from '@prisma/client'
import { env } from '../config/env'

// Único PrismaClient da API e do worker (G12).
export const prisma = new PrismaClient({
  ...(env.DATABASE_URL ? { datasources: { db: { url: env.DATABASE_URL } } } : {}),
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})
