#!/usr/bin/env node
/**
 * Sync the DESIGN.md collection from VoltAgent/awesome-design-md into this skill
 * and regenerate the local catalog (`references/catalog.json` + `references/INDEX.md`).
 *
 * Usage:
 *   node scripts/sync-upstream.mjs                    # clone/pull upstream into a temp dir
 *   node scripts/sync-upstream.mjs --source <dir>     # use an existing local clone
 *   node scripts/sync-upstream.mjs --dry-run          # report, write nothing
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_URL = 'https://github.com/VoltAgent/awesome-design-md.git'
const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const args = { source: undefined, dryRun: false, keepClone: false }
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--source') args.source = argv[++i]
    else if (value === '--dry-run') args.dryRun = true
    else if (value === '--keep-clone') args.keepClone = true
    else if (value === '--help' || value === '-h') {
      process.stdout.write('usage: node scripts/sync-upstream.mjs [--source <dir>] [--dry-run] [--keep-clone]\n')
      process.exit(0)
    }
    else throw new Error(`unknown argument: ${value}`)
  }
  return args
}

/** Return the frontmatter of a DESIGN.md as a flat string map. */
function frontmatter(source) {
  const lines = source.split(/\r?\n/)
  if (lines[0] !== '---') return {}
  const end = lines.indexOf('---', 1)
  if (end < 0) return {}
  const fields = {}
  for (const line of lines.slice(1, end)) {
    const match = /^([a-z][a-z0-9-]*):\s*(.*)$/.exec(line)
    if (match) fields[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  return fields
}

/** Parse the `## Collection` section of the upstream README into catalog entries. */
function parseReadmeCollection(readme) {
  const entries = []
  let category
  let inCollection = false
  for (const line of readme.split(/\r?\n/)) {
    if (/^##\s/.test(line)) {
      inCollection = /^##\s+Collection\s*$/.test(line)
      category = undefined
      continue
    }
    if (!inCollection) continue
    const heading = /^###\s+(.+?)\s*$/.exec(line)
    if (heading) {
      category = heading[1].trim()
      continue
    }
    const bullet = /^-\s+\[\*\*(.+?)\*\*\]\((https?:\/\/\S+?)\)\s*(?:-\s*(.*))?$/.exec(line)
    if (bullet) {
      const slug = /getdesign\.md\/([^/]+)\//.exec(bullet[2])?.[1]
      entries.push({
        name: bullet[1],
        slug: slug ?? undefined,
        category: category ?? 'Uncategorized',
        description: (bullet[3] ?? '').trim(),
        url: bullet[2],
      })
    }
  }
  return entries
}

function cloneUpstream() {
  const target = join(tmpdir(), `awesome-design-md-${process.pid}`)
  rmSync(target, { recursive: true, force: true })
  process.stdout.write(`cloning ${REPO_URL} ...\n`)
  execFileSync('git', ['clone', '--depth', '1', REPO_URL, target], { stdio: 'inherit' })
  return target
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const managedClone = args.source === undefined
  const source = resolve(args.source ?? cloneUpstream())
  const collectionDir = join(source, 'design-md')
  if (!existsSync(collectionDir)) throw new Error(`no design-md folder in ${source}`)

  const readme = readFileSync(join(source, 'README.md'), 'utf8')
  const listed = parseReadmeCollection(readme)
  const bySlug = new Map()
  for (const entry of listed) if (entry.slug) bySlug.set(entry.slug, entry)

  const slugs = readdirSync(collectionDir).filter(name => statSync(join(collectionDir, name)).isDirectory()).sort()
  const catalog = []
  const assetsDir = join(SKILL_ROOT, 'design-md')

  for (const slug of slugs) {
    const file = join(collectionDir, slug, 'DESIGN.md')
    if (!existsSync(file)) continue
    const source1 = readFileSync(file, 'utf8')
    const fields = frontmatter(source1)
    const entry = bySlug.get(slug)
    const frontmatterName = fields.name?.replace(/-Inspired-design-analysis$/i, ' (inspired analysis)')
    catalog.push({
      slug,
      name: entry?.name ?? frontmatterName ?? slug,
      category: entry?.category ?? 'Weitere (noch nicht im README gelistet)',
      description: entry?.description || fields.description || '',
      url: entry?.url ?? `https://getdesign.md/${slug}/design-md`,
      path: `design-md/${slug}/DESIGN.md`,
      lines: source1.split('\n').length,
    })
    if (!args.dryRun) {
      mkdirSync(join(assetsDir, slug), { recursive: true })
      cpSync(file, join(assetsDir, slug, 'DESIGN.md'))
    }
  }

  catalog.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))

  if (!args.dryRun) {
    mkdirSync(join(SKILL_ROOT, 'references'), { recursive: true })
    writeFileSync(join(SKILL_ROOT, 'references', 'catalog.json'), `${JSON.stringify({
      source: REPO_URL,
      syncedAt: new Date().toISOString(),
      count: catalog.length,
      entries: catalog,
    }, undefined, 2)}\n`)
    writeFileSync(join(SKILL_ROOT, 'references', 'INDEX.md'), renderIndex(catalog))
  }

  if (managedClone && !args.keepClone) rmSync(source, { recursive: true, force: true })
  process.stdout.write(`${args.dryRun ? '[dry-run] ' : ''}${catalog.length} DESIGN.md files -> ${assetsDir}\n`)
  for (const entry of catalog) {
    if (!bySlug.has(entry.slug)) process.stdout.write(`note: ${entry.slug} is not listed in upstream README\n`)
  }
}

function renderIndex(catalog) {
  const lines = [
    '# DESIGN.md catalog',
    '',
    `Offline copy of every DESIGN.md from [VoltAgent/awesome-design-md](${REPO_URL})`,
    `(${catalog.length} design systems). Regenerate with \`node scripts/sync-upstream.mjs\`.`,
    '',
    'Local file for every entry: `design-md/<slug>/DESIGN.md`.',
    '',
  ]
  let category
  for (const entry of catalog) {
    if (entry.category !== category) {
      category = entry.category
      lines.push(`## ${category}`, '')
    }
    const description = entry.description.length > 0 ? ` — ${entry.description}` : ''
    lines.push(`- **${entry.name}** (\`${entry.slug}\`)${description}`, `  - \`${entry.path}\` · <${entry.url}>`)
  }
  lines.push('')
  return lines.join('\n')
}

main()
