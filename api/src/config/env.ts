import { z } from 'zod'

// Único ponto da API que lê process.env (G5). Valor vazio conta como ausente.
const blankAsMissing = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === '' ? undefined : value), schema)

const schema = z.object({
  DATABASE_URL: blankAsMissing(z.string().optional()),
  NODE_ENV: blankAsMissing(z.enum(['development', 'test', 'production']).default('development')),
  PORT: blankAsMissing(z.coerce.number().int().positive().default(4000)),
  JWT_SECRET: blankAsMissing(z.string().default('dev-secret')),
  AI_MODE: blankAsMissing(z.string().default('fake')),
  OPENAI_API_KEY: z.string().optional(),
  UPLOAD_DIR: blankAsMissing(z.string().default('/tmp/balcao/uploads')),
  WEB_ORIGIN: blankAsMissing(z.string().default('http://localhost:5173')),
  TRIAGE_INTERVAL_MS: blankAsMissing(z.coerce.number().int().positive().default(2000)),
})

export const env = schema.parse(process.env)
