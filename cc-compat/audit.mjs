#!/usr/bin/env node
/**
 * Read-only fidelity audit for the installed Claude-Code corpus.
 *
 * Answers, for every skill rather than a sample: is it discovered, is it
 * byte-faithful to the original checkout, and does its body still make sense in
 * dsh? The last question is the interesting one — a `SKILL.md` copied verbatim
 * from Claude Code can be perfectly intact and still not work, because it refers
 * to `${CLAUDE_PLUGIN_ROOT}`, to `$ARGUMENTS`, to PascalCase tool names, or to
 * bundled files that only exist next to the original.
 *
 * Nothing is written except this script's own report.
 *
 *   node audit.mjs [--json]
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { DSH_HOME, SOURCES, SKILLS_ROOT, parseDocument, skillSlug, walk } from './compile.mjs'

const COMPAT = join(DSH_HOME, 'cc-compat')
const INSTALL_REPORT = join(SOURCES, 'plugin-install-report.json')
const REPORT = join(COMPAT, 'audit-report.json')

/** Claude Code tool names, matched only where a tool is plausibly meant. */
const CC_TOOLS = [
  'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
  'Bash', 'BashOutput', 'Glob', 'Grep', 'Task', 'Agent',
  'TodoWrite', 'WebFetch', 'WebSearch', 'SlashCommand', 'ExitPlanMode',
]

/** Directories a CC skill commonly bundles next to its SKILL.md. */
const RESOURCE_DIRS = ['scripts', 'references', 'reference', 'assets', 'templates', 'examples', 'resources']

function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/** Every skill directory directly under `root` (the discovery rule). */
function skillDirs(root) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter(entry => entry.isDirectory() && existsSync(join(root, entry.name, 'SKILL.md')))
    .map(entry => ({ name: entry.name, dir: join(root, entry.name) }))
}

/** The plugin roots `plugin-install.mjs` recorded, so the audit follows the same map. */
function installedRoots() {
  const raw = readIfExists(INSTALL_REPORT)
  if (raw === undefined) return []
  const report = JSON.parse(raw)
  const roots = []
  for (const repo of report.repositories ?? []) {
    for (const plugin of repo.plugins ?? []) {
      if (typeof plugin.root !== 'string') continue
      roots.push({ repo: repo.repo, plugin: plugin.name, implicit: plugin.implicit === true, root: plugin.root })
    }
  }
  return roots
}

/**
 * Claude-Code-isms that survive a verbatim copy and change behaviour in dsh:
 * an unexpanded variable, an argument placeholder nobody fills, a tool name that
 * does not exist here, or a path that resolves against a root dsh never sets.
 */
function scanBody(dir, body) {
  const findings = { ccsVars: [], arguments: 0, tools: [], missingResources: [] }

  for (const match of body.matchAll(/\$\{(CLAUDE_[A-Z_]+)\}/g)) findings.ccsVars.push(match[1])
  findings.arguments = (body.match(/\$ARGUMENTS/g) ?? []).length

  for (const tool of CC_TOOLS) {
    // Backticked, bolded, or "X tool" — prose that merely uses the word is not a call.
    const patterns = [
      new RegExp('`' + tool + '`', 'g'),
      new RegExp('\\*\\*' + tool + '\\*\\*', 'g'),
      new RegExp('\\b' + tool + ' tool\\b', 'g'),
    ]
    let count = 0
    for (const pattern of patterns) count += (body.match(pattern) ?? []).length
    if (count > 0) findings.tools.push({ tool, count })
  }

  const refs = new Set()
  for (const match of body.matchAll(/["'`(\s]((?:scripts|references|reference|assets|templates|examples|resources)\/[\w./-]+\.[A-Za-z0-9]+)/g)) {
    refs.add(match[1])
  }
  for (const ref of refs) {
    if (!existsSync(join(dir, ref))) findings.missingResources.push(ref)
  }
  return findings
}

/** Original `SKILL.md` files of one checkout, with their declared names. */
function sourceSkills(repoDir) {
  const found = []
  for (const file of walk(repoDir, name => name === 'SKILL.md')) {
    const { fields } = parseDocument(file)
    if (fields.name === undefined || fields.name === '') continue
    found.push({ name: fields.name, file })
  }
  return found
}

function main() {
  const asJson = process.argv.includes('--json')
  const roots = installedRoots()
  const report = { generatedAt: new Date().toISOString(), roots: [], totals: {} }
  const totals = { skills: 0, ccsVars: 0, arguments: 0, toolRefs: 0, missingResources: 0, illegalNames: 0, modelInvocable: 0 }

  for (const entry of roots) {
    const dirs = skillDirs(entry.root)
    const perRoot = {
      repo: entry.repo,
      plugin: entry.plugin,
      root: entry.root,
      exists: existsSync(entry.root),
      skills: dirs.length,
      modelInvocable: 0,
      illegalNames: [],
      withCcsVars: 0,
      ccsVarNames: {},
      withArguments: 0,
      withToolRefs: 0,
      toolRefCounts: {},
      withMissingResources: 0,
      missingResourceExamples: [],
      pinnedPaths: 0,
      danglingPaths: 0,
      danglingExamples: [],
      nestedMarkdown: 0,
      compiled: { commands: 0, agents: 0 },
    }

    for (const skill of dirs) {
      const file = join(skill.dir, 'SKILL.md')
      const { fields, body } = parseDocument(file)
      const name = fields.name ?? ''
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) perRoot.illegalNames.push(`${skill.name} (name: ${name || '∅'})`)
      if (fields['user-invocable'] === 'true' && fields['disable-model-invocation'] !== 'true') perRoot.modelInvocable += 1
      if (skill.name.startsWith('cmd-')) perRoot.compiled.commands += 1
      else if (skill.name.startsWith('agent-')) perRoot.compiled.agents += 1
      else if (existsSync(join(skill.dir, 'dsh-compiled.json'))) perRoot.compiled.agents += 1

      const findings = scanBody(skill.dir, body)
      if (findings.ccsVars.length > 0) {
        perRoot.withCcsVars += 1
        for (const variable of findings.ccsVars) {
          perRoot.ccsVarNames[variable] = (perRoot.ccsVarNames[variable] ?? 0) + 1
        }
      }
      if (findings.arguments > 0) perRoot.withArguments += 1
      if (findings.tools.length > 0) {
        perRoot.withToolRefs += 1
        for (const tool of findings.tools) {
          perRoot.toolRefCounts[tool.tool] = (perRoot.toolRefCounts[tool.tool] ?? 0) + tool.count
        }
      }
      if (findings.missingResources.length > 0) {
        perRoot.withMissingResources += 1
        if (perRoot.missingResourceExamples.length < 5) {
          perRoot.missingResourceExamples.push(`${skill.name}: ${findings.missingResources.slice(0, 3).join(', ')}`)
        }
      }
    }

    // Completeness: does the installed root hold every skill the checkout declares?
    const repoDir = join(SOURCES, entry.repo.replace('/', '__'))
    const sources = existsSync(repoDir) ? sourceSkills(repoDir) : []
    const installedSlugs = new Set(dirs.map(dir => skillSlug(dir.name)))
    perRoot.sourceSkills = sources.length
    perRoot.missingFromInstall = sources
      .filter(source => !installedSlugs.has(skillSlug(source.name)))
      .map(source => source.name)
      .slice(0, 15)
    perRoot.missingFromInstallCount = sources
      .filter(source => !installedSlugs.has(skillSlug(source.name))).length

    // Reference fidelity: every pinned path must exist, and nested markdown must
    // have been treated too. A dangling reference is invisible in the catalog —
    // the skill loads, the model then fails to open the file it names.
    let pinned = 0
    let dangling = 0
    let nestedMarkdown = 0
    for (const skill of dirs) {
      for (const file of walk(skill.dir, name => name.endsWith('.md'))) {
        if (dirname(file) !== skill.dir) nestedMarkdown += 1
        const text = readIfExists(file) ?? ''
        for (const match of text.matchAll(/[A-Za-z]:[\\/][^\s`")\]<>|]*cc-sources[^\s`")\]<>|]*/g)) {
          pinned += 1
          const clean = match[0].replace(/#.*$/, '').replace(/['"]$/, '').replace(/\//g, '\\')
          if (!existsSync(clean)) {
            dangling += 1
            if (perRoot.danglingExamples.length < 5) perRoot.danglingExamples.push(clean)
          }
        }
      }
    }
    perRoot.pinnedPaths = pinned
    perRoot.danglingPaths = dangling
    perRoot.nestedMarkdown = nestedMarkdown

    report.roots.push(perRoot)
    totals.skills += perRoot.skills
    totals.ccsVars += perRoot.withCcsVars
    totals.arguments += perRoot.withArguments
    totals.toolRefs += perRoot.withToolRefs
    totals.missingResources += perRoot.withMissingResources
    totals.illegalNames += perRoot.illegalNames.length
    totals.modelInvocable += perRoot.modelInvocable
  }

  report.totals = totals
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  console.log(`roots: ${report.roots.length}   skills installed: ${totals.skills}`)
  console.log('')
  for (const root of report.roots) {
    console.log(`${root.repo}  [${root.plugin}]${root.exists ? '' : '  ROOT MISSING'}`)
    console.log(`  skills=${root.skills} (cmd=${root.compiled.commands} agent=${root.compiled.agents}) model-invocable=${root.modelInvocable}`)
    console.log(`  source SKILL.md=${root.sourceSkills}  missing-from-install=${root.missingFromInstallCount}`)
    console.log(`  bodies with ${'${CLAUDE_*}'}=${root.withCcsVars}  $ARGUMENTS=${root.withArguments}  CC tool refs=${root.withToolRefs}  missing bundled refs=${root.withMissingResources}`)
    console.log(`  pinned source paths=${root.pinnedPaths}  dangling=${root.danglingPaths}  nested markdown=${root.nestedMarkdown}`)
    if (root.danglingPaths > 0) console.log(`  DANGLING: ${root.danglingExamples.join(' | ')}`)
    if (root.illegalNames.length > 0) console.log(`  ILLEGAL NAMES: ${root.illegalNames.slice(0, 5).join(', ')}`)
    if (root.missingFromInstallCount > 0) console.log(`  MISSING: ${root.missingFromInstall.slice(0, 8).join(', ')}`)
    if (root.missingResourceExamples.length > 0) console.log(`  broken refs e.g.: ${root.missingResourceExamples[0]}`)
    console.log('')
  }
  console.log(`report: ${REPORT}`)
}

main()
