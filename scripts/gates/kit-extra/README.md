# Kit extra dos gates

Mesmo formato e mesmo script do `kit-gates/` oficial, com duas finalidades:

- **Variações de G1 a G10**: outras formas de escrever cada erro (import só de tipo, `require`, `import()` em posição de tipo, `process['env']`, alias de `import.meta`, namespace global `Express`, ciclo de três arquivos, ciclo só de tipo, dependência de desenvolvimento sem uso). Protegem os gates contra uma regra que só reconhece o exemplo do kit oficial.
- **Exemplos das regras próprias**: `G11-*` e `G12-*` são os exemplos versionados de violação de cada regra própria (motivação em `docs/gates.md`).

```bash
npm run gates:exemplos            # tudo
npm run gates:exemplos -- G11     # só uma regra
```

Precisa do `git status` limpo, como o kit oficial.
