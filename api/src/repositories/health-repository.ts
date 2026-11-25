import { prisma } from './prisma'

export interface DatabaseHealth {
  ping(): Promise<void>
}

export const databaseHealth: DatabaseHealth = {
  async ping() {
    await prisma.$queryRaw`SELECT 1`
  },
}
