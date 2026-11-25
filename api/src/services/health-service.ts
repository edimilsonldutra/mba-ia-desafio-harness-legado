import type { DatabaseHealth } from '../repositories/health-repository'

export class HealthService {
  constructor(private database: DatabaseHealth) {}

  checkDatabase() {
    return this.database.ping()
  }
}
