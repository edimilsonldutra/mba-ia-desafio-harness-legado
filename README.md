# Balcão

Central de chamados. Clientes abrem chamados, uma IA faz a triagem (categoria e prioridade) em segundo
plano, atendentes assumem, respondem e resolvem, e o admin acompanha as estatísticas.

- `api/`: API em Express + Prisma + Postgres e o worker de triagem (processo separado).
- `web/`: front em React + Vite.
- `blackbox/`: testes caixa-preta da API, o contrato que não pode mudar.
- `scripts/`: subida, derrubada e gates. `kit-gates/` e `scripts/gates/kit-extra/` testam os gates.

O enunciado original está em [ENUNCIADO.md](ENUNCIADO.md). As instruções para agentes estão no
[AGENTS.md](AGENTS.md).

## Como rodar

**Pré-requisitos:** Linux ou macOS (no Windows, use o WSL), Git, Docker com `docker compose` e Node.js
22 ou superior. Nenhuma chave de IA: a triagem roda em modo fake por padrão.

Todos os comandos rodam na raiz de uma cópia do repositório (um clone ou uma worktree):

| Comando | O que faz |
|---|---|
| `npm run up` | Sobe tudo desta cópia, a partir de um clone limpo, sem outro passo |
| `npm run down` | Derruba só o que a subida desta cópia iniciou |
| `npm run gates` | Roda todas as regras e lista as violações |

A subida instala as dependências (`npm ci`, só quando o lockfile muda), sobe um Postgres próprio da
cópia, aplica as migrations, carrega a seed, ativa o hook do Git e sobe API, worker e front. Ao final
ela informa:

```
Balcão no ar (cópia 96a15258)
  API:     http://localhost:4000   (saúde: http://localhost:4000/api/health)
  Front:   http://localhost:5173
  Worker:  rodando (pid 22241), IA em modo fake
  Banco:   postgresql://balcao:balcao@127.0.0.1:49423/balcao   (container balcao-balcao-96a15258-db-1)
  Anexos:  /home/voce/balcao/.balcao/uploads
  Logs:    /home/voce/balcao/.balcao/logs
Para derrubar esta cópia: npm run down
```

Rodar a subida de novo, sem derrubar, não quebra nada: o que está no ar continua no ar, as migrations e
a seed rodam de novo sem duplicar nada.

### Duas cópias ao mesmo tempo

```bash
git worktree add ../copia-b
cd ../copia-b
npm run up
```

A segunda cópia sobe em outras portas (a próxima livre a partir de 4000 e 5173), com outro Postgres,
outra pasta de anexos e outro worker. Cada front conversa com a API da própria cópia.

### Testes

- Unitários da API: `npm run gates -- --only G3` (ou `cd api && npx vitest run`).
- Caixa-preta, com a cópia no ar: `cd blackbox && npm ci && API_URL=<API informada pela subida> npm test`.
- Integração (opcional, usam o banco `balcao_test` do Postgres da cópia). Com a cópia no ar, troque
  `<container>` pelo nome que a subida informou:

  ```bash
  docker exec <container> psql -U balcao -c "CREATE DATABASE balcao_test"
  cd api
  DATABASE_URL=$(grep '^DATABASE_URL_TEST=' .env | cut -d= -f2-) npx prisma migrate deploy
  npm run test:integration
  ```

## Contas da seed

| Papel | E-mail | Senha |
|---|---|---|
| admin | `admin@balcao.dev` | `Admin@123` |
| atendente | `agente@balcao.dev` | `Agente@123` |
| cliente | `cliente@balcao.dev` | `Cliente@123` |

## Gates

`npm run gates` roda todas as verificações sem parar na primeira falha e termina com uma linha por
violação (`G4 api/src/http/routes/stats.ts ...`). O detalhe de cada regra está em
[docs/gates.md](docs/gates.md).

| ID | Regra | Ferramenta |
|---|---|---|
| G1 | Zero erro de tipo em `api/` e `web/` | `tsc --noEmit` |
| G2 | Lint sem erro e sem aviso em `api/` e `web/` (variável e import sem uso, `any` explícito) | ESLint + typescript-eslint |
| G3 | Testes unitários da API passando | Vitest |
| G4 | `api/src/http/` não importa `@prisma/client` nem `api/src/repositories/` | analisador próprio (TypeScript) |
| G5 | `process.env` só em `api/src/config/`; `import.meta.env` só em `web/src/config/` | analisador próprio |
| G6 | `api/src/services/` não importa `express`, `multer` nem `api/src/http/`, nem só de tipo | analisador próprio |
| G7 | `openai` só em `api/src/integrations/` | analisador próprio |
| G8 | `web/` não importa arquivos de `api/`, nem só de tipo | analisador próprio |
| G9 | Nenhum import circular em `api/src/` e `web/src/` | analisador próprio |
| G10 | Nenhum arquivo, export (inclusive de tipo) ou dependência sem uso em `api/` e `web/` | knip |
| G11 | Nenhum endereço fixo (host local, porta das cópias, `/tmp/`) fora de `config/` | analisador próprio (regra própria) |
| G12 | `new PrismaClient` só em `api/src/repositories/` | analisador próprio (regra própria) |

O hook `.githooks/pre-commit`, ativado pelo `npm run up` (`git config core.hooksPath .githooks`), roda
`npm run gates:hook` (tipos, lint e as regras estruturais) e bloqueia o commit quando falha.

**Exemplos de violação das regras próprias.** Ficam em `scripts/gates/kit-extra/violacoes/G11-*` e
`G12-*`. Com o `git status` limpo, aplique com `npm run gates:exemplos -- G11` e
`npm run gates:exemplos -- G12`: o script planta cada exemplo, roda os gates, confere a falha e desfaz.
O mesmo kit traz 37 variações de G1 a G10 (`npm run gates:exemplos`).

## Decisões

**Isolamento das cópias.** Cada cópia é identificada pelo hash do caminho da pasta. A subida usa esse
hash para:
- **Postgres próprio:** sobe um projeto do Docker Compose com nome próprio (`balcao-<pasta>-<hash>`),
  em que a porta do host é escolhida pelo Docker (`127.0.0.1::5432`) e o volume é separado.
- **Portas da API e do front:** escolhe a próxima livre a partir de 4000 e 5173 e as guarda em
  `.balcao/state.json`, para repetir na próxima subida.
- **Anexos e logs:** ficam em `.balcao/uploads` e `.balcao/logs`, dentro da cópia.

A API recebe porta, banco, pasta de anexos e a origem do CORS pelo `api/.env` gerado na subida, e o
front recebe a URL da API por `VITE_API_URL`. API, worker e front rodam em grupos de processos próprios.
O `npm run down` encerra só os grupos registrados por aquela cópia, conferindo pela linha de comando que
o processo é dela, e derruba só o projeto Compose dela.

**Como as violações que já existiam foram corrigidas.** Os gates foram escritos primeiro e acenderam 91
violações no código recebido. Elas foram corrigidas sem mudar o comportamento, e a suíte caixa-preta
passa (51 de 51) antes e depois:
- **Rotas como fábricas:** as rotas recebem os serviços prontos de `api/src/main.ts`, o ponto de
  composição, e deixaram de importar repositórios e o Prisma.
- **Saúde e estatísticas:** ganharam serviço e repositório próprios.
- **Sugestão de resposta:** saiu da rota (que importava `openai`) para um serviço que usa
  `api/src/integrations/`.
- **Erro de negócio:** virou `AppError`, em `api/src/domain/`, e os serviços pararam de depender da
  camada HTTP e do tipo `Request` do Express.
- **Configuração:** toda leitura de ambiente foi para `api/src/config/env.ts` e `web/src/config/`.
- **Worker:** passou a usar o PrismaClient único dos repositórios.
- **Ciclo:** o ciclo entre `ticket-service` e `notification-service` foi desfeito.
- **Código morto:** `legacy-sla.ts`, `lodash`, `axios`, `formatCurrency` e os exports sem uso foram
  removidos.
- **Tipos e lint:** `any` virou tipo de verdade.
- **Front:** passou a ter os próprios tipos, em vez de importá-los de `api/`.
- **Seed:** ficou idempotente.

**Documentação para agentes.** O `CLAUDE.md` antigo mentia:
- **Pastas:** citava pastas que não existem (`controllers/`, `middlewares/`, `api/tests/`).
- **Comandos:** mandava rodar um comando que não existe (`npm run migrate`).
- **Más práticas:** mandava usar `any` "para não travar a entrega" e `kill -9` em porta ocupada.

Ele foi substituído por um ponteiro para o `AGENTS.md`, um índice de 52 linhas em que cada comando e
cada caminho existe. O detalhe saiu do índice e foi para `docs/` e para o próprio código: os gates
garantem as regras de camada que antes eram só texto.

## Registro de incidentes

Os erros dos agentes durante este trabalho, e o que mudou no harness por causa de cada um, estão em
[docs/incidentes.md](docs/incidentes.md).
