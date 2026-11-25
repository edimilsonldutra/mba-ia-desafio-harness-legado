# AGENTS.md — Balcão

Central de chamados: API Express + Prisma + Postgres em `api/`, worker de triagem em
`api/src/jobs/triage-worker.ts` (processo separado da API) e front React + Vite em `web/`.

## Comandos (na raiz da cópia; cada clone ou worktree é uma cópia isolada)

- `npm run up`: instala as dependências com `npm ci`, sobe o Postgres da cópia, aplica as migrations,
  carrega a seed e sobe API, worker e front em portas livres. Imprime os endereços, o banco e a pasta
  de anexos. Pode rodar de novo sem derrubar. Também ativa o hook `.githooks/pre-commit`.
- `npm run down`: derruba só o que a subida desta cópia iniciou.
- `npm run gates`: roda todas as regras e termina com uma linha `<ID> <arquivo>` por violação.
- `npm run gates -- --only G4,G6`: roda só as regras pedidas.
- `npm run gates:exemplos`: aplica o kit extra de violações (exige `git status` limpo).
- Caixa-preta (com a cópia no ar): `cd blackbox && npm ci && API_URL=<API informada pelo up> npm test`.
- Logs da cópia: `.balcao/logs/` (criada pelo `npm run up`).

## Contas da seed

| Papel | E-mail | Senha |
|---|---|---|
| admin | `admin@balcao.dev` | `Admin@123` |
| atendente | `agente@balcao.dev` | `Agente@123` |
| cliente | `cliente@balcao.dev` | `Cliente@123` |

## Regras de camada (os gates conferem)

- `api/src/http/`: rotas e middlewares. Não importa `@prisma/client` nem `api/src/repositories/` (G4).
- `api/src/services/`: regras de negócio. Não importa `express`, `multer` nem `api/src/http/`, nem só
  de tipo (G6). Erro de negócio é `AppError`, de `api/src/domain/errors.ts`.
- `api/src/repositories/`: único lugar com Prisma; `new PrismaClient` só em `prisma.ts` (G12).
- `api/src/integrations/`: único lugar que importa `openai` (G7). A IA roda em modo fake por padrão.
- `api/src/main.ts`: ponto de composição (monta repositórios e serviços e chama `createApp`).
- `process.env` só em `api/src/config/` e `import.meta.env` só em `web/src/config/` (G5); host, porta
  ou `/tmp` fixos só nessas pastas (G11).
- `web/` não importa nada de `api/` (G8). Sem import circular (G9), sem código morto (G10), sem `any` (G2).
- Nada de `eslint-disable`, `@ts-ignore`, `@ts-expect-error` ou `@ts-nocheck`: corrija o código.

## Regras de trabalho

- A API HTTP é contrato: rotas, corpos, status e códigos de erro não mudam. A caixa-preta prova isso.
- Testes unitários ficam ao lado do código: `api/src/**/*.test.ts`.
- Não apague `node_modules` à mão: o `npm run up` reinstala sozinho quando o lockfile muda.

## Onde está o detalhe

- `README.md`: como rodar, decisões e testes de integração.
- `docs/gates.md`: cada regra, a ferramenta, as regras próprias e os exemplos de violação.
- `docs/incidentes.md`: erros de agentes e o que mudou no harness por causa deles.
- `scripts/`: subida, derrubada e gates. `kit-gates/` (oficial) e `scripts/gates/kit-extra/` testam os gates.
