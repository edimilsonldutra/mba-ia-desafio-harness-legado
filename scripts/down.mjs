// Derruba tudo o que o npm run up desta cópia iniciou (API, worker, front e Postgres)
// e nada de outras cópias. Os dados do banco e os anexos ficam para a próxima subida.
import { compose, copyId, loadState, ownsProcess, project, saveState } from './lib/copia.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      // já tinha saído
    }
  }
}

async function stop(name, pid) {
  if (!ownsProcess(pid)) return false
  signalGroup(pid, 'SIGTERM')
  for (let i = 0; i < 20 && ownsProcess(pid); i++) await sleep(250)
  if (ownsProcess(pid)) signalGroup(pid, 'SIGKILL')
  console.log(`- ${name} encerrado (pid ${pid})`)
  return true
}

async function main() {
  console.log(`Derrubando o Balcão (cópia ${copyId})`)
  const state = loadState()
  for (const name of ['web', 'worker', 'api']) {
    const pid = state.processes?.[name]?.pid
    if (!(await stop(name, pid))) console.log(`- ${name} já estava parado`)
  }
  const down = compose(['down'])
  if (down.status !== 0) {
    console.error(down.stderr)
    process.exit(1)
  }
  console.log(`- Postgres encerrado (projeto ${project})`)
  const ports = Object.fromEntries(Object.entries(state.processes || {}).map(([k, v]) => [k, { port: v?.port }]))
  saveState({ ...state, processes: ports, database: undefined })
  console.log('Pronto. Os dados do banco e os anexos ficam guardados para a próxima subida.')
}

main().catch((err) => {
  console.error(`Falhou: ${err.message}`)
  process.exit(1)
})
