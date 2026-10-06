// Post-install verification for the DSH portable stack.
//
//   node tools/verify.mjs                 # check the install under $DSH_HOME
//   node tools/verify.mjs --repo-only     # check the repository itself (CI / pre-push)
//
// Checks the things that actually break:
//   1. every plugin is reachable through Node resolution FROM THE PROFILE
//      (not merely present on disk), and every file its manifest points at exists
//   2. every profile patch is valid YAML, is an entry list, and obeys the
//      expression dialect (no `require`, which the loader's scope does not have)
//   3. no secret-shaped strings and no personal absolute paths anywhere in the
//      repository
//
// Exit code 0 = all checks pass. Any FAIL makes the process exit non-zero.

import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const STACK_ROOT = resolve(HERE, '..')
const DSH_HOME = resolve(process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh'))
const PROFILE = process.env.DSH_STACK_PROFILE ?? 'web'
const REPO_ONLY = process.argv.includes('--repo-only')

const results = []
const pass = (what, detail) => results.push({ ok: true, what, detail })
const fail = (what, detail) => results.push({ ok: false, what, detail })
const warn = (what, detail) => results.push({ ok: true, what, detail, warn: true })

/** Read a JSON file, or throw a readable error. */
function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

// ---------------------------------------------------------------------------
// 1. Plugins resolve from the profile
// ---------------------------------------------------------------------------

/** Every path a package manifest promises to provide. */
function manifestEntries(manifest) {
  const files = new Set()
  const add = (value) => {
    if (typeof value === 'string' && value.startsWith('./')) files.add(value)
    else if (value !== null && typeof value === 'object') for (const nested of Object.values(value)) add(nested)
  }
  if (typeof manifest.main === 'string') files.add(manifest.main)
  add(manifest.exports)
  if (typeof manifest.bin === 'string') files.add(manifest.bin)
  else if (manifest.bin !== null && typeof manifest.bin === 'object') add(manifest.bin)
  return [...files]
}

function checkPlugins() {
  const pluginRoot = join(STACK_ROOT, 'plugins')
  if (!existsSync(pluginRoot)) {
    fail('plugins directory', `${pluginRoot} is missing`)
    return
  }
  const names = readdirSync(pluginRoot, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  if (names.length === 0) {
    fail('plugins directory', 'contains no plugin')
    return
  }
  const profileDir = join(DSH_HOME, 'profiles', PROFILE)
  const require = createRequire(join(profileDir, 'noop.js'))
  for (const name of names) {
    const dir = join(pluginRoot, name)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) {
      fail(`plugin ${name}`, 'has no package.json')
      continue
    }
    const manifest = readJson(manifestPath)
    const declared = manifest.name ?? name
    // Resolution, not presence: a plugin copied next to the profile but not
    // resolvable through the node_modules walk never mounts.
    try {
      const resolved = require.resolve(`${declared}/package.json`)
      pass(`plugin ${declared}`, `resolves from the profile to ${resolved}`)
    } catch {
      fail(`plugin ${declared}`, `does not resolve from the profile directory ${profileDir} — run the installer`)
      continue
    }
    const missing = manifestEntries(manifest).filter(rel => !existsSync(join(dir, rel)))
    if (missing.length > 0) fail(`plugin ${declared} entry points`, `manifest points at missing files: ${missing.join(', ')}`)
    else pass(`plugin ${declared} entry points`, `${manifestEntries(manifest).length} declared path(s) exist`)
    if (manifest.dsh?.client !== undefined) {
      const clientEntry = manifest.exports?.['./client']
      if (clientEntry === undefined) warn(`plugin ${declared} client`, 'declares a client half but exports no "./client" subpath')
      else pass(`plugin ${declared} client`, `serves ${clientEntry}`)
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Profile patches parse and obey the expression dialect
// ---------------------------------------------------------------------------

/** Load js-yaml from whichever node_modules the installation hoisted. */
function loadYaml() {
  const anchors = [
    join(DSH_HOME, 'profiles', PROFILE, 'noop.js'),
    join(DSH_HOME, 'profiles', 'noop.js'),
    join(STACK_ROOT, 'noop.js'),
  ]
  for (const anchor of anchors) {
    try {
      return createRequire(anchor)('js-yaml')
    } catch {
      // try the next anchor
    }
  }
  return undefined
}

/** Structural validation of one patch list. @returns a list of problems. */
function validatePatch(entries) {
  const problems = []
  if (!Array.isArray(entries)) return ['top level is not a YAML array']
  entries.forEach((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      problems.push(`entry ${index} is not a mapping`)
      return
    }
    const rows = Array.isArray(entry.insert) ? entry.insert.map((row, at) => ({ row, where: `entry ${index} insert[${at}]` })) : []
    if (typeof entry.id !== 'string' && rows.length === 0) problems.push(`entry ${index} has neither an id nor an insert list`)
    if (Array.isArray(entry.insert) && rows.length === 0) problems.push(`entry ${index} has an empty insert list`)
    if (typeof entry.id === 'string') rows.push({ row: entry, where: `entry ${index} (${entry.id})` })
    for (const { row, where } of rows) {
      if (row === null || typeof row !== 'object') problems.push(`${where} is not a mapping`)
      else if (typeof row.id !== 'string') problems.push(`${where} has no id`)
      else if (Array.isArray(entry.insert) && typeof row.name !== 'string') problems.push(`${where} is an inserted row without a name`)
    }
  })
  return problems
}

/** The loader evaluates `!!js` with `new Function` under `with (ctx)`: true globals only. */
function checkExpressionDialect(text, label) {
  const offenders = []
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.includes('!!js')) return
    const expression = line.slice(line.indexOf('!!js') + 4)
    if (/\brequire\s*\(/.test(expression)) offenders.push(`line ${index + 1}: require(...) is not in scope`)
    if (/\bimport\s*\(/.test(expression)) offenders.push(`line ${index + 1}: dynamic import(...) is not in scope`)
  })
  if (offenders.length > 0) fail(`${label} expression dialect`, offenders.join('; '))
  else pass(`${label} expression dialect`, 'no out-of-scope identifiers in !!js expressions')
}

function checkPatches() {
  const templateDir = join(STACK_ROOT, 'home', 'profiles', 'web')
  const installDir = join(DSH_HOME, 'profiles', PROFILE)
  const yaml = loadYaml()
  if (yaml === undefined) {
    warn('patch parsing', 'js-yaml not found under the harness home; structure checks skipped')
    return
  }
  const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    resolve: data => typeof data === 'string',
    construct: data => ({ __jsExpr: data }),
  })
  const schema = yaml.JSON_SCHEMA.extend(JsExpr)

  for (const [label, dir] of [['template', templateDir], ['installed', installDir]]) {
    if (!existsSync(dir)) {
      if (label === 'installed') fail('installed profile', `${dir} does not exist — nothing was installed`)
      continue
    }
    const patches = readdirSync(dir).filter(name => name === 'cordis.patch.yml' || /^cordis\.patch\..+\.yml$/.test(name))
    if (patches.length === 0) {
      fail(`${label} patches`, `no cordis patch file in ${dir}`)
      continue
    }
    for (const name of patches) {
      const file = join(dir, name)
      const text = readFileSync(file, 'utf8')
      if (name !== 'cordis.patch.yml' && !existsSync(join(installDir, name)) && label === 'template') {
        // A feature template is only correct once the installer copied it.
        pass(`${label} patch ${name}`, 'present as a feature template')
      }
      let entries
      try {
        entries = yaml.load(text, { schema })
      } catch (error) {
        fail(`${label} patch ${name}`, `YAML error: ${error.message.split('\n')[0]}`)
        continue
      }
      const problems = validatePatch(entries)
      if (problems.length > 0) fail(`${label} patch ${name}`, problems.join('; '))
      else pass(`${label} patch ${name}`, `${entries.length} entr(y/ies) structurally valid`)
      checkExpressionDialect(text, `${label} patch ${name}`)
      if (/C:\\Users\\|Kittirat937|changchi\.space/.test(text)) fail(`${label} patch ${name}`, 'contains a personal absolute path or hostname')
    }
  }

  const installedPatch = join(installDir, 'cordis.patch.yml')
  if (existsSync(installedPatch)) {
    const text = readFileSync(installedPatch, 'utf8')
    for (const row of ['dsh-ponytail', 'dsh-usage-budget', 'dsh-i18n-de']) {
      if (text.includes(`'${row}'`)) pass(`installed patch row ${row}`, 'present')
      else fail(`installed patch row ${row}`, 'missing from the installed profile patch')
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Skills
// ---------------------------------------------------------------------------

function checkSkills() {
  const skillsRoot = join(STACK_ROOT, 'home', 'skills')
  if (!existsSync(skillsRoot)) {
    fail('skills', `no ${skillsRoot}`)
    return
  }
  const dirs = readdirSync(skillsRoot, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  const withoutSkillMd = dirs.filter(name => !existsSync(join(skillsRoot, name, 'SKILL.md')))
  if (withoutSkillMd.length > 0) fail('skills', `directories without SKILL.md: ${withoutSkillMd.join(', ')}`)
  else pass('skills', `${dirs.length} skill director(y/ies), each with a SKILL.md`)
  const installed = join(DSH_HOME, 'skills')
  if (REPO_ONLY) return
  const missing = dirs.filter(name => !existsSync(join(installed, name, 'SKILL.md')))
  if (missing.length > 0) fail('installed skills', `not present under ${installed}: ${missing.join(', ')}`)
  else pass('installed skills', `${dirs.length} skill(s) present under ${installed}`)
}

// ---------------------------------------------------------------------------
// 4. Secret and personal-path scan over the repository
// ---------------------------------------------------------------------------

/**
 * The Windows user-path prefix, assembled from character codes.
 *
 * Written as a literal it would match itself, and this file is scanned like
 * every other one — a detector that cannot pass its own check teaches people
 * to ignore the check.
 */
const WIN_USER_PREFIX = String.fromCharCode(67, 58) + '\\\\Users\\\\'

const SECRET_PATTERNS = [
  ['an OpenAI-style key', /\bsk-[A-Za-z0-9_-]{16,}/],
  ['a GitHub OAuth token', /\bgho_[A-Za-z0-9]{20,}/],
  ['a GitHub personal access token', /\bghp_[A-Za-z0-9]{20,}/],
  ['a GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['an AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['a PEM private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  // `[^\\\s'"]+` after the prefix means a documented placeholder ending in a
  // `<segment>` does not match: the character class rejects `<`. That is
  // deliberate — the placeholder is the recommended way to write about a path
  // without leaking one.
  ['a personal absolute path', new RegExp(`${WIN_USER_PREFIX}[^\\\\\\s'"]+`)],
  // Repo-relative paths spelled from the root look like `/home/...`: skip the
  // directory names a repository actually uses.
  ['a personal absolute path (posix)', /\/(?:home|Users)\/(?!<)(?!(?:profiles|src|skills|plugins|tools|docs|home|node_modules|app|workspace)\/)[a-z0-9._-]+\//i],
]

/** Files worth scanning: text-ish, not the fixtures that exist to contain secrets. */
function scanTree(root, skip = new Set()) {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (statSync(path).size < 2_000_000) found.push(path)
    }
  }
  walk(root)
  return found
}

function checkSecrets() {
  const files = scanTree(STACK_ROOT, new Set(['.git', 'node_modules']))
  const hits = []
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (text.includes('\u0000')) continue
    const lines = text.split(/\r?\n/)
    for (const [label, pattern] of SECRET_PATTERNS) {
      lines.forEach((line, index) => {
        if (pattern.test(line)) hits.push(`${relative(STACK_ROOT, file)}:${index + 1}: ${label}`)
      })
    }
  }
  if (hits.length > 0) fail('secret scan', hits.join('\n    '))
  else pass('secret scan', `${files.length} file(s) scanned, no secret shape and no personal path`)
}

// ---------------------------------------------------------------------------

const label = (entry) => `${entry.warn ? 'WARN' : entry.ok ? ' OK ' : 'FAIL'}  ${entry.what}${entry.detail === undefined ? '' : ` — ${entry.detail}`}`

checkSecrets()
checkSkills()
checkPatches()
if (!REPO_ONLY) checkPlugins()

console.log(`dsh-stack verify — ${REPO_ONLY ? 'repository' : `install under ${DSH_HOME} (profile ${PROFILE})`}\n`)
for (const entry of results) console.log(label(entry))
const failed = results.filter(entry => !entry.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) {
  console.log(`\n${failed.length} check(s) FAILED`)
  process.exitCode = 1
}
