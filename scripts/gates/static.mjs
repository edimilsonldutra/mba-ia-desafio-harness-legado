// Regras estruturais (G4 a G9, G11 e G12), lidas da árvore sintática do TypeScript.
// Conta todo tipo de dependência: import (inclusive `import type`), export ... from,
// import x = require(), require(), import() dinâmico, import('x').Tipo em posição de tipo
// e referências /// <reference>. Cada função devolve [{ rule, file, detail }].
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const SOURCE = /\.(ts|tsx|mts|cts)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage'])

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

function compilerOptions(root, project) {
  const configPath = path.join(root, project, 'tsconfig.json')
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(read.config || {}, ts.sys, path.join(root, project))
  return parsed.options
}

function packageName(specifier) {
  const spec = specifier.replace(/^node:/, '')
  if (spec.startsWith('.') || spec.startsWith('/')) return null
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function literalText(node) {
  if (!node) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

// Todas as dependências de um arquivo, com o especificador e o tipo de uso.
function collectSpecifiers(sourceFile) {
  const specs = []
  const add = (text) => {
    if (text) specs.push(text)
  }
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(literalText(node.moduleSpecifier))
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(literalText(node.moduleReference.expression))
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require'
      const isRequireResolve =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'require'
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword
      if ((isRequire || isRequireResolve || isDynamicImport) && node.arguments.length > 0) {
        add(literalText(node.arguments[0]))
      }
    } else if (ts.isImportTypeNode(node)) {
      const arg = node.argument
      if (ts.isLiteralTypeNode(arg)) add(literalText(arg.literal))
    } else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  for (const ref of sourceFile.referencedFiles) add(ref.fileName.startsWith('.') ? ref.fileName : `./${ref.fileName}`)
  for (const ref of sourceFile.typeReferenceDirectives) add(ref.fileName)
  return specs
}

function parse(file) {
  const text = fs.readFileSync(file, 'utf8')
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
}

function resolve(specifier, file, options) {
  const result = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule
  if (result) return path.resolve(result.resolvedFileName)
  // Especificador relativo para arquivo que ainda não existe ou não é TypeScript: o caminho conta.
  if (specifier.startsWith('.')) return path.resolve(path.dirname(file), specifier)
  const types = ts.resolveTypeReferenceDirective(specifier, file, options, ts.sys).resolvedTypeReferenceDirective
  return types?.resolvedFileName ? path.resolve(types.resolvedFileName) : null
}

function isInside(target, dir) {
  if (!target) return false
  const rel = path.relative(dir, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// Monta, para um projeto (api ou web), a lista de dependências de cada arquivo.
function buildGraph(root, project, files) {
  const options = compilerOptions(root, project)
  const graph = new Map()
  for (const file of files) {
    const sourceFile = parse(file)
    const deps = collectSpecifiers(sourceFile).map((specifier) => {
      const target = resolve(specifier, file, options)
      const fromPath = target && target.includes(`${path.sep}node_modules${path.sep}`) ? packageFromPath(target) : null
      return { specifier, target, pkg: packageName(specifier) || fromPath }
    })
    graph.set(file, { sourceFile, deps })
  }
  return graph
}

function packageFromPath(target) {
  const after = target.split(`${path.sep}node_modules${path.sep}`).pop()
  const parts = after.split(path.sep)
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

const PRISMA_PACKAGES = new Set(['@prisma/client', '.prisma', '@prisma/engines', 'prisma'])
const EXPRESS_PACKAGES = new Set([
  'express',
  'multer',
  'express-serve-static-core',
  '@types/express',
  '@types/multer',
  '@types/express-serve-static-core',
])

// Referências ao namespace global Express (ex.: Express.Request, Express.Multer.File):
// tipos do express que chegam sem import, pelas declarações globais do @types/express.
function usesExpressGlobal(sourceFile) {
  let found = false
  const visit = (node) => {
    if (found) return
    if (ts.isQualifiedName(node) || ts.isPropertyAccessExpression(node)) {
      let left = ts.isQualifiedName(node) ? node.left : node.expression
      while (ts.isQualifiedName(left)) left = left.left
      while (ts.isPropertyAccessExpression(left)) left = left.expression
      if (ts.isIdentifier(left) && left.text === 'Express') found = true
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function cycles(graph, scopeDir) {
  const nodes = [...graph.keys()].filter((f) => isInside(f, scopeDir))
  const edges = new Map()
  const known = new Set(nodes)
  for (const file of nodes) {
    const targets = graph
      .get(file)
      .deps.map((d) => d.target)
      .filter((t) => t && known.has(t))
    edges.set(file, [...new Set(targets)])
  }
  // Tarjan: componentes fortemente conexos com mais de um arquivo (ou laço em si mesmo).
  let index = 0
  const stack = []
  const onStack = new Set()
  const idx = new Map()
  const low = new Map()
  const result = []
  const strong = (v) => {
    idx.set(v, index)
    low.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)
    for (const w of edges.get(v)) {
      if (!idx.has(w)) {
        strong(w)
        low.set(v, Math.min(low.get(v), low.get(w)))
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)))
      }
    }
    if (low.get(v) === idx.get(v)) {
      const component = []
      let w
      do {
        w = stack.pop()
        onStack.delete(w)
        component.push(w)
      } while (w !== v)
      if (component.length > 1 || edges.get(v).includes(v)) result.push(component)
    }
  }
  for (const v of nodes) if (!idx.has(v)) strong(v)
  return result
}

// G5: leitura de process.env (API) e import.meta.env (front), em qualquer forma de escrita.
function envAccesses(sourceFile, kind) {
  const hits = []
  const processAliases = new Set(['process'])
  const isProcess = (expr) => {
    if (ts.isIdentifier(expr)) return processAliases.has(expr.text)
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
      return ['globalThis', 'global', 'window', 'self'].includes(expr.expression.text) && expr.name.text === 'process'
    }
    if (ts.isElementAccessExpression(expr)) return literalText(expr.argumentExpression) === 'process'
    if (ts.isParenthesizedExpression(expr)) return isProcess(expr.expression)
    return false
  }
  const metaAliases = new Set()
  const isImportMeta = (expr) => {
    if (ts.isIdentifier(expr)) return metaAliases.has(expr.text)
    if (ts.isParenthesizedExpression(expr)) return isImportMeta(expr.expression)
    return ts.isMetaProperty(expr) && expr.keywordToken === ts.SyntaxKind.ImportKeyword && expr.name.text === 'meta'
  }
  const isTarget = kind === 'process' ? isProcess : isImportMeta
  const aliases = kind === 'process' ? processAliases : metaAliases
  // Primeiro os apelidos (const p = process, const meta = import.meta), em qualquer ordem no arquivo.
  let grew = true
  while (grew) {
    grew = false
    const collect = (node) => {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name) && !aliases.has(node.name.text)) {
        const init = node.initializer
        if (isTarget(init) || (kind === 'process' && ts.isCallExpression(init) && isRequireOfProcess(init))) {
          aliases.add(node.name.text)
          grew = true
        }
      }
      ts.forEachChild(node, collect)
    }
    collect(sourceFile)
  }
  const record = (node) => hits.push(sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1)

  if (kind === 'process') {
    // import process from 'node:process', import * as p from 'process', import { env } from 'process'
    for (const stmt of sourceFile.statements) {
      if (ts.isImportDeclaration(stmt) && ['process', 'node:process'].includes(literalText(stmt.moduleSpecifier))) {
        const clause = stmt.importClause
        if (clause?.name) processAliases.add(clause.name.text)
        const bindings = clause?.namedBindings
        if (bindings && ts.isNamespaceImport(bindings)) processAliases.add(bindings.name.text)
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) if ((el.propertyName || el.name).text === 'env') record(el)
        }
      }
    }
  }
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'env' && isTarget(node.expression)) record(node)
    else if (ts.isElementAccessExpression(node) && literalText(node.argumentExpression) === 'env' && isTarget(node.expression)) {
      record(node)
    } else if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name)) {
      const init = node.initializer
      const fromTarget = isTarget(init) || (kind === 'process' && ts.isCallExpression(init) && isRequireOfProcess(init))
      if (fromTarget) {
        for (const el of node.name.elements) {
          const prop = el.propertyName ? literalText(el.propertyName) ?? el.propertyName.getText() : el.name.getText()
          if (prop === 'env') record(el)
        }
      }
    } else if (
      kind === 'process' &&
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'env' &&
      ts.isCallExpression(node.expression) &&
      isRequireOfProcess(node.expression)
    ) {
      record(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return hits
}

function isRequireOfProcess(call) {
  return (
    ts.isIdentifier(call.expression) &&
    call.expression.text === 'require' &&
    ['process', 'node:process'].includes(literalText(call.arguments[0]))
  )
}

// G11: endereço fixo (host local, porta das cópias ou pasta temporária) fora de config/.
const FIXED_HOST = /(^|[^\w.])(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?![\w-])/i
const FIXED_PATH = /(^|['"`\s])\/tmp\//
const FIXED_PORTS = new Set([4000, 5173, 5432])

function fixedAddresses(sourceFile) {
  const hits = []
  const visit = (node) => {
    let text = null
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text
    if (text !== null && (FIXED_HOST.test(text) || FIXED_PATH.test(text))) hits.push(node)
    if (ts.isNumericLiteral(node) && FIXED_PORTS.has(Number(node.text))) hits.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return hits.map((n) => sourceFile.getLineAndCharacterOfPosition(n.getStart()).line + 1)
}

// G12: PrismaClient só é instanciado em api/src/repositories/.
function prismaInstances(sourceFile) {
  const names = new Set()
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && (literalText(stmt.moduleSpecifier) || '').startsWith('@prisma/client')) {
      const bindings = stmt.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) if ((el.propertyName || el.name).text === 'PrismaClient') names.add(el.name.text)
      }
      if (bindings && ts.isNamespaceImport(bindings)) names.add(`${bindings.name.text}.PrismaClient`)
      if (stmt.importClause?.name) names.add(`${stmt.importClause.name.text}.PrismaClient`)
    }
  }
  names.add('PrismaClient')
  const hits = []
  const visit = (node) => {
    if (ts.isNewExpression(node) && names.has(node.expression.getText(sourceFile))) {
      hits.push(sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return hits
}

export function runStatic(root, only) {
  const want = (id) => !only || only.has(id)
  const violations = []
  const rel = (file) => path.relative(root, file).split(path.sep).join('/')
  const add = (rule, file, detail) => violations.push({ rule, file: rel(file), detail })

  const apiDir = path.join(root, 'api')
  const webDir = path.join(root, 'web')
  const apiSrc = path.join(apiDir, 'src')
  const webSrc = path.join(webDir, 'src')

  const apiFiles = walk(apiDir)
  const webFiles = walk(webDir)
  const apiGraph = buildGraph(root, 'api', apiFiles)
  const webGraph = buildGraph(root, 'web', webFiles)

  const httpDir = path.join(apiSrc, 'http')
  const repoDir = path.join(apiSrc, 'repositories')
  const servicesDir = path.join(apiSrc, 'services')
  const integrationsDir = path.join(apiSrc, 'integrations')

  for (const [file, { sourceFile, deps }] of apiGraph) {
    if (want('G4') && isInside(file, httpDir)) {
      for (const d of deps) {
        if (PRISMA_PACKAGES.has(d.pkg) || isInside(d.target, repoDir)) add('G4', file, d.specifier)
      }
    }
    if (want('G6') && isInside(file, servicesDir)) {
      for (const d of deps) {
        if (EXPRESS_PACKAGES.has(d.pkg) || isInside(d.target, httpDir)) add('G6', file, d.specifier)
      }
      if (usesExpressGlobal(sourceFile)) add('G6', file, 'namespace global Express')
    }
    if (want('G7') && !isInside(file, integrationsDir)) {
      for (const d of deps) if (d.pkg === 'openai') add('G7', file, d.specifier)
    }
  }
  if (want('G7')) {
    for (const [file, { deps }] of webGraph) for (const d of deps) if (d.pkg === 'openai') add('G7', file, d.specifier)
  }
  if (want('G8')) {
    for (const [file, { deps }] of webGraph) {
      for (const d of deps) if (isInside(d.target, apiDir)) add('G8', file, d.specifier)
    }
  }
  if (want('G9')) {
    for (const [graph, dir] of [
      [apiGraph, apiSrc],
      [webGraph, webSrc],
    ]) {
      for (const component of cycles(graph, dir)) {
        const names = component.map(rel).sort()
        for (const file of component) add('G9', file, `ciclo: ${names.join(' -> ')}`)
      }
    }
  }
  if (want('G5')) {
    const apiConfig = path.join(apiSrc, 'config')
    const webConfig = path.join(webSrc, 'config')
    for (const [file, { sourceFile }] of apiGraph) {
      if (!isInside(file, apiSrc) || isInside(file, apiConfig)) continue
      for (const line of envAccesses(sourceFile, 'process')) add('G5', file, `process.env na linha ${line}`)
    }
    for (const [file, { sourceFile }] of webGraph) {
      if (!isInside(file, webSrc) || isInside(file, webConfig)) continue
      for (const line of envAccesses(sourceFile, 'meta')) add('G5', file, `import.meta.env na linha ${line}`)
    }
  }
  if (want('G11')) {
    for (const [graph, src] of [
      [apiGraph, apiSrc],
      [webGraph, webSrc],
    ]) {
      const configDir = path.join(src, 'config')
      for (const [file, { sourceFile }] of graph) {
        if (!isInside(file, src) || isInside(file, configDir) || /\.test\.tsx?$/.test(file)) continue
        for (const line of fixedAddresses(sourceFile)) add('G11', file, `endereço fixo na linha ${line}`)
      }
    }
  }
  if (want('G12')) {
    for (const [file, { sourceFile }] of apiGraph) {
      if (!isInside(file, apiSrc) || isInside(file, repoDir)) continue
      for (const line of prismaInstances(sourceFile)) add('G12', file, `new PrismaClient na linha ${line}`)
    }
  }
  return violations
}
