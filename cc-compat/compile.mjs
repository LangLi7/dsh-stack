#!/usr/bin/env node
/**
 * Claude-Code -> DeepSeek-Harness compiler.
 *
 * Reads `mapping.json` (the naming transfer table) and emits dsh-consumable
 * artifacts from the Claude-Code sources already fetched by `install.mjs`.
 * Nothing in the sources is rewritten: a rule describes what to emit, and this
 * script is the only thing that knows how to execute it.
 *
 *   node compile.mjs [--dry] [--only <owner/repo>]
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const COMPAT = join(DSH_HOME, 'cc-compat')
const SOURCES = join(DSH_HOME, 'cc-sources')
const SKILLS_ROOT = join(DSH_HOME, 'skills')
const MAPPING = join(COMPAT, 'mapping.json')
// Owned by `plugin-install.mjs`, which sees every plugin manifest and therefore
// emits the authoritative fragment; this script keeps its own file so a later
// `compile.mjs` run can never shrink the installed MCP set.
const FRAGMENT = join(COMPAT, 'generated-mcp.compile.patch.yml')
const REPORT = join(SOURCES, 'compile-report.json')

const dryRun = process.argv.includes('--dry')
const onlyIndex = process.argv.indexOf('--only')
const only = onlyIndex === -1 ? undefined : process.argv[onlyIndex + 1]

/** The transfer table is data, so a rule can be corrected without touching this file. */
const TABLE = JSON.parse(readFileSync(MAPPING, 'utf8'))
const RULE = Object.fromEntries(TABLE.rules.map(rule => [rule.id, rule]))

const SLUG_PATTERN = /^(.+)__(.+)$/

function slugOf(repo) {
  return repo.replace('/', '__')
}

/** Source tree and target root for one repository directory under `cc-sources`. */
function repositories() {
  let entries
  try {
    entries = readdirSync(SOURCES, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter(entry => entry.isDirectory() && SLUG_PATTERN.test(entry.name))
    .map(entry => entry.name)
    .filter(name => only === undefined || name === slugOf(only))
    .sort()
}

/** Every file under `root` whose basename matches, skipping VCS and dependency noise. */
function walk(root, match, found = []) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) walk(path, match, found)
    else if (match(entry.name)) found.push(path)
  }
  return found
}

/** Directories named `name` anywhere under `root`. */
function walkDirs(root, name, found = []) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    if (!entry.isDirectory()) continue
    const path = join(root, entry.name)
    if (entry.name === name) found.push(path)
    else walkDirs(path, name, found)
  }
  return found
}

/**
 * Frontmatter fields plus body. Windows checkouts are CRLF and JavaScript's `.`
 * never matches `\r`, so normalizing first is what makes `name:` visible at all.
 */
function parseDocument(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!text.startsWith('---')) return { fields: {}, body: text }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { fields: {}, body: text }
  const fields = {}
  for (const line of text.slice(3, end).split('\n')) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line)
    if (match === null) continue
    fields[match[1]] = match[2].replace(/^["']|["']$/g, '').trim()
  }
  return { fields, body: text.slice(end + 4).replace(/^\n+/, '') }
}

/** A YAML scalar that survives round-tripping through the settings loader. */
function yamlScalar(value) {
  const text = String(value).replace(/\s+/g, ' ').trim()
  if (text === '') return "''"
  if (/^[A-Za-z0-9][A-Za-z0-9 _.,/@()+-]*$/.test(text) && !/^(true|false|null|yes|no|on|off)$/i.test(text)) return text
  return `'${text.replace(/'/g, "''")}'`
}

/** CC spells tools in PascalCase; dsh spells them in snake_case (see `toolNames`). */
function translateTools(list) {
  const names = list
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(item => item.trim().replace(/^["']|["']$/g, ''))
    .filter(item => item !== '' && !item.startsWith('-'))
  const mapped = []
  const unmapped = []
  for (const name of names) {
    const target = TABLE.toolNames[name]
    if (target === undefined) unmapped.push(name)
    else if (!mapped.includes(target)) mapped.push(target)
  }
  return { mapped, unmapped }
}

/** Substitutes the CC variables the bodies actually use. */
function substituteVariables(body, { repoDir, workspace }) {
  let out = body
  for (const [token, replacement] of Object.entries(TABLE.variables)) {
    const value = replacement
      .replace('<DSH_HOME>', DSH_HOME)
      .replace('<owner>__<repo>', basename(repoDir))
      .replace('<workspace>', workspace)
    out = out.split(token).join(value)
  }
  return out
}

function frontmatterBlock(pairs) {
  const lines = pairs
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${yamlScalar(value)}`)
  return `---\n${lines.join('\n')}\n---\n`
}

/** One compiled skill directory: `SKILL.md` plus a provenance sidecar. */
function emitSkill(targetDir, frontmatter, body, provenance) {
  if (!dryRun) {
    rmSync(targetDir, { recursive: true, force: true })
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(join(targetDir, 'SKILL.md'), `${frontmatterBlock(frontmatter)}\n${body}`, 'utf8')
    writeFileSync(join(targetDir, 'dsh-compiled.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8')
  }
  return targetDir
}

/**
 * dsh skill names match `^[a-z0-9]+(?:-[a-z0-9]+)*$`, a strictly narrower
 * alphabet than Claude Code's. Underscores are the trap: every CC agent name is
 * snake_case (`abstract_bilingual_agent`), and `skill-filesystem` skips such a
 * file with `ignored: invalid skill name` rather than failing loudly, so a
 * verbatim copy loses the whole agent without any error. Transliterating here —
 * runs of anything outside the alphabet collapse into one hyphen — keeps the
 * artifact discoverable; the untouched CC name survives in the `x-dsh-cc-*`
 * provenance fields and in the sidecar.
 */
function skillSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Reserves a slug inside one root, so two sources cannot claim one directory. */
function uniqueName(ctx, slug) {
  let candidate = slug
  for (let n = 2; ctx.names.has(candidate); n += 1) candidate = `${slug}-${n}`
  ctx.names.add(candidate)
  return candidate
}

/** `commands/*.md` -> a user-invocable skill that keeps the argument hint. */
function compileCommand(file, root, ctx) {
  const { fields, body } = parseDocument(file)
  const stem = basename(file, '.md')
  const name = uniqueName(ctx, skillSlug(`cmd-${stem}`))
  const tools = fields['allowed-tools'] === undefined ? { mapped: [], unmapped: [] } : translateTools(fields['allowed-tools'])
  const preamble =
    `Arguments passed by the user are appended to this message; read them from there. ` +
    `A body that refers to \`$ARGUMENTS\` means that whole argument string.\n`
  const frontmatter = [
    ['name', name],
    ['description', fields.description ?? `Claude Code command ${stem}`],
    ['user-invocable', 'true'],
    ['disable-model-invocation', 'true'],
    ['x-dsh-cc-command', `${basename(dirname(dirname(file)))}/${stem}`],
    ['x-dsh-cc-allowed-tools', tools.mapped.join(', ')],
    ['x-dsh-cc-argument-hint', fields['argument-hint']],
  ]
  return emitSkill(
    join(root, name),
    frontmatter,
    `${preamble}\n${substituteVariables(body, ctx)}`,
    { kind: 'command', source: relative(SOURCES, file).replace(/\\/g, '/'), rule: RULE.command.id, unmappedTools: tools.unmapped },
  )
}

/**
 * Nearest ancestor directory that is itself a skill. Two CC plugins routinely
 * ship the same agent name for different personas (`report_compiler_agent`
 * appears under both `academic-paper` and `academic-paper-reviewer`), so the
 * skill directory disambiguates them instead of one silently overwriting the
 * other.
 */
function owningSkillDir(file) {
  let dir = dirname(file)
  while (dir.startsWith(SOURCES) && dir !== SOURCES) {
    if (existsSync(join(dir, 'SKILL.md'))) return basename(dir)
    dir = dirname(dir)
  }
  return undefined
}

/**
 * `agents/*.md` -> an invocable role prompt. The CC name is transliterated into
 * the dsh skill alphabet (see {@link skillSlug}) and the original is kept as
 * provenance.
 */
function compileAgent(file, root, ctx) {
  const { fields, body } = parseDocument(file)
  const ccName = fields.name ?? basename(file, '.md')
  const owner = owningSkillDir(file)
  const agentName = owner === undefined
    ? skillSlug(ccName)
    : `${skillSlug(owner)}-${skillSlug(ccName)}`
  const name = uniqueName(ctx, `agent-${agentName}`)
  const frontmatter = [
    ['name', name],
    ['description', fields.description ?? `Claude Code agent ${agentName}`],
    ['user-invocable', 'true'],
    // Same cost rule as the copied skills: the skill catalog is assembled into
    // every request, so the imported corpus stays reachable through `/skill`
    // and by explicit invocation without paying for every description on every
    // turn. A bulk source (ECC alone ships 307 agents) would otherwise multiply
    // the catalog by an order of magnitude.
    ['disable-model-invocation', 'true'],
    ['x-dsh-cc-agent-name', ccName],
  ]
  return emitSkill(
    join(root, name),
    frontmatter,
    substituteVariables(body, ctx),
    {
      kind: 'agent',
      source: relative(SOURCES, file).replace(/\\/g, '/'),
      rule: RULE.agent.id,
      agentName,
      ccName,
      dshName: name,
    },
  )
}

/**
 * The imported corpus is far too large to be model-invocable: the skill catalog
 * is assembled into every request, so a thousand extra descriptions would be
 * paid for on every turn. This amends the copy in place — the source stays
 * untouched — and leaves a skill that already declares the field alone.
 */
/**
 * Whether a skill's own frontmatter marks it as not user-invocable. Such a skill
 * is model-only by the SOURCE's intent, so adding `disable-model-invocation` to
 * it would leave it reachable by neither path. Eight agentmemory reference
 * skills declare exactly this, and the policy would otherwise retire them
 * silently — the catalog simply would not list them any more.
 */
function declaresUserHidden(path) {
  const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!raw.startsWith('---')) return false
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return false
  return /^user-invocable\s*:\s*(false|no|off)\s*$/im.test(raw.slice(3, end))
}

function applyInvocationPolicy(root) {
  const policy = TABLE.policies?.importedSkillInvocation
  if (policy === undefined) return { added: 0, present: 0, noFrontmatter: 0, userHidden: 0, files: [] }
  const counts = { added: 0, present: 0, noFrontmatter: 0, userHidden: 0, files: [] }

  for (const child of readdirSync(root, { withFileTypes: true })) {
    if (!child.isDirectory()) continue
    // A sidecar means this compiler owns the directory and already wrote its
    // frontmatter; only the installer's copies are amended here.
    if (existsSync(join(root, child.name, 'dsh-compiled.json'))) continue
    const skillFile = join(root, child.name, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    if (declaresUserHidden(skillFile)) {
      counts.userHidden += 1
      counts.files.push(`${child.name} (user-hidden, left model-invocable)`)
      continue
    }
    const outcome = amendFrontmatterBoolean(skillFile, policy.field, policy.value)
    if (outcome === 'added') counts.added += 1
    else if (outcome === 'present') counts.present += 1
    else counts.noFrontmatter += 1
    if (outcome !== 'present') counts.files.push(`${child.name} (${outcome})`)
  }
  return counts
}

/**
 * Minimal, byte-faithful frontmatter edit: only the frontmatter block is
 * touched, and the file's own line endings survive.
 */
function amendFrontmatterBoolean(path, key, value) {
  const raw = readFileSync(path, 'utf8')
  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : ''
  const text = bom === '' ? raw : raw.slice(1)
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return 'no-frontmatter'
  let end = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      end = index
      break
    }
  }
  if (end === -1) return 'no-frontmatter'
  const pattern = new RegExp(`^${key}\\s*:`)
  for (let index = 1; index < end; index += 1) {
    if (pattern.test(lines[index])) return 'present'
  }
  lines.splice(end, 0, `${key}: ${value}`)
  if (!dryRun) writeFileSync(path, bom + lines.join(newline), 'utf8')
  return 'added'
}

/** A scalar that must be printed verbatim, because it is a YAML expression. */
function rawYaml(text) {
  return { __rawYaml: text }
}

/**
 * Claude Code expands `${VAR}` / `${VAR:-default}` in MCP env values itself.
 * dsh hands `config.env` straight to the child (`z.dict(String)`), so a copied
 * token would arrive as that literal text and the server would be pointed at a
 * URL named `${...}`. Emitting a `!!js` expression moves the expansion to load
 * time, where it can still read `process.env` — without baking a secret into
 * the fragment. Only a value that is exactly one token is translated; a token
 * embedded in a larger string is left alone rather than half-rewritten.
 */
function translateEnvValue(value) {
  if (typeof value !== 'string') return value
  const whole = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}$/.exec(value)
  if (whole === null) return value
  const [, name, fallback] = whole
  const ref = `process.env[${JSON.stringify(name)}]`
  const expression = fallback === undefined || fallback === ''
    ? `(${ref} ?? '')`
    : `(${ref} ?? ${JSON.stringify(fallback)})`
  return rawYaml(`!!js ${expression}`)
}

/** `mcp.json` -> one `dsh-mcp-client` plugin row in a separate fragment. */
function compileMcp(file, rows) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    return { file, error: `unreadable JSON: ${error.message}` }
  }
  const servers = manifest.mcpServers ?? manifest.servers ?? {}
  const emitted = []
  for (const [serverName, server] of Object.entries(servers)) {
    const safe = serverName.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32)
    if (server.command === undefined) {
      emitted.push({ serverName, skipped: 'not a stdio server (no command)' })
      continue
    }
    const row = {
      id: `mcp-${safe}`,
      name: '@deepseek-ai/dsh-mcp-client',
      config: {
        transport: 'stdio',
        serverName: safe,
        command: server.command,
        args: Array.isArray(server.args) ? server.args : [],
        env: Object.fromEntries(
          Object.entries(server.env ?? {}).map(([key, value]) => [key, translateEnvValue(value)]),
        ),
      },
    }
    if (rows.some(existing => existing.id === row.id)) {
      emitted.push({ serverName, skipped: 'already declared by an earlier manifest' })
      continue
    }
    rows.push(row)
    emitted.push({ serverName: safe, id: row.id, source: relative(SOURCES, file).replace(/\\/g, '/') })
  }
  return { file, emitted }
}

/**
 * Render plugin rows as ONE `insert` list. `insert` is the only patch form that
 * ADDS a plugin: a bare top-level `- id: <name>` is an id-targeted override
 * instead, and the loader drops it with `patch: entry "<name>" not found` when
 * no such row exists yet. Shared with `plugin-install.mjs` so every generated
 * fragment has one shape.
 */
/** Raw expression objects print verbatim; every other scalar is quoted as YAML. */
function scalarFor(value) {
  return value !== null && typeof value === 'object' && typeof value.__rawYaml === 'string'
    ? value.__rawYaml
    : yamlScalar(value)
}

export function renderInsertFragment(rows, headerLines) {
  const header = `${headerLines.map(line => (line === '' ? '#' : `# ${line}`)).join('\n')}\n`
  if (rows.length === 0) return `${header}[]\n`
  const body = rows
    .map(row => {
      const config = Object.entries(row.config)
        .map(([key, value]) => {
          if (Array.isArray(value)) return `        ${key}: [${value.map(scalarFor).join(', ')}]`
          if (value !== null && typeof value === 'object' && typeof value.__rawYaml !== 'string') {
            const inner = Object.entries(value)
              .map(([k, v]) => `          ${k}: ${scalarFor(v)}`)
              .join('\n')
            return inner === '' ? `        ${key}: {}` : `        ${key}:\n${inner}`
          }
          return `        ${key}: ${scalarFor(value)}`
        })
        .join('\n')
      return `    - id: ${row.id}\n      name: ${yamlScalar(row.name)}\n      config:\n${config}`
    })
    .join('\n')
  return `${header}- insert:\n${body}\n`
}

function writeFragment(rows) {
  const text = renderInsertFragment(rows, [
    'Generated by cc-compat/compile.mjs from Claude Code MCP manifests.',
    'The rows below sit inside one `insert` list, because each of them ADDS a',
    'plugin. A bare `- id: <name>` at the top level is the other patch form:',
    'an id-targeted override, which the loader drops with',
    '`patch: entry "<name>" not found` when no such row exists yet. Append',
    'this file to a profile patch to enable the servers; nothing enables them',
    'automatically, because an install must not rewrite a user composition.',
  ])
  if (!dryRun) writeFileSync(FRAGMENT, text, 'utf8')
}

function main() {
  const repos = repositories()
  if (repos.length === 0) throw new Error(`no sources under ${SOURCES}${only === undefined ? '' : ` matching "${only}"`}`)
  const report = { generatedAt: new Date().toISOString(), dryRun, table: MAPPING, repositories: [] }
  const rows = []

  for (const repoDirName of repos) {
    const repoDir = join(SOURCES, repoDirName)
    const root = join(SKILLS_ROOT, `cc-${repoDirName}`)
    const ctx = { repoDir, workspace: process.cwd(), names: new Set() }
    const entry = { repo: repoDirName, root, skills: 0, commands: [], agents: [], mcp: [], unmappedTools: [] }

    // Derived directories are owned by this compiler, so a re-run clears them
    // first. Copies the installer made stay untouched; only `cmd-*` / `agent-*`
    // are ever ours.
    if (!dryRun) {
      for (const child of readdirSync(root, { withFileTypes: true })) {
        if (!child.isDirectory()) continue
        if (child.name.startsWith('cmd-') || child.name.startsWith('agent-')) {
          rmSync(join(root, child.name), { recursive: true, force: true })
        }
      }
    }

    // Rule `skill`: the one kind both ecosystems already agree on. The existing
    // installer already placed these; count them so the report is complete.
    entry.skills = readdirSync(root, { withFileTypes: true }).filter(child => {
      return child.isDirectory() && existsSync(join(root, child.name, 'SKILL.md'))
    }).length
    entry.invocation = applyInvocationPolicy(root)

    for (const dir of walkDirs(repoDir, 'commands')) {
      for (const file of readdirSync(dir).filter(name => name.endsWith('.md'))) {
        const target = compileCommand(join(dir, file), root, ctx)
        entry.commands.push(relative(root, target).replace(/\\/g, '/'))
      }
    }

    for (const dir of walkDirs(repoDir, 'agents')) {
      for (const file of readdirSync(dir).filter(name => name.endsWith('.md'))) {
        const target = compileAgent(join(dir, file), root, ctx)
        entry.agents.push(relative(root, target).replace(/\\/g, '/'))
      }
    }

    for (const file of walk(repoDir, name => name === 'mcp.json' || name === '.mcp.json')) {
      entry.mcp.push(compileMcp(file, rows))
    }

    // A compiled skill sits directly under its root, so it is discoverable by
    // the same immediate-children rule as the copied ones.
    entry.commands.forEach(name => entry.unmappedTools.push(...(readEntryUnmapped(root, name))))
    report.repositories.push(entry)
  }

  writeFragment(rows)
  report.mcpRows = rows.map(row => row.id)
  if (!dryRun) writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  const total = report.repositories.reduce((sum, entry) => sum + entry.commands.length + entry.agents.length, 0)
  console.log(`repositories: ${report.repositories.length}`)
  for (const entry of report.repositories) {
    console.log(`  ${entry.repo}: ${entry.commands.length} commands, ${entry.agents.length} agents, ${entry.mcp.length} mcp manifests`)
  }
  const invocation = report.repositories.reduce(
    (sum, entry) => ({
      added: sum.added + entry.invocation.added,
      present: sum.present + entry.invocation.present,
      noFrontmatter: sum.noFrontmatter + entry.invocation.noFrontmatter,
      userHidden: sum.userHidden + entry.invocation.userHidden,
    }),
    { added: 0, present: 0, noFrontmatter: 0, userHidden: 0 },
  )
  console.log(`imported skills set to user-invocable: ${invocation.added} amended, ${invocation.present} already declared, ${invocation.userHidden} user-hidden (left model-invocable), ${invocation.noFrontmatter} unreadable`)
  console.log(`compiled skills: ${total}`)
  console.log(`mcp rows: ${rows.length}${rows.length > 0 ? ` -> ${FRAGMENT}` : ''}`)
  const unmapped = [...new Set(report.repositories.flatMap(entry => entry.unmappedTools))]
  if (unmapped.length > 0) console.log(`unmapped CC tools: ${unmapped.join(', ')}`)
}

/** Reads back the sidecar so the report can name tool names the table missed. */
function readEntryUnmapped(root, name) {
  try {
    const provenance = JSON.parse(readFileSync(join(root, name, 'dsh-compiled.json'), 'utf8'))
    return provenance.unmappedTools ?? []
  } catch {
    return []
  }
}

// Importable as a library (`plugin-install.mjs` reuses these emission helpers,
// so both scripts produce identical skill directories), runnable as a CLI.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main()

export {
  COMPAT,
  DSH_HOME,
  FRAGMENT,
  MAPPING,
  REPORT,
  RULE,
  SKILLS_ROOT,
  SOURCES,
  TABLE,
  compileAgent,
  compileCommand,
  compileMcp,
  applyInvocationPolicy,
  amendFrontmatterBoolean,
  dryRun,
  emitSkill,
  frontmatterBlock,
  only,
  owningSkillDir,
  parseDocument,
  repositories,
  skillSlug,
  slugOf,
  substituteVariables,
  translateTools,
  uniqueName,
  walk,
  walkDirs,
  yamlScalar,
}
