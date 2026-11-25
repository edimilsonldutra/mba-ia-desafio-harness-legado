import { defineConfig } from 'vitest/config'

try {
  process.loadEnvFile('.env')
} catch {
  // sem api/.env: as variáveis vêm do ambiente
}

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST || '',
    },
  },
})
