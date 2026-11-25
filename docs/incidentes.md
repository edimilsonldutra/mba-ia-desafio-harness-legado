# Registro de incidentes

Erros reais dos agentes que trabalharam no harness do Balcão (Claude Code, modelo Claude Opus 5.5) e a
mudança no harness que impede a repetição. O hash aponta para o commit dessa mudança.

## 1. `npm uninstall` reescreveu o lockfile inteiro

**O que aconteceu.** Para tirar o `lodash`, sem uso (G10), o agente rodou `npm uninstall lodash` em
`api/`. O npm 11 removeu o pacote, mas também acrescentou `"peer": true` em dezenas de entradas sem
relação com a mudança: 51 linhas alteradas no `package-lock.json` para remover uma dependência. O
agente percebeu no `git diff`, desfez e removeu só as 7 linhas do `lodash`.

**Mudança no harness.** O `AGENTS.md` passou a mandar revisar o diff do lockfile ao adicionar ou
remover pacote e manter só as entradas do pacote. A subida (`npm run up`) só usa `npm ci`, que não
reescreve o lockfile.

**Commit:** `10d59c7`

## 2. Tentativa de apagar `node_modules` à mão

**O que aconteceu.** Ao remover o `axios` do front, o agente montou um script que fazia
`rm -rf node_modules` antes de reinstalar. A verificação de segurança da ferramenta barrou o comando:
um `rm -rf` dentro de script, que ela não consegue conferir, pode apagar mais do que o pretendido. Além
de arriscado, era desnecessário, porque o `npm ci` já recria a pasta.

**Mudança no harness.** O `npm run up` reinstala sozinho cada pasta (`raiz`, `api/`, `web/`) quando o
lockfile muda: guarda o hash do lockfile em `node_modules/.balcao-lock` e roda `npm ci` quando ele não
bate. O `AGENTS.md` diz para não apagar `node_modules` à mão.

**Commit:** `89a15a6`

## 3. Gate da G5 com lacuna: apelido de `import.meta`

**O que aconteceu.** A primeira versão do analisador da G5, escrita pelo agente, reconhecia
`import.meta.env` e `import.meta['env']`, mas não um apelido: `const meta = import.meta` seguido de
`meta.env.BASE_URL` passava pelos gates. O agente achou a lacuna ao escrever as variações do kit extra.
Plantando esse arquivo, a versão do commit `1a18daf` não acusa nada, e a atual acusa `G5`.

**Mudança no harness.** O analisador passou a coletar apelidos de `process` e de `import.meta` antes de
procurar o acesso a `env`, e a variação `G05-u-meta-alias` entrou no kit extra
(`scripts/gates/kit-extra/`) para que a lacuna não volte.

**Commit:** `2650f43`

## 4. `npm ci` "deu certo" sem os scripts do Prisma

**O que aconteceu.** Na primeira instalação da API, o `npm ci` terminou com código 0, e o agente quase
seguiu adiante. Só um aviso no fim mostrava que o npm 11, que bloqueia scripts de instalação por padrão,
tinha pulado os do `prisma`, `@prisma/client`, `@prisma/engines` e `esbuild`. Sem eles, faltariam as
engines do Prisma.

**Mudança no harness.** As quatro aprovações ficaram registradas no campo `allowScripts` do
`api/package.json`, para que qualquer `npm ci` (do `npm run up`, do avaliador ou de um agente) instale
o Prisma completo. Versões do npm que não conhecem o campo simplesmente o ignoram.

**Commit:** `1a18daf`
