// Sobe esta cópia do Balcão: dependências, Postgres próprio, migrations, seed, API,
// worker de triagem e front, cada um numa porta livre. Pode rodar de novo sem derrubar:
// o que já está no ar continua no ar.
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  compose,
  copyId,
  freePort,
  loadState,
  logsDir,
  ownsProcess,
  project,
  root,
  run,
  saveState,
  uploadsDir,
} from './lib/copia.mjs'

const API_DIR = path.join(root, 'api')
const WEB_DIR = path.join(root, 'web')
const bin = (dir, name) => path.join(dir, 'node_modules', '.bin', name)

function step(text) {
  console.log(`- ${text}`)
}

function fail(text, logFile) {
  console.error(`\nFalhou: ${text}`)
  if (logFile && fs.existsSync(logFile)) {
    console.error(`Últimas linhas de ${path.relative(root, logFile)}:`)
    console.error(fs.readFileSync(logFile, 'utf8').split('\n').slice(-25).join('\n'))
  }
  process.exit(1)
}

function checkPrerequisites() {
  const major = Number(process.versions.node.split('.')[0])
  if (major < 22) fail(`Node.js 22 ou superior é necessário (atual: ${process.versions.node})`)
  const docker = run('docker', ['compose', 'version'])
  if (docker.status !== 0) fail('Docker com "docker compose" é necessário e precisa estar rodando')
}

// npm ci só quando o lockfile mudou desde a última instalação (ou nunca instalou).
function installDependencies() {
  for (const dir of [root, API_DIR, WEB_DIR]) {
    const lock = path.join(dir, 'package-lock.json')
    const marker = path.join(dir, 'node_modules', '.balcao-lock')
    const hash = crypto.createHash('sha1').update(fs.readFileSync(lock)).digest('hex')
    const current = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : ''
    const name = path.relative(root, dir) || 'raiz'
    if (current === hash) continue
    step(`instalando dependências (${name})`)
    const log = path.join(logsDir, `npm-${name}.log`)
    const r = run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir })
    fs.writeFileSync(log, `${r.stdout}${r.stderr}`)
    if (r.status !== 0) fail(`npm ci em ${name}`, log)
    fs.writeFileSync(marker, hash)
  }
}

function enableHooks() {
  const inside = run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root })
  if (inside.status !== 0) return
  const r = run('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root })
  if (r.status !== 0) fail(`não foi possível ativar o hook do Git: ${r.stderr.trim()}`)
}

function startDatabase() {
  step(`subindo o Postgres (projeto ${project})`)
  const log = path.join(logsDir, 'db.log')
  const up = compose(['up', '-d', '--wait', 'db'])
  fs.writeFileSync(log, `${up.stdout}${up.stderr}`)
  if (up.status !== 0) fail('docker compose up do Postgres', log)
  const port = compose(['port', 'db', '5432']).stdout.trim().split(':').pop()
  if (!/^\d+$/.test(port)) fail('não foi possível descobrir a porta do Postgres', log)
  const container = compose(['ps', '--format', '{{.Name}}', 'db']).stdout.trim()
  return { port: Number(port), container }
}

function readEnvFile(file) {
  const values = {}
  if (!fs.existsSync(file)) return values
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/)
    if (m) values[m[1]] = m[2]
  }
  return values
}

// api/.env: parte do .env.example, preserva o que a pessoa mudou e sobrescreve só o que é da cópia.
function writeApiEnv(managed) {
  const file = path.join(API_DIR, '.env')
  const values = { ...readEnvFile(path.join(API_DIR, '.env.example')), ...readEnvFile(file), ...managed }
  const body = Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  fs.writeFileSync(file, `# Gerado pelo npm run up (cópia ${copyId}). PORT, DATABASE_URL*, UPLOAD_DIR e WEB_ORIGIN são da cópia.\n${body}\n`)
}

function startProcess(name, cmd, args, cwd, env = {}) {
  const log = path.join(logsDir, `${name}.log`)
  const out = fs.openSync(log, 'a')
  fs.writeSync(out, `\n=== ${new Date().toISOString()} ${name} ===\n`)
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', out, out] })
  child.unref()
  return child.pid
}

async function waitFor(description, check, logFile, seconds = 90) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 500))
  }
  fail(`${description} não respondeu em ${seconds}s`, logFile)
}

async function httpOk(url) {
  try {
    const res = await fetch(url)
    return res.ok
  } catch {
    return false
  }
}

async function main() {
  console.log(`Subindo o Balcão (cópia ${copyId}, pasta ${root})`)
  fs.mkdirSync(logsDir, { recursive: true })
  fs.mkdirSync(uploadsDir, { recursive: true })
  checkPrerequisites()
  installDependencies()
  enableHooks()

  const db = startDatabase()
  const databaseUrl = `postgresql://balcao:balcao@127.0.0.1:${db.port}/balcao`

  const state = loadState()
  const procs = state.processes || {}
  const running = {
    api: ownsProcess(procs.api?.pid) && (await httpOk(`http://localhost:${procs.api.port}/api/health`)),
    worker: ownsProcess(procs.worker?.pid),
    web: ownsProcess(procs.web?.pid) && (await httpOk(`http://localhost:${procs.web.port}/`)),
  }

  // Portas: as da subida anterior quando ainda estão no ar ou livres; se não, a próxima livre.
  const taken = new Set([db.port])
  const apiPort = running.api ? procs.api.port : await freePort(procs.api?.port || 4000, taken)
  taken.add(apiPort)
  const webPort = running.web ? procs.web.port : await freePort(procs.web?.port || 5173, taken)

  const apiUrl = `http://localhost:${apiPort}`
  const webUrl = `http://localhost:${webPort}`

  writeApiEnv({
    DATABASE_URL: databaseUrl,
    DATABASE_URL_TEST: `postgresql://balcao:balcao@127.0.0.1:${db.port}/balcao_test`,
    PORT: String(apiPort),
    UPLOAD_DIR: uploadsDir,
    WEB_ORIGIN: webUrl,
  })

  step('aplicando as migrations')
  const migrateLog = path.join(logsDir, 'migrate.log')
  const migrate = run(bin(API_DIR, 'prisma'), ['migrate', 'deploy'], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
  fs.writeFileSync(migrateLog, `${migrate.stdout}${migrate.stderr}`)
  if (migrate.status !== 0) fail('prisma migrate deploy', migrateLog)

  step('carregando a seed')
  const seedLog = path.join(logsDir, 'seed.log')
  const seed = run(bin(API_DIR, 'tsx'), ['--env-file=.env', 'prisma/seed.ts'], { cwd: API_DIR })
  fs.writeFileSync(seedLog, `${seed.stdout}${seed.stderr}`)
  if (seed.status !== 0) fail('seed', seedLog)

  const next = { api: procs.api, worker: procs.worker, web: procs.web }
  if (running.api) step(`API já estava no ar (pid ${procs.api.pid})`)
  else {
    step('iniciando a API')
    next.api = { pid: startProcess('api', bin(API_DIR, 'tsx'), ['watch', '--env-file=.env', 'src/main.ts'], API_DIR), port: apiPort }
  }
  if (running.worker) step(`worker já estava no ar (pid ${procs.worker.pid})`)
  else {
    step('iniciando o worker de triagem')
    next.worker = {
      pid: startProcess('worker', bin(API_DIR, 'tsx'), ['watch', '--env-file=.env', 'src/jobs/triage-worker.ts'], API_DIR),
    }
  }
  if (running.web) step(`front já estava no ar (pid ${procs.web.pid})`)
  else {
    step('iniciando o front')
    next.web = {
      pid: startProcess('web', bin(WEB_DIR, 'vite'), ['--port', String(webPort), '--strictPort', '--host', 'localhost'], WEB_DIR, {
        VITE_API_URL: apiUrl,
      }),
      port: webPort,
    }
  }
  saveState({ copyId, project, root, processes: next, database: { port: db.port, container: db.container } })

  await waitFor('a API', () => httpOk(`${apiUrl}/api/health`), path.join(logsDir, 'api.log'))
  await waitFor('o worker', () => ownsProcess(next.worker.pid) && fs.readFileSync(path.join(logsDir, 'worker.log'), 'utf8').includes('worker de triagem rodando'), path.join(logsDir, 'worker.log'))
  await waitFor('o front', () => httpOk(webUrl), path.join(logsDir, 'web.log'))

  console.log(`
Balcão no ar (cópia ${copyId})
  API:     ${apiUrl}   (saúde: ${apiUrl}/api/health)
  Front:   ${webUrl}
  Worker:  rodando (pid ${next.worker.pid}), IA em modo ${readEnvFile(path.join(API_DIR, '.env')).AI_MODE || 'fake'}
  Banco:   ${databaseUrl}   (container ${db.container})
  Anexos:  ${uploadsDir}
  Logs:    ${logsDir}
Para derrubar esta cópia: npm run down`)
}

main().catch((err) => fail(err.message))
