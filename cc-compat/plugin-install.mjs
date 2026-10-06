#!/usr/bin/env node
/**
 * Lightweight Claude-Code plugin installer for DeepSeek Harness.
 *
 * Claude Code distributes capability as *plugins*: a marketplace manifest names
 * plugins, each plugin ships a `plugin.json` and its components live in
 * convention directories (`skills/`, `commands/`, `agents/`, `hooks/`, an MCP
 * manifest). `install.mjs` only knows a repository of loose `SKILL.md` files, so
 * it cannot express that model — this script can, which is what makes a URL list
 * enough to install a plugin (ECC and friends) without touching the sources.
 *
 *   node plugin-install.mjs                                   # repos.txt
 *   node plugin-install.mjs https://github.com/affaan-m/ECC
 *   node plugin-install.mjs --dry owner/repo
 *
 * Emission is delegated to `compile.mjs`, so a plugin's commands and agents are
 * byte-identical to the ones a loose-repository install produces.
 *
 * Nothing here edits a user composition: the profile patch includes the two
 * generated fragments, and only the harness decides what mounts.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  DSH_HOME,
  SOURCES,
  SKILLS_ROOT,
  amendFrontmatterBoolean,
  applyInvocationPolicy,
  compileAgent,
  compileCommand,
  compileMcp,
  parseDocument,
  renderInsertFragment,
  skillSlug,
  uniqueName,
  walk,
  walkDirs,
} from './compile.mjs'
import { describeTransform, generateHooksFile, normalizeSkillText } from './transform.mjs'

const COMPAT = join(DSH_HOME, 'cc-compat')
const LIST = join(COMPAT, 'repos.txt')
const REPORT = join(SOURCES, 'plugin-install-report.json')
const MCP_FRAGMENT = join(COMPAT, 'generated-mcp.patch.yml')
const HOOK_FRAGMENT = join(COMPAT, 'generated-hooks.patch.yml')
/** In-process hook runner: replaces ECC's spawning bootstrap (see the module doc). */
const HOOK_SHIM = join(COMPAT, 'hook-shim.cjs')
/** Derived per-plugin hook configs, never the source `hooks.json`. */
const HOOK_DIR = join(COMPAT, 'generated-hooks')

const dryRun = process.argv.includes('--dry')
const reloadRequested = process.argv.includes('--reload-hooks')
const only = process.argv.slice(2).filter(arg => !arg.startsWith('--'))

/** Marketplace manifests, most specific first. */
const MARKETPLACES = ['.claude-plugin/marketplace.json', 'marketplace.json', '.agents/plugins/marketplace.json']

/** Plugin manifests inside a plugin directory. */
const PLUGIN_MANIFESTS = ['.claude-plugin/plugin.json', 'plugin.json']

const GITHUB_REF = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** `owner/repo` slug used for both the source directory and the skill root. */
function slugOf(repo) {
  return repo.replace('/', '__')
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

/** The URL list: explicit arguments win, otherwise `repos.txt`. */
function requested() {
  const raw = only.length > 0
    ? only
    : existsSync(LIST)
      ? readFileSync(LIST, 'utf8').split(/\r?\n/).filter(line => line.trim() !== '' && !line.trim().startsWith('#'))
      : []
  const repos = []
  for (const line of raw) {
    const match = GITHUB_REF.exec(line.trim())
    if (match === null) {
      console.warn(`skipped unparseable repository reference: ${line.trim()}`)
      continue
    }
    repos.push(`${match[1]}/${match[2]}`)
  }
  return repos
}

/** Clone a repository once, then keep it at the remote head on later runs. */
function fetch(repo) {
  const dir = join(SOURCES, slugOf(repo))
  if (existsSync(join(dir, '.git'))) {
    git(['fetch', '--depth', '1', 'origin'], dir)
    git(['reset', '--hard', 'FETCH_HEAD'], dir)
    return dir
  }
  mkdirSync(SOURCES, { recursive: true })
  // Shallow: no history is needed to read manifests and components.
  git(['clone', '--depth', '1', `https://github.com/${repo}.git`, dir], SOURCES)
  return dir
}

/**
 * Plugins of one repository. A marketplace manifest names them; without one the
 * repository is treated as a single implicit plugin rooted at itself, which is
 * how the loose-repository repositories behave.
 */
function pluginsOf(repoDir) {
  for (const rel of MARKETPLACES) {
    const file = join(repoDir, rel)
    if (!existsSync(file)) continue
    let manifest
    try {
      manifest = readJson(file)
    } catch (error) {
      return { source: rel, error: `unreadable manifest: ${error.message}`, plugins: [] }
    }
    // `source` is relative to the marketplace root, which is the repository.
    const plugins = []
    for (const entry of Array.isArray(manifest.plugins) ? manifest.plugins : []) {
      const name = typeof entry?.name === 'string' ? entry.name : undefined
      if (name === undefined) continue
      if (typeof entry.source !== 'string') {
        plugins.push({ name, skipped: 'non-path source (a hosted marketplace entry)' })
        continue
      }
      // `resolve`, not `join`: a marketplace source is commonly `"./"`, and
      // `join` keeps the trailing separator, which turns into an escaped quote
      // the moment the path is embedded in a command string.
      const dir = resolve(repoDir, entry.source)
      if (!existsSync(dir)) {
        plugins.push({ name, skipped: `source directory missing: ${entry.source}` })
        continue
      }
      plugins.push({ name, dir, entry })
    }
    return { source: rel, marketplace: manifest.name, plugins }
  }
  return {
    source: undefined,
    plugins: [{ name: basename(repoDir).split('__').slice(1).join('__') || basename(repoDir), dir: repoDir, implicit: true }],
  }
}

function pluginMetadata(dir) {
  for (const rel of PLUGIN_MANIFESTS) {
    const file = join(dir, rel)
    if (!existsSync(file)) continue
    try {
      return { manifest: readJson(file), path: relative(dir, file).replace(/\\/g, '/') }
    } catch {
      return { manifest: {}, path: rel }
    }
  }
  return { manifest: {}, path: undefined }
}

/**
 * Rewrite the installed copy's `name:` when the source declared a name dsh
 * cannot register. Only the frontmatter block is touched and the file's own line
 * endings survive; without this the provider skips the skill with
 * `invalid skill name` and the install looks successful while losing content.
 */
function renameSkillFrontmatter(path, name) {
  const raw = readFileSync(path, 'utf8')
  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : ''
  const text = bom === '' ? raw : raw.slice(1)
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return false
  let end = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      end = index
      break
    }
  }
  if (end === -1) return false
  for (let index = 1; index < end; index += 1) {
    if (/^name\s*:/.test(lines[index])) {
      lines[index] = `name: ${name}`
      if (!dryRun) writeFileSync(path, bom + lines.join(newline), 'utf8')
      return true
    }
  }
  return false
}

/** A stable suffix naming which tree a skill came from.
 *
 * ECC ships one canonical `skills/` set plus platform mirrors (`.agents/`,
 * `.kiro/`) and `docs/<lang>/` translations of the SAME declared names. Copying
 * them all into one root without disambiguation let `cpSync` overwrite silently:
 * only 294 of 903 skills survived, and which variant survived depended on
 * directory order. The tree becomes part of the name instead, so the canonical
 * copy keeps its bare name and every alternate is addressable.
 */
function treeSuffix(pluginDir, skillFile) {
  // Relative to the directory that HOLDS the skill directory: the skill's own
  // name is not part of its tree, and including it would name every canonical
  // skill `<name>-<name>`.
  const container = relative(pluginDir, dirname(dirname(skillFile)))
  const parts = []
  for (const segment of container.split(/[\\/]/).filter(Boolean)) {
    // `skills` is the container, `docs` is only a translation shelf.
    if (segment === 'skills' || segment === 'docs') continue
    parts.push(segment.startsWith('.') ? segment.slice(1) : segment)
  }
  return parts.length === 0 ? '' : skillSlug(parts.join('-'))
}

/**
 * Drop the skills this installer copied earlier, so a re-run is idempotent even
 * after a naming change. Compiled directories carry a provenance sidecar and are
 * left alone — `main` owns those separately.
 */
function clearCopiedSkills(root) {
  if (dryRun || !existsSync(root)) return
  for (const child of readdirSync(root, { withFileTypes: true })) {
    if (!child.isDirectory()) continue
    const dir = join(root, child.name)
    if (!existsSync(join(dir, 'SKILL.md'))) continue
    if (existsSync(join(dir, 'dsh-compiled.json'))) continue
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Names claimed by each root, so one name never appears in two of them.
 *
 * A name is unique WITHIN a root by construction, but the skill registry keys on
 * the declared name across ALL roots: two different skills sharing a name collapse
 * into a single catalog entry and the loser becomes unreachable. Measured on this
 * corpus that was 5 skills — `deep-research`, `gget`, `exa-search`,
 * `literature-review`, `scholar-evaluation` — every one of them with different
 * content. The root that claims a name first keeps it; a later one is qualified
 * with its own plugin slug.
 */
const claimedAcrossRoots = new Map()

function claimAcrossRoots(ctx, name) {
  const owner = claimedAcrossRoots.get(name)
  if (owner === undefined || owner === ctx.owner) {
    claimedAcrossRoots.set(name, ctx.owner)
    return name
  }
  const qualified = uniqueName(ctx, `${name}-${ctx.owner}`)
  claimedAcrossRoots.set(qualified, ctx.owner)
  return qualified
}

/** Copy every skill of a plugin into its root, as an immediate child. */
function installSkills(pluginDir, root, ctx) {
  const skipped = []
  const candidates = []
  for (const file of walk(pluginDir, name => name === 'SKILL.md')) {
    if (existsSync(join(dirname(file), 'dsh-compiled.json'))) continue
    const { fields } = parseDocument(file)
    if (fields.name === undefined || fields.name === '') {
      skipped.push({ path: relative(pluginDir, file).replace(/\\/g, '/'), reason: 'frontmatter requires a name' })
      continue
    }
    if (fields.description === undefined || fields.description === '') {
      skipped.push({ path: relative(pluginDir, file).replace(/\\/g, '/'), reason: 'frontmatter requires a description' })
      continue
    }
    candidates.push({
      file,
      fields,
      base: skillSlug(fields.name),
      suffix: treeSuffix(pluginDir, file),
    })
  }

  // Only a CONTESTED name needs its tree spelled out. A repository that keeps all
  // of its skills in one tree keeps the bare names it declares; ECC, which ships
  // nine variants of `coding-standards`, gets one bare (the canonical tree) and
  // eight suffixed. Grouping first is what keeps the common case clean — a
  // suffix on every skill would rename 50 working claude-red skills for nothing.
  const byBase = new Map()
  for (const candidate of candidates) {
    const group = byBase.get(candidate.base)
    if (group === undefined) byBase.set(candidate.base, [candidate])
    else group.push(candidate)
  }

  const installed = []
  for (const [base, group] of byBase) {
    const canonical = group.find(candidate => candidate.suffix === '')
    for (const candidate of group) {
      const wanted = group.length === 1 || candidate === canonical
        ? base
        : `${base}-${candidate.suffix}`
      // `uniqueName` guarantees one directory per source, so no copy can ever
      // overwrite another, whatever the source layout turns out to be; the claim
      // map then keeps the name unique across ROOTS, which the registry requires.
      const dirName = claimAcrossRoots(ctx, uniqueName(ctx, wanted))
      const target = join(root, dirName)
      if (!dryRun) {
        rmSync(target, { recursive: true, force: true })
        mkdirSync(root, { recursive: true })
        cpSync(dirname(candidate.file), target, { recursive: true })
      }
      // The catalog keys on the frontmatter name, not the directory, so a renamed
      // copy must carry the new name or the registry would dedupe it away.
      let renamed = false
      if (dirName !== candidate.fields.name) renamed = renameSkillFrontmatter(join(target, 'SKILL.md'), dirName)
      const transform = normalizeCopy(dirname(candidate.file), target, pluginDir)
      installed.push({
        name: dirName,
        from: candidate.fields.name,
        tree: candidate.suffix === '' ? 'canonical' : candidate.suffix,
        source: relative(SOURCES, candidate.file).replace(/\\/g, '/'),
        renamed,
        transform,
      })
    }
  }
  return { installed, skipped }
}

/**
 * Repair the copied markdown so its relative references resolve where dsh looks.
 *
 * Every `.md` in the copy is treated, not only the top level: a skill's
 * `references/` files link onward, and ECC alone ships 3201 nested markdown
 * files of which 585 carry paths. Only the INSTALLED copy is touched, and only
 * when a reference already dangles.
 */
function normalizeCopy(sourceDir, installDir, pluginDir) {
  const totals = { files: 0, refsPinned: 0, refsUnresolved: 0, vars: 0, arguments: 0, tools: {}, changed: 0 }
  if (dryRun) return totals
  for (const target of walk(installDir, name => name.endsWith('.md'))) {
    const fileDir = dirname(target)
    // The copy mirrors the source tree, so a nested file's counterpart sits at
    // the same offset; that directory is where its own references resolve from,
    // with the skill directory and the plugin root behind it.
    const sourceFileDir = join(sourceDir, relative(installDir, fileDir))
    const original = readFileSync(target, 'utf8')
    const { text, stats } = normalizeSkillText(original, {
      installDir: fileDir,
      bases: [sourceFileDir, sourceDir, pluginDir],
      pluginDir,
    })
    totals.files += 1
    totals.refsPinned += stats.refsPinned.length
    totals.refsUnresolved += stats.refsUnresolved.length
    totals.vars += stats.vars
    totals.arguments += stats.arguments
    for (const [tool, count] of Object.entries(stats.tools)) totals.tools[tool] = (totals.tools[tool] ?? 0) + count
    if (text !== original) {
      writeFileSync(target, text, 'utf8')
      totals.changed += 1
    }
  }
  return totals
}

/** Fold the per-skill transform stats into one row for the report and the summary. */
function aggregateTransform(installed) {
  const total = { files: 0, refsPinned: 0, refsUnresolved: 0, vars: 0, arguments: 0, tools: {}, changed: 0 }
  for (const skill of installed) {
    const stats = skill.transform
    if (stats === undefined) continue
    total.files += stats.files
    total.refsPinned += stats.refsPinned
    total.refsUnresolved += stats.refsUnresolved
    total.vars += stats.vars
    total.arguments += stats.arguments
    total.changed += stats.changed
    for (const [tool, count] of Object.entries(stats.tools)) total.tools[tool] = (total.tools[tool] ?? 0) + count
  }
  return total
}

function hooksOf(pluginDir) {
  const candidates = [join(pluginDir, 'hooks', 'hooks.json'), join(pluginDir, 'hooks.json')]
  return candidates.filter(candidate => existsSync(candidate))
}

function main() {
  const repos = requested()
  if (repos.length === 0) {
    throw new Error(`no repositories given and ${LIST} is absent/empty — pass URLs or write one per line`)
  }

  const report = { generatedAt: new Date().toISOString(), dryRun, repositories: [] }
  const mcpRows = []
  const hookRows = []

  for (const repo of repos) {
    const entry = { repo, plugins: [] }
    let repoDir
    try {
      repoDir = dryRun ? join(SOURCES, slugOf(repo)) : fetch(repo)
    } catch (error) {
      entry.error = `fetch failed: ${error.message.split('\n')[0]}`
      report.repositories.push(entry)
      continue
    }

    const found = pluginsOf(repoDir, slugOf(repo))
    entry.marketplace = found.marketplace
    entry.marketplaceFile = found.source
    if (found.error !== undefined) entry.error = found.error

    const real = found.plugins.filter(plugin => plugin.skipped === undefined && plugin.dir !== undefined)
    // One root per repository whenever the repository ships a SINGLE plugin —
    // even when that plugin's source is a subdirectory (`source: "./plugin"`,
    // as agentmemory declares). Discovery reads only a root's immediate
    // children, so a second root for the same repository would duplicate every
    // skill it already contributed. Several plugins in one repository do need
    // separate roots, because their skill names would otherwise collide.
    const single = real.length === 1

    for (const plugin of found.plugins) {
      if (plugin.skipped !== undefined) {
        entry.plugins.push({ name: plugin.name, skipped: plugin.skipped })
        continue
      }
      const pluginSlug = skillSlug(plugin.name)
      const root = single
        ? join(SKILLS_ROOT, `cc-${slugOf(repo)}`)
        : join(SKILLS_ROOT, `cc-${slugOf(repo)}__${pluginSlug}`)

      // The compiled `cmd-*` / `agent-*` directories are this toolchain's, so a
      // re-run clears them; copied skills are refreshed by the copy itself.
      if (!dryRun && existsSync(root)) {
        for (const child of readdirSync(root, { withFileTypes: true })) {
          if (child.isDirectory() && (child.name.startsWith('cmd-') || child.name.startsWith('agent-'))) {
            rmSync(join(root, child.name), { recursive: true, force: true })
          }
        }
      }

      const ctx = { repoDir, workspace: process.cwd(), names: new Set(), owner: pluginSlug }
      const metadata = pluginMetadata(plugin.dir)
      clearCopiedSkills(root)
      const skills = installSkills(plugin.dir, root, ctx)

      const commands = []
      for (const dir of walkDirs(plugin.dir, 'commands')) {
        for (const file of readdirSync(dir).filter(name => name.endsWith('.md'))) {
          commands.push(relative(root, compileCommand(join(dir, file), root, ctx)).replace(/\\/g, '/'))
        }
      }

      const agents = []
      for (const dir of walkDirs(plugin.dir, 'agents')) {
        for (const file of readdirSync(dir).filter(name => name.endsWith('.md'))) {
          agents.push(relative(root, compileAgent(join(dir, file), root, ctx)).replace(/\\/g, '/'))
        }
      }

      const invocation = applyInvocationPolicy(root)

      const mcp = []
      for (const file of walk(plugin.dir, name => name === 'mcp.json' || name === '.mcp.json')) {
        mcp.push(compileMcp(file, mcpRows))
      }

      const hooks = []
      for (const file of hooksOf(plugin.dir)) {
        const id = `hooks-${pluginSlug}`
        if (hookRows.some(row => row.id === id)) continue
        // The SOURCE hooks.json is never what the host reads: its matchers name
        // Claude Code tools and its commands spawn a child dsh's shell refuses.
        // The derived file is the artifact dsh mounts.
        const derived = join(HOOK_DIR, `${pluginSlug}.json`)
        if (!dryRun) mkdirSync(HOOK_DIR, { recursive: true })
        const hookStats = generateHooksFile(file, plugin.dir, HOOK_SHIM, dryRun ? undefined : derived)
        hookRows.push({
          id,
          name: '@deepseek-ai/dsh-hooks-claude-code',
          config: { configPath: derived, pluginRoot: plugin.dir },
        })
        hooks.push({
          id,
          source: relative(SOURCES, file).replace(/\\/g, '/'),
          derived: relative(COMPAT, derived).replace(/\\/g, '/'),
          events: hookStats.events,
          rewritten: hookStats.rewritten,
          direct: hookStats.direct,
          matchers: hookStats.matchers,
          droppedEvents: hookStats.droppedEvents,
          unmappedCommands: hookStats.unmappedCommands,
          error: hookStats.error,
        })
      }

      entry.plugins.push({
        name: plugin.name,
        manifest: metadata.path,
        version: metadata.manifest.version,
        root,
        implicit: plugin.implicit === true,
        skills: skills.installed.length,
        renamedSkills: skills.installed.filter(skill => skill.renamed).map(skill => `${skill.from} -> ${skill.name}`),
        skippedSkills: skills.skipped.length,
        skippedSkillSamples: skills.skipped.slice(0, 20),
        transform: aggregateTransform(skills.installed),
        commands: commands.length,
        agents: agents.length,
        invocation,
        mcp: mcp.length,
        hooks,
      })
    }
    report.repositories.push(entry)
  }

  const mcpText = renderInsertFragment(mcpRows, [
    'Generated by cc-compat/plugin-install.mjs from Claude Code plugin manifests.',
    'One `insert` list, because each row ADDS a plugin: a bare top-level',
    '`- id: <name>` is an id-targeted override and the loader drops it with',
    '`patch: entry "<name>" not found` when no such row exists yet.',
  ])
  const hookText = renderInsertFragment(hookRows, [
    'Generated by cc-compat/plugin-install.mjs from Claude Code `hooks/*.json`.',
    'These rows run the plugin\'s own command hooks through dsh-hooks-claude-code,',
    'which maps SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Stop.',
    'Hooks fire on live turns, so remove this list from the profile patch to',
    'disable them without losing the plugin\'s skills, commands, or agents.',
  ])

  if (!dryRun) {
    writeFileSync(MCP_FRAGMENT, mcpText, 'utf8')
    writeFileSync(HOOK_FRAGMENT, hookText, 'utf8')
    report.mcpRows = mcpRows.map(row => row.id)
    report.hookRows = hookRows.map(row => row.id)
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  if (reloadRequested && !dryRun) reloadHooks()

  let totalSkills = 0
  let totalCommands = 0
  let totalAgents = 0
  for (const entry of report.repositories) {
    console.log(`${entry.repo}${entry.marketplace === undefined ? '' : ` [marketplace: ${entry.marketplace}]`}`)
    if (entry.error !== undefined) {
      console.log(`  ERROR ${entry.error}`)
      continue
    }
    for (const plugin of entry.plugins) {
      if (plugin.skipped !== undefined) {
        console.log(`  ${plugin.name}: skipped (${plugin.skipped})`)
        continue
      }
      totalSkills += plugin.skills
      totalCommands += plugin.commands
      totalAgents += plugin.agents
      console.log(`  ${plugin.name}${plugin.implicit === true ? ' (implicit)' : ''}: ${plugin.skills} skills, ${plugin.commands} commands, ${plugin.agents} agents, ${plugin.mcp} mcp, ${plugin.hooks.length} hooks`)
      console.log(`    root: ${plugin.root}`)
      if (plugin.renamedSkills.length > 0) {
        console.log(`    renamed ${plugin.renamedSkills.length} illegal skill name(s): ${plugin.renamedSkills.slice(0, 5).join(', ')}${plugin.renamedSkills.length > 5 ? ', …' : ''}`)
      }
      if (plugin.skippedSkills > 0) console.log(`    skipped ${plugin.skippedSkills} skill file(s) without name/description`)
      const t = plugin.transform
      if (t !== undefined && t.changed > 0) {
        const tools = Object.values(t.tools).reduce((sum, value) => sum + value, 0)
        console.log(`    normalized ${t.changed}/${t.files} file(s): ${t.refsPinned} refs pinned, ${t.refsUnresolved} unresolved, ${t.vars} vars, ${t.arguments} $ARGUMENTS, ${tools} tool names`)
        if (t.refsUnresolved > 0) console.log(`      WARNING: ${t.refsUnresolved} reference(s) could not be resolved anywhere`)
      }
      for (const hook of plugin.hooks) {
        if (hook.error !== undefined) {
          console.log(`    hook ${hook.id}: ERROR ${hook.error}`)
          continue
        }
        const events = Object.entries(hook.events ?? {}).map(([name, count]) => `${name}×${count}`).join(', ')
        console.log(`    hook ${hook.id}: ${hook.rewritten} via shim, ${hook.direct} direct -> ${hook.derived}`)
        console.log(`      events: ${events || '(none)'}`)
        if ((hook.droppedEvents ?? []).length > 0) console.log(`      dropped (no dsh extension point): ${hook.droppedEvents.join(', ')}`)
        if ((hook.matchers ?? []).length > 0) console.log(`      matchers: ${[...new Set(hook.matchers)].join('; ')}`)
        if ((hook.unmappedCommands ?? []).length > 0) console.log(`      UNMAPPED: ${hook.unmappedCommands.length} command(s)`)
      }
    }
  }
  console.log(`totals: ${totalSkills} skills, ${totalCommands} commands, ${totalAgents} agents`)
  console.log(`mcp rows: ${mcpRows.length} -> ${MCP_FRAGMENT}`)
  console.log(`hook rows: ${hookRows.length} -> ${HOOK_FRAGMENT}`)
}

/** Synchronous pause for the two-phase patch toggle below. */
function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Unmount and remount the generated hook rows so the bridge re-reads them.
 *
 * The hook bridge loads its config ONCE, when the plugin mounts, so a
 * regenerated `generated-hooks/<plugin>.json` is ignored until the rows are
 * removed and added again. The profile patch is watched and reconciled live, so
 * that toggle reloads the plugin without restarting the host.
 *
 * Opt-in (`--reload-hooks`), because an install must not rewrite a user
 * composition on its own — the rows only ever go back exactly as they were.
 */
const HOOK_MARKER = '# Plugin hooks, generated by cc-compat/plugin-install.mjs'

function reloadHooks() {
  const profilesDir = join(DSH_HOME, 'profiles')
  let files
  try {
    files = readdirSync(profilesDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(profilesDir, entry.name, 'cordis.patch.yml'))
      .filter(file => existsSync(file))
  } catch {
    console.log('--reload-hooks: no profiles directory; nothing to reload')
    return
  }
  let touched = 0
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    const index = content.indexOf(HOOK_MARKER)
    if (index === -1) continue
    const head = content.slice(0, index)
    const block = content.slice(index)
    writeFileSync(file, head, 'utf8')
    sleepMs(5000)
    writeFileSync(file, head + block, 'utf8')
    sleepMs(5000)
    touched += 1
    console.log(`reloaded hook config: ${file}`)
  }
  if (touched === 0) {
    console.log('--reload-hooks: no profile patch carries the generated hook rows; nothing to reload')
  }
}

main()