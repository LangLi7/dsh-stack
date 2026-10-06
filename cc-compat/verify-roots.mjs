// Confirms every configured skill root exists and that its immediate children
// are discoverable (a directory holding SKILL.md, which is the only shape the
// skill-filesystem provider lists), and reports how many of them are
// user-invocable only.
//
//   node verify-roots.mjs [profilePatch]
//
// The patch defaults to `$DSH_HOME/profiles/<profile>/cordis.patch.yml`
// (profile from $DSH_STACK_PROFILE, else `web`), resolved from the
// environment — this file knows no machine path.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Reads the two fields that decide catalog size and reachability. */
function frontmatterFlags(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!text.startsWith('---')) return { declared: false, hidden: false }
  const end = text.indexOf('\n---', 3)
  const head = end === -1 ? text : text.slice(0, end)
  const line = /^disable-model-invocation\s*:\s*(.+)$/m.exec(head)
  // The YAML parser drops the quotes; this reads raw text, so drop them too.
  const value = line === null ? '' : line[1].trim().replace(/^["']|["']$/g, '')
  return { declared: true, hidden: /^(true|yes|on|1)$/i.test(value) }
}

/** The harness home, resolved the way the harness resolves it. */
function resolveDshHome() {
  const configured = process.env.DSH_HOME
  return configured !== undefined && configured.trim() !== '' ? resolve(configured.trim()) : join(homedir(), '.dsh')
}

const profile = process.env.DSH_STACK_PROFILE ?? 'web'
const patchPath = process.argv[2] ?? join(resolveDshHome(), 'profiles', profile, 'cordis.patch.yml')

/**
 * Resolve one `customSkillDirs` entry to a filesystem path.
 *
 * The patch dialect writes these as `!!js dshHomePath('a', 'b')`, because
 * that is what makes the layer portable. This tool has no loader context, so
 * it evaluates exactly that shape and passes literal paths through.
 * @param raw - the raw YAML scalar, quotes and tag included.
 * @returns the absolute path the loader would compute.
 */
function interpolateRoot(raw) {
  const literal = raw.replace(/^['"]|['"]$/g, '')
  if (!literal.startsWith('!!js')) return literal
  const call = /dshHomePath\(([^)]*)\)/.exec(literal)
  if (call === null) return literal
  const segments = call[1].split(',').map(part => part.trim().replace(/^['"]|['"]$/g, '')).filter(part => part !== '')
  return join(resolveDshHome(), ...segments)
}

const patch = readFileSync(patchPath, 'utf8')
const lines = patch.split(/\r?\n/)
const start = lines.findIndex(line => line.includes('customSkillDirs'))
if (start < 0) {
  console.log('customSkillDirs not found')
  process.exit(1)
}
const roots = []
for (const line of lines.slice(start + 1)) {
  const match = /^\s+-\s+(.+?)\s*$/.exec(line)
  if (match === null) break
  roots.push(interpolateRoot(match[1]))
}
console.log('roots:', roots.length)
let total = 0
let hidden = 0
let broken = 0
for (const root of roots) {
  const present = existsSync(root)
  const skills = present
    ? readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && existsSync(join(root, entry.name, 'SKILL.md')))
    : []
  for (const entry of skills) {
    const flags = frontmatterFlags(join(root, entry.name, 'SKILL.md'))
    if (!flags.declared) broken += 1
    if (flags.hidden) hidden += 1
  }
  total += skills.length
  console.log(`${present ? 'OK   ' : 'MISS '}${String(skills.length).padStart(4)} skills  ${String(skills.filter(entry => frontmatterFlags(join(root, entry.name, 'SKILL.md')).hidden).length).padStart(4)} user-invocable only  ${root}`)
}
console.log('total discoverable:', total)
console.log('user-invocable only:', hidden, '| model-invocable:', total - hidden, '| without frontmatter:', broken)
