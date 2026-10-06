#!/usr/bin/env node
/**
 * Browse and install DESIGN.md design systems from the bundled
 * VoltAgent/awesome-design-md collection.
 *
 *   node scripts/design-md.mjs list [--category <text>]
 *   node scripts/design-md.mjs categories
 *   node scripts/design-md.mjs search <term> [term...]
 *   node scripts/design-md.mjs show <slug>
 *   node scripts/design-md.mjs install <slug> [--destination <dir>] [--file DESIGN.md] [--force]
 *   node scripts/design-md.mjs verify
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG = join(SKILL_ROOT, 'references', 'catalog.json')

function loadCatalog() {
  if (!existsSync(CATALOG)) throw new Error(`catalog.json missing at ${CATALOG} - run: node scripts/sync-upstream.mjs`)
  return JSON.parse(readFileSync(CATALOG, 'utf8'))
}

function assetsPath(entry) {
  return join(SKILL_ROOT, ...entry.path.split('/'))
}

function findEntry(entries, needle) {
  const lower = needle.toLowerCase()
  return entries.find(entry => entry.slug.toLowerCase() === lower)
    ?? entries.find(entry => entry.name.toLowerCase() === lower)
    ?? entries.find(entry => entry.slug.toLowerCase().includes(lower))
    ?? entries.find(entry => entry.name.toLowerCase().includes(lower))
}

function truncate(text, width = 105) {
  return text.length > width ? `${text.slice(0, width - 3)}...` : text
}

function line(entry) {
  return `  ${entry.slug.padEnd(20)} ${truncate(entry.description)}`
}

function takeOption(argv, index, name) {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`)
  return value
}

function main() {
  const argv = process.argv.slice(2)
  const command = argv[0] ?? 'list'
  const { entries, count, source } = loadCatalog()
  const flags = new Set(argv.filter(arg => arg.startsWith('--')))

  switch (command) {
    case 'list': {
      const categoryIndex = argv.indexOf('--category')
      const filter = categoryIndex >= 0 ? takeOption(argv, categoryIndex, '--category').toLowerCase() : undefined
      const selection = filter ? entries.filter(entry => entry.category.toLowerCase().includes(filter)) : entries
      if (selection.length === 0) throw new Error(`no design system in category "${filter}" - run: categories`)
      let current
      for (const entry of selection) {
        if (entry.category !== current) {
          current = entry.category
          process.stdout.write(`\n== ${current} ==\n`)
        }
        process.stdout.write(`${line(entry)}\n`)
      }
      process.stdout.write(`\n${selection.length} of ${count} design systems.\n`)
      break
    }
    case 'categories': {
      const grouped = new Map()
      for (const entry of entries) grouped.set(entry.category, (grouped.get(entry.category) ?? 0) + 1)
      for (const [category, total] of [...grouped].sort((a, b) => a[0].localeCompare(b[0]))) {
        process.stdout.write(`${String(total).padStart(3)}  ${category}\n`)
      }
      break
    }
    case 'search': {
      const terms = argv.slice(1).filter(arg => !arg.startsWith('--')).map(term => term.toLowerCase())
      if (terms.length === 0) throw new Error('search needs at least one term')
      const hits = entries.filter((entry) => {
        const haystack = `${entry.slug} ${entry.name} ${entry.category} ${entry.description}`.toLowerCase()
        return terms.every(term => haystack.includes(term))
      })
      process.stdout.write(`${hits.length} match(es) for "${terms.join(' ')}":\n`)
      for (const entry of hits.sort((a, b) => a.category.localeCompare(b.category))) process.stdout.write(`${line(entry)}\n`)
      break
    }
    case 'show': {
      const entry = findEntry(entries, argv[1] ?? '')
      if (!entry) throw new Error(`unknown design system "${argv[1]}" - try: search <term> | list`)
      if (flags.has('--path')) {
        process.stdout.write(`${assetsPath(entry)}\n`)
        break
      }
      process.stdout.write(`# ${entry.name} [${entry.slug}] - ${entry.category}\n# ${entry.url}\n# ${assetsPath(entry)}\n\n`)
      process.stdout.write(readFileSync(assetsPath(entry), 'utf8'))
      break
    }
    case 'install': {
      const entry = findEntry(entries, argv[1] ?? '')
      if (!entry) throw new Error(`unknown design system "${argv[1]}" - try: search <term> | list`)
      const destIndex = argv.indexOf('--destination')
      const fileIndex = argv.indexOf('--file')
      const destination = resolve(destIndex >= 0 ? takeOption(argv, destIndex, '--destination') : '.')
      const fileName = fileIndex >= 0 ? takeOption(argv, fileIndex, '--file') : 'DESIGN.md'
      const target = join(destination, fileName)
      if (existsSync(target) && !flags.has('--force')) {
        throw new Error(`${target} already exists - read it first, then pass --force to overwrite`)
      }
      mkdirSync(destination, { recursive: true })
      copyFileSync(assetsPath(entry), target)
      process.stdout.write(`installed ${entry.name} -> ${target}\n`)
      process.stdout.write('next: tell your agent to build UI that follows DESIGN.md\n')
      break
    }
    case 'verify': {
      const missing = entries.filter(entry => !existsSync(assetsPath(entry)))
      if (missing.length > 0) {
        process.stdout.write(`FAIL: ${missing.length} of ${count} DESIGN.md files are missing:\n`)
        for (const entry of missing) process.stdout.write(`  ${entry.slug}\n`)
        process.exit(1)
      }
      process.stdout.write(`OK: all ${count} catalog entries have a local DESIGN.md.\n`)
      process.stdout.write(`source: ${source} (synced ${readFileSync(CATALOG, 'utf8').match(/"syncedAt": "([^"]+)"/)?.[1] ?? 'unknown'})\n`)
      break
    }
    default:
      const header = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]
      const usage = header.replace(/^#!.*\n/, '').replace(/^\/\*\*\n?/, '').replace(/^ \* ?/gm, '')
      process.stdout.write(`usage: node scripts/design-md.mjs <command>\n${usage}`)
      process.exit(command === 'help' || flags.has('--help') ? 0 : 1)
  }
}

try {
  main()
}
catch (error) {
  process.stderr.write(`design-md: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
