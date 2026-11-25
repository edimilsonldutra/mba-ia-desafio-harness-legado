// Comando de gates: roda todas as verificações, sem parar na primeira falha, e termina
// com uma linha por violação no formato "<ID> <arquivo> [detalhe]".
//   npm run gates                       todas as regras
//   npm run gates -- --only G1,G2       só as regras pedidas
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runStatic } from './static.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ALL = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12']

const onlyArg = process.argv.find((a) => a.startsWith('--only'))
const onlyValue = onlyArg?.includes('=') ? onlyArg.split('=')[1] : process.argv[process.argv.indexOf('--only') + 1]
const only = onlyArg ? new Set(onlyValue.split(',').map((s) => s.trim().toUpperCase())) : null
const want = (id) => !only || only.has(id)

const bin = (dir, name) => path.join(root, dir, 'node_modules', '.bin', name)
const run = (cmd, args, cwd) =>
  spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0' } })

const violations = []
const add = (rule, file, detail = '') => violations.push({ rule, file, detail })
const relPath = (abs) => path.relative(root, abs).split(path.sep).join('/')

function ensureTool(dir, name, rule) {
  if (fs.existsSync(bin(dir, name))) return true
  add(rule, dir === '.' ? 'package.json' : `${dir}/package.json`, `ferramenta ${name} ausente: rode npm run up`)
  return false
}

const checks = []
const check = (id, title, fn) => checks.push({ id, title, fn })

// G1: tipos em api/ e web/, cada um com o próprio TypeScript e tsconfig.
check('G1', 'tipos (tsc --noEmit em api/ e web/)', () => {
  for (const dir of ['api', 'web']) {
    if (!ensureTool(dir, 'tsc', 'G1')) continue
    const r = run(bin(dir, 'tsc'), ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.json'], path.join(root, dir))
    const out = `${r.stdout}${r.stderr}`
    for (const line of out.split('\n')) {
      const m = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+)/)
      if (m) add('G1', `${dir}/${m[1].replace(/\\/g, '/')}`, m[2])
      else if (/error TS\d+/.test(line)) add('G1', `${dir}/tsconfig.json`, line.trim())
    }
    if (r.status !== 0 && !violations.some((v) => v.rule === 'G1' && v.file.startsWith(`${dir}/`))) {
      add('G1', `${dir}/tsconfig.json`, `tsc saiu com código ${r.status}`)
    }
  }
})

// G2: lint em api/ e web/; qualquer mensagem (erro ou aviso) reprova.
check('G2', 'lint (eslint em api/ e web/)', () => {
  if (!ensureTool('.', 'eslint', 'G2')) return
  const r = run(bin('.', 'eslint'), ['--format', 'json', '--no-warn-ignored', 'api', 'web'], root)
  let results
  try {
    results = JSON.parse(r.stdout)
  } catch {
    add('G2', 'eslint.config.mjs', `eslint não rodou: ${(r.stderr || r.stdout).trim().split('\n')[0]}`)
    return
  }
  for (const file of results) {
    for (const m of file.messages) add('G2', relPath(file.filePath), `${m.ruleId || 'erro de parse'} (linha ${m.line})`)
  }
})

// G3: testes unitários da API (api/src/**/*.test.ts).
check('G3', 'testes unitários da API (vitest)', () => {
  if (!ensureTool('api', 'vitest', 'G3')) return
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gates-')), 'vitest.json')
  const r = run(bin('api', 'vitest'), ['run', '--reporter=json', `--outputFile=${out}`], path.join(root, 'api'))
  let report = null
  try {
    report = JSON.parse(fs.readFileSync(out, 'utf8'))
  } catch {
    report = null
  }
  if (!report) {
    add('G3', 'api/vitest.config.mts', `vitest não gerou relatório (código ${r.status})`)
    return
  }
  for (const suite of report.testResults || []) {
    if (suite.status !== 'passed') {
      const failed = (suite.assertionResults || []).filter((a) => a.status === 'failed').map((a) => a.title)
      add('G3', relPath(suite.name), failed.length ? `falhou: ${failed.join('; ')}` : suite.message?.split('\n')[0] || 'falhou')
    }
  }
  if (r.status !== 0 && !violations.some((v) => v.rule === 'G3')) add('G3', 'api/src', `vitest saiu com código ${r.status}`)
})

// G4 a G9, G11 e G12: regras estruturais (scripts/gates/static.mjs).
check('G4-G9 G11 G12', 'camadas, env, imports, ciclos e regras próprias', () => {
  const ids = ['G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G11', 'G12'].filter(want)
  if (ids.length === 0) return
  for (const v of runStatic(root, new Set(ids))) add(v.rule, v.file, v.detail)
})

// G10: arquivo, export (inclusive de tipo) e dependência sem uso em api/ e web/.
const KNIP_KINDS = {
  files: 'arquivo sem uso',
  dependencies: 'dependência sem uso',
  devDependencies: 'dependência de desenvolvimento sem uso',
  optionalPeerDependencies: 'dependência opcional sem uso',
  exports: 'export sem uso',
  nsExports: 'export sem uso',
  types: 'tipo exportado sem uso',
  nsTypes: 'tipo exportado sem uso',
  enumMembers: 'membro de enum sem uso',
  duplicates: 'export duplicado',
}
check('G10', 'código e dependências sem uso (knip)', () => {
  if (!ensureTool('.', 'knip', 'G10')) return
  const r = run(bin('.', 'knip'), ['--reporter', 'json', '--no-progress', '--no-config-hints'], root)
  let report
  try {
    report = JSON.parse(r.stdout)
  } catch {
    add('G10', 'knip.json', `knip não rodou: ${(r.stderr || r.stdout).trim().split('\n')[0]}`)
    return
  }
  for (const issue of report.issues || []) {
    if (!/^(api|web)\//.test(issue.file)) continue
    for (const [kind, label] of Object.entries(KNIP_KINDS)) {
      const items = issue[kind]
      if (!items) continue
      const list = Array.isArray(items) ? items : Object.values(items).flat()
      for (const item of list) {
        if (kind === 'files') add('G10', issue.file, label)
        else add('G10', issue.file, `${item.name} (${label})`)
      }
    }
  }
})

const started = Date.now()
for (const c of checks) {
  const ids = c.id.split(/[\s-]+/)
  const relevant = c.id === 'G4-G9 G11 G12' ? ['G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G11', 'G12'] : ids
  if (!relevant.some(want)) continue
  const before = violations.length
  const t = Date.now()
  try {
    c.fn()
  } catch (err) {
    add(relevant[0], 'scripts/gates/run.mjs', `a verificação quebrou: ${err.message}`)
  }
  const found = violations.length - before
  const secs = ((Date.now() - t) / 1000).toFixed(1)
  console.log(`${found ? 'FALHOU' : 'ok    '}  ${c.id.padEnd(13)} ${c.title} (${secs}s)${found ? `: ${found} violação(ões)` : ''}`)
}

const seen = new Set()
const order = (rule) => ALL.indexOf(rule)
const lines = violations
  .sort((a, b) => order(a.rule) - order(b.rule) || a.file.localeCompare(b.file))
  .map((v) => `${v.rule} ${v.file}${v.detail ? ` ${v.detail}` : ''}`)
  .filter((line) => (seen.has(line) ? false : seen.add(line)))

const secs = ((Date.now() - started) / 1000).toFixed(1)
if (lines.length === 0) {
  console.log(`\nGates: tudo certo (${secs}s).`)
  process.exit(0)
}
console.log(`\nViolações (${lines.length}), em ${secs}s:`)
for (const line of lines) console.log(line)
process.exit(1)
