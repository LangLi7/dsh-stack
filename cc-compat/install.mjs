// Claude-Code compatibility installer for DeepSeek Harness.
//
// Fetches CC-style repositories, discovers the artifacts the harness already
// understands (SKILL.md skills, CC plugin manifests, hooks, MCP manifests),
// mirrors the skills into a dsh skills root, and reports what it installed,
// what it skipped, and which roots still need wiring into `customSkillDirs`.
//
//   node install.mjs                 # install every configured repository
//   node install.mjs --dry           # discover and report, write nothing
//   node install.mjs --only <owner/repo>
//
// Requires `git` on PATH and network access for the first fetch.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { homedir } from 'node:os'

/** Repositories to install, in the order their skills should rank. */
const REPOSITORIES = [
  'Imbad0202/academic-research-skills',
  'SnailSploit/claude-red',
  'mukul975/anthropic-cybersecurity-skills',
  'K-Dense-AI/scientific-agent-skills',
  'rohitg00/agentmemory',
  'cathrynlavery/diagram-design',
]

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const SOURCES = join(DSH_HOME, 'cc-sources')
const SKILLS_ROOT = join(DSH_HOME, 'skills')
const REPORT = join(SOURCES, 'install-report.json')

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry')
const onlyAt = argv.indexOf('--only')
const only = onlyAt === -1 ? undefined : argv[onlyAt + 1]

/** Run git and fail loudly with its own output. */
function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim().slice(0, 400)}`)
  }
  return result.stdout
}

/** Directory name for one clone, so two owners cannot collide. */
function slugOf(repo) {
  return repo.replace('/', '__')
}

/** Clone if absent, otherwise refresh shallowly; an offline machine keeps its copy. */
function fetch(repo) {
  const target = join(SOURCES, slugOf(repo))
  if (existsSync(join(target, '.git'))) {
    if (!dryRun) {
      try {
        git(['fetch', '--depth', '1', 'origin', 'HEAD'], target)
        git(['reset', '--hard', 'FETCH_HEAD'], target)
      } catch (error) {
        console.warn(`  refetch failed, keeping the existing checkout: ${error.message}`)
      }
    }
    return target
  }
  if (dryRun) return target
  mkdirSync(SOURCES, { recursive: true })
  git(['clone', '--depth', '1', '--quiet', `https://github.com/${repo}.git`, target])
  return target
}

/** Every file named `SKILL.md` under one tree, skipping VCS and dependency noise. */
function findSkillFiles(root, found = []) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) findSkillFiles(path, found)
    else if (entry.name === 'SKILL.md') found.push(path)
  }
  return found
}

/** Minimal YAML frontmatter reader: the two keys the harness requires. */
function readFrontmatter(path) {
  // Windows checkouts are CRLF, and JavaScript's `.` never matches `\r`, so a
  // CRLF frontmatter looks like it has no `name:` at all. Normalize first.
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!text.startsWith('---')) return { error: 'missing YAML frontmatter' }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { error: 'unterminated YAML frontmatter' }
  const fields = {}
  for (const line of text.slice(3, end).split('\n')) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line)
    if (match === null) continue
    fields[match[1]] = match[2].replace(/^["']|["']$/g, '').trim()
  }
  if (fields.name === undefined || fields.name === '') return { error: 'frontmatter requires a name' }
  if (fields.description === undefined || fields.description === '') return { error: 'frontmatter requires a description' }
  return { fields }
}

/** CC plugin manifests and the artifact folders / files a CC plugin may carry. */
function findArtifacts(root, out = { manifests: [], commandDirs: [], agentDirs: [], hookFiles: [], mcpFiles: [] }) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'commands') out.commandDirs.push(path)
      else if (entry.name === 'agents') out.agentDirs.push(path)
      else findArtifacts(path, out)
      continue
    }
    if (entry.name === 'plugin.json' || entry.name === 'marketplace.json') out.manifests.push(path)
    else if (entry.name === 'hooks.json') out.hookFiles.push(path)
    else if (entry.name === '.mcp.json' || entry.name === 'mcp.json') out.mcpFiles.push(path)
  }
  return out
}

/**
 * The skill-filesystem provider discovers a root's IMMEDIATE children only: a
 * directory holding `SKILL.md`, or a flat `.md` file. A skill therefore has to
 * sit directly under its root, which is why every repository gets its own root
 * (`cc-<owner>__<repo>`) instead of one shared tree.
 */
function rootFor(repo) {
  return join(SKILLS_ROOT, `cc-${slugOf(repo)}`)
}

/** Copy one skill directory into its repository root under its own name. */
function installSkill(skillFile, repoSlug, name) {
  const source = dirname(skillFile)
  const target = join(SKILLS_ROOT, `cc-${repoSlug}`, name)
  if (dryRun) return target
  rmSync(target, { recursive: true, force: true })
  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target, { recursive: true })
  return target
}

function main() {
  const repositories = only === undefined ? REPOSITORIES : REPOSITORIES.filter(repo => repo === only)
  if (repositories.length === 0) throw new Error(`no configured repository matches "${String(only)}"`)
  const report = { generatedAt: new Date().toISOString(), dryRun, repositories: [] }
  // Remove roots laid out by an earlier run, whose skills sat one level too deep
  // for the discovery rule above.
  if (!dryRun) {
    for (const repo of REPOSITORIES) {
      rmSync(join(SKILLS_ROOT, slugOf(repo)), { recursive: true, force: true })
    }
  }

  for (const repo of repositories) {
    console.log(`\n=== ${repo}`)
    let checkout
    try {
      checkout = fetch(repo)
    } catch (error) {
      console.log(`  FETCH FAILED: ${error.message}`)
      report.repositories.push({ repo, error: error.message })
      continue
    }
    if (!existsSync(checkout)) {
      console.log('  not present locally (dry run)')
      report.repositories.push({ repo, error: 'not fetched' })
      continue
    }

    const slug = slugOf(repo)
    const skillFiles = findSkillFiles(checkout)
    const installed = []
    const skipped = []
    const seen = new Set()
    for (const file of skillFiles) {
      const parsed = readFrontmatter(file)
      if (parsed.error !== undefined) {
        skipped.push({ path: relative(checkout, file), reason: parsed.error })
        continue
      }
      const name = parsed.fields.name
      // Two skills with one name would shadow each other in the catalog.
      const key = `${slug}/${name}`
      if (seen.has(key)) {
        skipped.push({ path: relative(checkout, file), reason: `duplicate skill name "${name}"` })
        continue
      }
      seen.add(key)
      installed.push({ name, path: relative(checkout, file), target: installSkill(file, slug, name) })
    }

    const artifacts = findArtifacts(checkout)
    report.repositories.push({
      repo,
      checkout,
      skillsRoot: rootFor(repo),
      skills: { found: skillFiles.length, installed: installed.length, skipped },
      pluginManifests: artifacts.manifests.map(path => relative(checkout, path)),
      commandDirs: artifacts.commandDirs.map(path => relative(checkout, path)),
      agentDirs: artifacts.agentDirs.map(path => relative(checkout, path)),
      hookFiles: artifacts.hookFiles.map(path => relative(checkout, path)),
      mcpFiles: artifacts.mcpFiles.map(path => relative(checkout, path)),
    })
    console.log(`  skills: ${installed.length} installed / ${skillFiles.length} found`)
    if (skipped.length > 0) console.log(`  skipped: ${skipped.length} (first: ${skipped[0].reason})`)
    console.log(`  cc artifacts: manifests ${artifacts.manifests.length}, commands ${artifacts.commandDirs.length}, `
      + `agents ${artifacts.agentDirs.length}, hooks ${artifacts.hookFiles.length}, mcp ${artifacts.mcpFiles.length}`)
  }

  if (!dryRun) {
    mkdirSync(dirname(REPORT), { recursive: true })
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  console.log(`\nreport: ${dryRun ? '(dry run, not written)' : REPORT}`)
  console.log('\nAdd these roots to the skill-filesystem config (customSkillDirs):')
  for (const entry of report.repositories) {
    if (entry.skillsRoot !== undefined) console.log(`  - ${entry.skillsRoot}`)
  }
}

main()
