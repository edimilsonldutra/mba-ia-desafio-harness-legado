// Identidade, estado e processos de uma cópia do Balcão (um clone ou uma worktree).
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'))
export const copyId = crypto.createHash('sha1').update(root).digest('hex').slice(0, 8)
const slug = path
  .basename(root)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
export const project = `balcao-${slug || 'copia'}-${copyId}`

export const stateDir = path.join(root, '.balcao')
export const logsDir = path.join(stateDir, 'logs')
export const uploadsDir = path.join(stateDir, 'uploads')
const stateFile = path.join(stateDir, 'state.json')

export function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } catch {
    return { processes: {} }
  }
}

export function saveState(state) {
  fs.mkdirSync(stateDir, { recursive: true })
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`)
}

export function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options })
}

export function compose(args, options = {}) {
  return run('docker', ['compose', '-p', project, '-f', path.join(root, 'docker-compose.yml'), ...args], {
    cwd: root,
    ...options,
  })
}

// Um processo registrado só conta como desta cópia se estiver vivo e a linha de comando
// citar a pasta da cópia (o pid pode ter sido reaproveitado depois de um reboot).
export function ownsProcess(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  const ps = run('ps', ['-o', 'command=', '-p', String(pid)])
  return ps.status === 0 && ps.stdout.includes(root)
}

function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', (err) => resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT'))
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)))
  })
}

export async function isPortFree(port) {
  for (const host of ['127.0.0.1', '0.0.0.0', '::1', '::']) {
    if (!(await canListen(port, host))) return false
  }
  return true
}

export async function freePort(preferred, taken = new Set()) {
  for (let port = preferred; port < preferred + 200; port++) {
    if (!taken.has(port) && (await isPortFree(port))) return port
  }
  throw new Error(`nenhuma porta livre entre ${preferred} e ${preferred + 199}`)
}
