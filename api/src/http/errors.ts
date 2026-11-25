import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { AppError } from '../domain/errors'

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'not_found', message: 'Rota não encontrada' })
}

function field(err: unknown, name: string): unknown {
  return typeof err === 'object' && err !== null ? (err as Record<string, unknown>)[name] : undefined
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message })
  }
  if (field(err, 'name') === 'MulterError') {
    return res.status(422).json({ error: 'validation_error', message: field(err, 'message') })
  }
  if (field(err, 'type') === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_request', message: 'JSON inválido' })
  }
  console.log('erro inesperado', err)
  res.status(500).json({ error: 'internal_error', message: 'Erro interno' })
}
