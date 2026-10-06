// Additive profile-patch composition for the DSH portable stack.
//
// The profile's `cordis.patch.yml` is assembled from one block per feature
// layer, each delimited by BEGIN/END markers. Re-running the installer replaces
// the blocks it manages and leaves everything else — text the operator wrote,
// blocks from a layer that is still installed — exactly as it was.
//
//   node tools/compose-patch.mjs --profile-dir <dir> <patchFile> [<patchFile>...]
//   node tools/compose-patch.mjs --profile-dir <dir> --list
//
// A patch file may be named by path or by its file name, in which case it is
// searched for next to the profile patch, in the stack template directory, and
// under `$DSH_HOME/cc-compat`.
//
// IDEMPOTENCE is the whole point of this file, so it is enforced by structure
// rather than by patches of string surgery. The earlier version stripped only
// the FIRST occurrence of a key, so a file that had accumulated a second block
// for the same key kept it and the next run nested a fresh block inside the old
// one: the file grew on every run. This version parses the file into segments
// first, which leaves no "first occurrence" to get wrong.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const STACK_ROOT = resolve(HERE, '..')
const DSH_HOME = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')

const MARKER_START = '# >>> dsh-stack:'
const MARKER_END = '# <<< dsh-stack:'

/** Parsed command line. */
function parseArgv(argv) {
  const profileAt = argv.indexOf('--profile-dir')
  if (profileAt === -1 || argv[profileAt + 1] === undefined) {
    throw new Error('compose-patch: --profile-dir <dir> is required')
  }
  const rest = argv.filter((_, index) => index !== profileAt && index !== profileAt + 1)
  return {
    profileDir: resolve(argv[profileAt + 1]),
    listOnly: rest.includes('--list'),
    patches: rest.filter(arg => !arg.startsWith('--')),
  }
}

/**
 * Resolve one requested patch file to an absolute path, or throw.
 *
 * Order matters and is not an accident: the stack's own template directory is
 * searched BEFORE the profile. The installer passes bare file names, and a
 * profile that has already been composed contains a file with the same name —
 * resolving to it would feed the composer its own previous output, which is
 * how a patch file grows on every run. Templates come from the repository;
 * only generated fragments (always passed as absolute paths) live elsewhere.
 * @param request - a file name or an absolute path.
 * @param profileDir - the profile being composed.
 * @returns the absolute path of an existing file.
 */
function resolvePatch(request, profileDir) {
  const candidates = isAbsolute(request)
    ? [request]
    : [
      join(STACK_ROOT, 'home', 'profiles', 'web', request),
      join(DSH_HOME, 'cc-compat', request),
      join(STACK_ROOT, 'cc-compat', request),
      join(profileDir, request),
    ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`compose-patch: cannot find patch ${JSON.stringify(request)}\n  looked in:\n    ${candidates.join('\n    ')}`)
}

/** The marker key for one patch file: its basename, so re-runs replace themselves. */
function markerKey(patchPath) {
  return patchPath.replace(/\\/g, '/').split('/').pop()
}

/**
 * Reject a file that is not an entry list before it lands inside a composed
 * patch file. Leading comment lines and blank lines are skipped: the cc-compat
 * generator prefixes its fragments with an explanation, and those fragments are
 * entry lists. The first line that is neither decides.
 * @param text - the candidate patch file contents.
 * @returns true when the body starts a YAML sequence.
 */
function looksLikeEntryList(text) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    return trimmed.startsWith('-') || trimmed.startsWith('[')
  }
  return false
}

/**
 * Split a composed patch file into the text before the first block and one
 * entry per managed block.
 *
 * Only the segment before the first marker is kept as head text. Text BETWEEN
 * blocks is deliberately dropped: with a tokenizer that is the only honest
 * choice — a segment between two blocks cannot be attributed to either one, and
 * re-emitting it on every run is how a file grows without bound. Blocks
 * themselves are always preserved, so no composed content is ever lost.
 *
 * An unterminated marker is a hard error: silently discarding the tail of
 * someone's patch file is worse than refusing to run.
 * @param text - the current file contents.
 * @returns the head lines and the blocks in file order.
 */
function parseBlocks(text) {
  const lines = text.split(/\r?\n/)
  const head = []
  const blocks = []
  let at = 0
  while (at < lines.length && !lines[at].startsWith(MARKER_START)) {
    head.push(lines[at])
    at += 1
  }
  while (at < lines.length) {
    const startMatch = new RegExp(`^${MARKER_START}\\s*(.+?)\\s*$`).exec(lines[at])
    if (startMatch === null) {
      // Text between blocks: skipped, see the doc comment.
      at += 1
      continue
    }
    const key = startMatch[1]
    const body = []
    at += 1
    for (;;) {
      if (at >= lines.length) throw new Error(`compose-patch: block "${key}" has a start marker with no end marker`)
      if (new RegExp(`^${MARKER_END}\\s*(.+?)\\s*$`).test(lines[at])) {
        at += 1
        break
      }
      body.push(lines[at])
      at += 1
    }
    blocks.push({ key, body: body.join('\n') })
  }
  return { head, blocks }
}

/** One marker-delimited block, exactly as it is written to the file. */
function renderBlock(key, body) {
  return [
    `${MARKER_START} ${key}`,
    '# Managed by dsh-stack/install. Edit the source file, not this block:',
    `# ${key}`,
    body.replace(/\s*$/, ''),
    `${MARKER_END} ${key}`,
  ].join('\n')
}

/** The `id:` values a block declares, at any indentation. */
function blockIds(body) {
  return [...body.matchAll(/^[ \t]*-[ \t]+id:[ \t]*(\S+)/gm)].map(match => match[1].replace(/^['"]|['"]$/g, ''))
}

/** Leading whitespace width, used to decide which lines belong to a row. */
function indentOf(line) {
  return line.length - line.trimStart().length
}

/**
 * Resolve an id several blocks declare: the LAST block that names it wins, and
 * the earlier declarations of that row are removed — the whole entry, not just
 * the `- id:` line.
 *
 * The layers legitimately overlap: the generated cc hook fragment re-declares
 * rows the cc-compat template already names, and the optional layer names rows
 * the generated MCP fragment also names. Appending all of them verbatim leaves
 * the same row in the file up to five times — harmless to the loader (patches
 * apply in order), hostile to whoever has to read or change it next. Order is
 * preserved, so the resolution is deterministic.
 * @param blocks - the composed blocks in application order.
 * @returns the same blocks with duplicate rows removed from earlier ones.
 */
function dedupeAcrossBlocks(blocks) {
  const owner = new Map()
  blocks.forEach((block, index) => {
    for (const id of blockIds(block.body)) owner.set(id, index)
  })
  const dropped = []
  const resolved = blocks.map((block, index) => {
    const lines = block.body.split(/\r?\n/)
    const kept = []
    let at = 0
    while (at < lines.length) {
      const match = /^([ \t]*-[ \t]+id:[ \t]*)(\S+)(.*)$/.exec(lines[at])
      if (match === null || owner.get(match[2].replace(/^['"]|['"]$/g, '')) === index) {
        kept.push(lines[at])
        at += 1
        continue
      }
      const headerIndent = indentOf(lines[at])
      dropped.push(`${match[2]} (from ${block.key})`)
      at += 1
      while (at < lines.length && lines[at].trim() !== '' && indentOf(lines[at]) > headerIndent) at += 1
    }
    return { key: block.key, body: kept.join('\n') }
  })
  if (dropped.length > 0) {
    console.log(`compose-patch: resolved ${dropped.length} duplicate row id(s): ${dropped.join(', ')}`)
  }
  return resolved
}

function main() {
  const { profileDir, listOnly, patches } = parseArgv(process.argv.slice(2))
  const target = join(profileDir, 'cordis.patch.yml')

  if (patches.length === 0) {
    if (!listOnly) throw new Error('compose-patch: no patch files given')
    console.log(`compose-patch: profile ${target}`)
    if (!existsSync(target)) {
      console.log('  (no profile patch yet)')
      return
    }
    const { blocks } = parseBlocks(readFileSync(target, 'utf8'))
    console.log(blocks.length === 0 ? '  (no managed blocks)' : blocks.map(block => `  ${block.key}`).join('\n'))
    return
  }

  const existing = existsSync(target)
    ? parseBlocks(readFileSync(target, 'utf8'))
    : { head: ['[]'], blocks: [] }

  const requested = []
  for (const request of patches) {
    const patchPath = resolvePatch(request, profileDir)
    const body = readFileSync(patchPath, 'utf8')
    if (!looksLikeEntryList(body)) {
      throw new Error(`compose-patch: ${patchPath} does not start a YAML list, so it cannot be composed into a patch file`)
    }
    requested.push({ key: markerKey(patchPath), body })
  }
  const touched = new Set(requested.map(block => block.key))
  const required = new Set(requested.map(block => block.key))
  // Blocks we were not asked about belong to layers that are still installed;
  // they keep their place and their contents. A key we ARE about to write is
  // dropped here even if it appears several times — which is how a file that
  // already grew a duplicate heals on the next run instead of keeping it.
  const kept = []
  const seen = new Set()
  for (const block of existing.blocks) {
    if (required.has(block.key) || seen.has(block.key)) continue
    seen.add(block.key)
    kept.push({ key: block.key, body: block.body })
  }

  const rendered = dedupeAcrossBlocks([...kept, ...requested])
  const headText = existing.head.join('\n').replace(/\s*$/, '')
  const text = `${headText.trim() === '' ? '[]' : headText}\n\n${rendered.map(block => renderBlock(block.key, block.body)).join('\n\n')}\n`

  mkdirSync(profileDir, { recursive: true })
  if (existsSync(target)) copyFileSync(target, `${target}.bak-dsh-stack`)
  writeFileSync(target, text, 'utf8')
  console.log(`compose-patch: ${requested.map(block => block.key).join(', ')} -> ${target}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
