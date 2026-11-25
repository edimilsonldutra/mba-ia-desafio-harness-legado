import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { AppError } from '../../domain/errors'
import type { CurrentUser, Role } from '../../domain/ticket'

// Usuário autenticado de cada requisição, sem pendurar campos no objeto do Express.
const users = new WeakMap<Request, CurrentUser>()

export function signToken(user: { id: string; role: string }) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: '8h' })
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Token ausente' })
  }
  let payload: string | jwt.JwtPayload
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'unauthorized', message: 'Token inválido' })
  }
  const claims: jwt.JwtPayload = typeof payload === 'string' ? {} : payload
  users.set(req, { id: String(claims.sub), role: claims.role as Role })
  next()
}

export function currentUser(req: Request): CurrentUser {
  const user = users.get(req)
  if (!user) throw new AppError(401, 'unauthorized', 'Token ausente')
  return user
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = users.get(req)
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: 'forbidden', message: 'Sem permissão' })
    }
    next()
  }
}
