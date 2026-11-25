# Gates do Balcão

`npm run gates` roda todas as verificações, mesmo quando uma falha, e termina com uma linha por
violação: `<ID> <arquivo> <detalhe>`. Para dependência sem uso, o arquivo é o `package.json` e o
detalhe traz o nome da dependência. Sai com código 1 se qualquer regra falhar.

O hook `.githooks/pre-commit` roda `npm run gates:hook` (G1, G2, G4 a G9, G11 e G12) e bloqueia o
commit quando falha. Testes (G3) e código morto (G10) ficam de fora do hook só pelo tempo: rode
`npm run gates` antes de abrir um PR.

## Regras

| ID | O que barra | Ferramenta |
|---|---|---|
| G1 | Erro de tipo em `api/` e em `web/` | `tsc --noEmit` de cada projeto |
| G2 | Erro ou aviso de lint em `api/` e `web/`, incluindo variável, import ou parâmetro sem uso e `any` explícito | ESLint 10 + typescript-eslint (`eslint.config.mjs`) |
| G3 | Teste unitário da API falhando (`api/src/**/*.test.ts`) | Vitest, com relatório JSON |
| G4 | `api/src/http/` importando `@prisma/client` ou `api/src/repositories/` | analisador próprio (`scripts/gates/static.mjs`) |
| G5 | `process.env` fora de `api/src/config/`; `import.meta.env` fora de `web/src/config/` | analisador próprio |
| G6 | `api/src/services/` importando `express`, `multer` ou `api/src/http/`, inclusive só de tipo | analisador próprio |
| G7 | `openai` importado fora de `api/src/integrations/` | analisador próprio |
| G8 | Qualquer arquivo de `web/` importando arquivos de `api/`, inclusive só de tipo | analisador próprio |
| G9 | Import circular em `api/src/` ou em `web/src/` | analisador próprio (componentes fortemente conexos) |
| G10 | Arquivo, export (inclusive de tipo) ou dependência sem uso em `api/` e `web/` | knip (`knip.json`) |
| G11 | Endereço fixo fora de `config/`: `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, `/tmp/` ou as portas 4000, 5173 e 5432 | analisador próprio |
| G12 | `new PrismaClient` em `api/src/` fora de `api/src/repositories/` | analisador próprio |

### Por que um analisador próprio para G4 a G9

As regras G6 e G8 contam também imports só de tipo. Em vez de depender de como cada ferramenta trata
esse caso, `scripts/gates/static.mjs` lê a árvore sintática do TypeScript e resolve cada caminho com o
`tsconfig` de `api/` ou `web/`. Ele conta: `import` e `import type`, `export ... from`,
`import x = require()`, `require()`, `import()` dinâmico, `import('x').Tipo` em posição de tipo e
`/// <reference>`. A G6 também barra o namespace global `Express` (ex.: `Express.Multer.File`), que
chega sem import pelas declarações do `@types/express`. A G5 reconhece `process.env`, `process['env']`,
`const { env } = process`, `import { env } from 'node:process'`, `globalThis.process.env`,
`import.meta.env`, `import.meta['env']` e apelidos (`const meta = import.meta`).

Nenhuma pasta de `api/src/` ou `web/src/` fica fora das verificações. As únicas exceções são as que
definem a regra: `api/src/config/` e `web/src/config/` na G5 e na G11, `api/src/integrations/` na G7
e `api/src/repositories/` na G12.

## Regras próprias

### G11: nenhum endereço fixo fora de `config/`

**Motivação.** O Balcão foi escrito como se fosse a única cópia: CORS preso a `localhost:5173`, URL
da API repetida em três arquivos do front, porta 4000 no `main.ts` e anexos em `/tmp/balcao/uploads`.
Com duas worktrees, cada endereço fixo virou conflito. Agora a porta, a origem do CORS, a URL da API e
a pasta de anexos vêm da configuração de cada cópia; a regra impede que um endereço fixo volte.

### G12: um único PrismaClient, criado nos repositórios

**Motivação.** O worker criava o próprio `PrismaClient`, lendo `DATABASE_URL` direto do ambiente, e
ignorava a configuração da API. Cada cliente abre o próprio pool de conexões, e um cliente criado fora
dos repositórios é o atalho para uma rota ou serviço falar com o banco. A instância única fica em
`api/src/repositories/prisma.ts`.

### Exemplos de violação

Ficam versionados em `scripts/gates/kit-extra/violacoes/G11-*` e `G12-*`, no formato do
`kit-gates/`. Para aplicar, com o `git status` limpo:

```bash
npm run gates:exemplos -- G11
npm run gates:exemplos -- G12
```

O script planta cada exemplo, roda os gates, confere a linha com o ID e o arquivo e desfaz tudo. Para
ver a falha à mão, copie um modelo sem o sufixo `.modelo` (ex.:
`scripts/gates/kit-extra/violacoes/G11-a-localhost-no-servico/arquivos/api/src/services/callback-url.ts.modelo`
para `api/src/services/callback-url.ts`), rode `npm run gates` e apague o arquivo.

O mesmo kit traz variações de G1 a G10 (outras formas de escrever cada erro), para que nenhuma regra
reconheça só o exemplo do kit oficial. Rode `npm run gates:exemplos` depois de mexer na configuração de
qualquer ferramenta de gate.
