#!/usr/bin/env node
/**
 * Transformations that make imported Claude-Code artifacts actually behave in dsh.
 *
 * Copying a `SKILL.md` faithfully is not enough: it can be byte-perfect and still
 * be useless, because it was written for a different harness. Three mismatches
 * are measurable across the imported corpus, and each one is repaired by a
 * derived artifact rather than by editing the source:
 *
 * - **tools**: a CC hook matcher names `Bash` / `Write` / `Edit`; dsh's tools are
 *   `pwsh` / `write` / `edit`, so the matcher never selects anything.
 * - **spawn**: a CC plugin hook command is an inline bootstrap that `spawnSync`s
 *   the real entry script. dsh's shell denies a hook child the pipes a piped
 *   spawn needs, so the hook becomes a silent no-op. `hook-shim.cjs` runs the
 *   entry in-process instead.
 * - **paths**: a CC skill resolves its relative paths against the plugin root;
 *   dsh hands the model the skill directory as the base. References to a parent
 *   (`../_shared/…`) or to a repo-root folder (`scripts/…`) therefore dangle.
 *
 * Data tables live in `mapping.json`; this module is the only thing that knows
 * how to apply them.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { TABLE, walk } from './compile.mjs'

/** CC hook events dsh has an extension point for; anything else is dropped. */
export const SUPPORTED_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop']

/** Folder names a CC skill bundles next to its `SKILL.md`. */
const RESOURCE_DIRS = ['scripts', 'references', 'reference', 'assets', 'templates', 'examples', 'resources']

/** A reference that looks like a file path. */
const PATH_REF = /^(?:\.{0,2}\/)?[\w.@-]+(?:\/[\w.@-]+)*\.(?:md|markdown|py|js|cjs|mjs|ts|tsx|sh|ps1|psm1|json|ya?ml|toml|txt|csv|html|svg|sql|ini|cfg)$/i

/** CC tool names, longest first so `MultiEdit` is not eaten by `Edit`. */
const CC_TOOL_NAMES = Object.keys(TABLE.toolNames).sort((a, b) => b.length - a.length)

/** The dsh tool a CC tool name maps to, or the name itself when unmapped. */
export function toDshToolName(name) {
  return TABLE.toolNames[name] ?? name
}

/**
 * Translate one hook matcher. A matcher is a regex over the tool name; dsh feeds
 * it dsh's own tool names, so each alternative is rewritten through the table and
 * duplicates collapse (`Write|Edit|MultiEdit` becomes `write|edit`).
 */
export function translateMatcher(matcher) {
  if (typeof matcher !== 'string' || matcher === '' || matcher === '.*') return matcher
  const mapped = []
  for (const part of matcher.split('|').map(entry => entry.trim()).filter(Boolean)) {
    // A regex fragment (quantifiers, classes) is left untouched: it is not a tool name.
    const target = /[\^$*+?()[\]{}\\]/.test(part) ? part : toDshToolName(part)
    if (!mapped.includes(target)) mapped.push(target)
  }
  return mapped.join('|')
}

/**
 * Split a CC plugin hook command into the entry script and its arguments.
 *
 * The shipped shape is an inline `node -e "<bootstrap>"` whose trailing argument
 * list is `node <entryRelPath> [args…]`; the bootstrap consumes the `node` mode
 * token itself. Returns undefined for a command that is not shaped that way, so
 * the caller can pass it through unchanged and report it.
 */
export function splitHookCommand(command) {
  if (typeof command !== 'string') return undefined
  const marker = '" node '
  const index = command.lastIndexOf(marker)
  if (index === -1) return undefined
  const parts = command.slice(index + marker.length).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return undefined
  return { entry: parts[0], args: parts.slice(1) }
}

/** Substitute the CC variables that appear in emitted text. */
function substitute(text, pluginRoot) {
  return text.split('${CLAUDE_PLUGIN_ROOT}').join(pluginRoot).split('${ECC_PLUGIN_ROOT}').join(pluginRoot)
}

/**
 * Mirror of `run-with-flags.js`' own test for "this hook can be required in
 * process": it only calls `run()` when the script both exports something and
 * mentions `run`, and SPAWNS everything else. The generator makes the same
 * judgement so it can route the spawning half away from the wrapper.
 */
function exportsRun(scriptPath) {
  try {
    const source = readFileSync(scriptPath, 'utf8')
    return /module\.exports/.test(source) && /\brun\b/.test(source)
  } catch {
    return false
  }
}

/**
 * Find what an inline hook command ultimately wants to run.
 *
 * Claude Code plugin hooks ship their target in three different ways, and all
 * three must be recognised or the hook silently keeps doing nothing:
 *
 * a) ECC's `plugin-hook-bootstrap.js` shape — an inline resolver that splices the
 *    bootstrap into argv and leaves `node <entry> [args…]` as the tail.
 * b) A hand-rolled inline wrapper that calls
 *    `spawnSync(process.execPath, [script, '<hookId>', '<realScript>', '<profiles>'])`.
 * c) An inline script that requires a dispatcher in-process and calls a named
 *    method (`require(s).cli()`) with the dispatch mode as argv.
 *
 * Returns undefined for a command that already IS the invocation (nothing nested).
 */
export function extractHookTarget(command) {
  if (typeof command !== 'string') return undefined

  const wrapper = /spawnSync\(process\.execPath,\s*\[[^\]]*?'([^']+)',\s*'([^']+)',\s*'([^']*)'\]/.exec(command)
  if (wrapper !== null) {
    return { kind: 'wrapper', hookId: wrapper[1], realScript: wrapper[2], profiles: wrapper[3] }
  }

  const entry = /p\.join\(r,\s*'([^']+)'\)/.exec(command)
  const call = /require\(s\)\.(\w+)\(\)/.exec(command)
  if (entry !== null && call !== null) {
    const tail = /"\s+(\S+)\s*$/.exec(command)
    return { kind: 'call', entry: entry[1], method: call[1], args: tail === null ? [] : [tail[1]] }
  }

  const split = splitHookCommand(command)
  if (split !== undefined) return { kind: 'argv', entry: split.entry, args: split.args }
  return undefined
}

/** Build `node "<shim>" <root> <mode args…>` with every value quoted. */
function shimCommand(shimPath, pluginRoot, modeArgs) {
  return `node ${[shimPath, pluginRoot, ...modeArgs].map(value => `"${value}"`).join(' ')}`
}

/**
 * Rewrite one hook command so it can actually run under dsh.
 *
 * Every form of nesting is removed: ECC's bootstrap spawn, its `run-with-flags.js`
 * wrapper spawn for hooks that export no `run()`, and the hand-rolled inline
 * spawns on Stop and PostToolUse. dsh's shell denies a hook child the pipes a
 * piped spawn needs, so each one silently reduced the hook to a no-op. The shim
 * loads the target in-process instead; a `run()`-exporting script keeps using
 * ECC's own wrapper, which already requires it without spawning.
 */
export function rewriteHookCommand(command, pluginRoot, shimPath) {
  if (typeof command !== 'string' || command.trim() === '') return undefined
  const target = extractHookTarget(command)
  if (target === undefined) {
    return { command: substitute(command, pluginRoot), viaShim: false }
  }

  // `run-with-flags.js` is ECC's gating wrapper. It loads a hook in-process only
  // when the script exports `run()`, and otherwise SPAWNS it — and it also falls
  // back to that spawn when its `require()` throws. Both paths are removed by
  // handing the wrapper's own three arguments to the shim, which applies the same
  // gating through ECC's `hook-flags.js` and then loads the script in-process.
  const wrappable = (entryPath, rest) => basename(entryPath) === 'run-with-flags.js' && rest.length >= 3
  if (target.kind === 'wrapper' || (target.kind === 'argv' && wrappable(target.entry.replace(/\\/g, '/'), target.args))) {
    const hookId = target.kind === 'wrapper' ? target.hookId : target.args[0]
    const realScript = substitute(target.kind === 'wrapper' ? target.realScript : target.args[1], pluginRoot)
    const profiles = target.kind === 'wrapper' ? target.profiles : target.args[2]
    return {
      command: shimCommand(shimPath, pluginRoot, ['--gated', hookId, realScript, profiles]),
      viaShim: true,
      gated: true,
    }
  }

  if (target.kind === 'call') {
    return {
      command: shimCommand(shimPath, pluginRoot, ['--call', target.entry, target.method, ...target.args]),
      viaShim: true,
      call: true,
    }
  }

  return {
    command: shimCommand(shimPath, pluginRoot, [substitute(target.entry, pluginRoot), ...target.args.map(arg => substitute(arg, pluginRoot))]),
    viaShim: true,
  }
}

/**
 * Build the derived hooks file for one plugin: matchers translated, commands run
 * through the shim, unsupported events dropped. Returns the report the installer
 * prints, and writes nothing when `outPath` is undefined.
 */
export function generateHooksFile(sourcePath, pluginRoot, shimPath, outPath) {
  const stats = { source: sourcePath, events: {}, matchers: [], rewritten: 0, direct: 0, unmappedCommands: [], droppedEvents: [], commands: [] }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    return { ...stats, error: `unreadable: ${error.message}` }
  }
  // ECC wraps the event map in `hooks`; a bare event map is the other shape.
  const events = manifest.hooks !== undefined && typeof manifest.hooks === 'object' ? manifest.hooks : manifest
  const out = {}

  for (const [event, groups] of Object.entries(events)) {
    if (!SUPPORTED_EVENTS.includes(event)) {
      stats.droppedEvents.push(event)
      continue
    }
    if (!Array.isArray(groups)) continue
    const emitted = []
    for (const group of groups) {
      const matcher = translateMatcher(group.matcher)
      if (matcher !== group.matcher) stats.matchers.push(`${String(group.matcher)} -> ${String(matcher)}`)
      const hooks = []
      for (const hook of Array.isArray(group.hooks) ? group.hooks : []) {
        if (hook.type !== undefined && hook.type !== 'command') continue
        const rewritten = rewriteHookCommand(hook.command, pluginRoot, shimPath)
        if (rewritten === undefined) {
          stats.unmappedCommands.push(`${event}: ${String(hook.command).slice(0, 60)}…`)
          continue
        }
        if (rewritten.viaShim) stats.rewritten += 1
        else stats.direct += 1
        stats.commands.push(rewritten.command)
        hooks.push({ type: 'command', command: rewritten.command, ...hook.timeout !== undefined ? { timeout: hook.timeout } : {} })
      }
      if (hooks.length === 0) continue
      emitted.push({ ...matcher !== undefined ? { matcher } : {}, hooks })
    }
    if (emitted.length > 0) {
      out[event] = emitted
      stats.events[event] = emitted.length
    }
  }

  if (outPath !== undefined) writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8')
  return stats
}

/**
 * Every bundled resource in a plugin, keyed by each of its trailing path
 * segments. A translated variant of a skill ships only its `SKILL.md`, so a
 * reference like `references/voice-profile-schema.md` points at a file that
 * exists once, under the canonical skill's own folder — the suffix index is what
 * recovers it without guessing.
 *
 * Only files under a conventional resource folder are indexed, which keeps the
 * index small on a plugin as large as ECC.
 */
const suffixIndexCache = new Map()
function suffixIndex(pluginDir) {
  const cached = suffixIndexCache.get(pluginDir)
  if (cached !== undefined) return cached
  const index = new Map()
  for (const file of walk(pluginDir, () => true)) {
    const segments = relative(pluginDir, file).replace(/\\/g, '/').split('/')
    if (!segments.some(segment => RESOURCE_DIRS.includes(segment))) continue
    for (let start = segments.length - 2; start >= 0; start -= 1) {
      const suffix = segments.slice(start).join('/')
      const list = index.get(suffix)
      if (list === undefined) index.set(suffix, [file])
      else if (list.length < 8) list.push(file)
    }
  }
  suffixIndexCache.set(pluginDir, index)
  return index
}

/**
 * The one file a dangling reference means, or undefined when the answer is not
 * unique. A platform mirror (`.agents/skills/…`) duplicates the canonical tree,
 * so dotted directories are dropped before uniqueness is judged; two remaining
 * candidates stay unresolved rather than being picked arbitrarily.
 */
function uniqueSuffixMatch(pluginDir, reference) {
  const candidates = (suffixIndex(pluginDir).get(reference) ?? []).filter(file => {
    const parts = relative(pluginDir, file).replace(/\\/g, '/').split('/')
    return !parts.some(part => part.startsWith('.'))
  })
  return candidates.length === 1 ? candidates[0] : undefined
}

/**
 * Whether a candidate names a file the PLUGIN bundles, rather than a file in the
 * user's own project. A skill body mentions both: `scripts/pipeline.py` is the
 * plugin's, while `Cargo.toml`, `tsconfig.json` or `requirements.txt` belong to
 * whatever repository the agent is working in and must stay untouched. Only an
 * explicitly relative path or one rooted in a folder a skill bundles qualifies.
 */
function isBundledRef(candidate) {
  if (candidate.startsWith('../') || candidate.startsWith('./')) return true
  return RESOURCE_DIRS.some(dir => candidate.startsWith(dir + '/'))
}

/**
 * Repair one markdown file for dsh and report what changed.
 *
 * A reference is judged against the file's OWN directory first — a resource the
 * copy carries keeps working relatively — and only a dangling one is pinned to
 * its real location in the source checkout, which is where the plugin root's
 * files actually live. That distinction matters for a nested file: a path inside
 * `references/foo.md` resolves against `references/` first, then the skill
 * directory, then the plugin root.
 *
 * Two shapes are rewritten: a backticked path, and a bare one. Both must pass
 * {@link isBundledRef}, so prose that names a project file stays as it is.
 *
 * @param text - the file's contents.
 * @param options.installDir - directory of the INSTALLED file, for the "already resolves" test.
 * @param options.bases - ordered source directories to resolve a dangling reference against.
 * @param options.pluginDir - the plugin root, used for the suffix index and variable substitution.
 */
export function normalizeSkillText(text, { installDir, bases, pluginDir }) {
  const stats = { refsPinned: [], refsUnresolved: [], vars: 0, arguments: 0, tools: {} }

  const rewrite = candidate => {
    const trimmed = candidate.trim()
    if (!PATH_REF.test(trimmed)) return undefined
    if (!isBundledRef(trimmed)) return undefined
    if (existsSync(join(installDir, trimmed))) return undefined
    for (const base of bases) {
      const resolved = join(base, trimmed)
      if (existsSync(resolved)) {
        stats.refsPinned.push(`${trimmed} -> ${resolved}`)
        return resolved
      }
    }
    // `./x` is how a skill names a file the AGENT creates in the user's project,
    // so it is never recovered from the plugin — only a plugin-relative path is.
    if (!trimmed.startsWith('./')) {
      const recovered = uniqueSuffixMatch(pluginDir, trimmed.replace(/^(?:\.\.\/)+/, ''))
      if (recovered !== undefined) {
        stats.refsPinned.push(`${trimmed} -> ${recovered} (canonical copy)`)
        return recovered
      }
    }
    stats.refsUnresolved.push(trimmed)
    return undefined
  }

  let out = text.replace(/`([^`\n]{1,140})`/g, (whole, inner) => {
    const resolved = rewrite(inner)
    return resolved === undefined ? whole : `\`${resolved}\``
  })

  // A bare reference carries no backticks to mark it, so the same predicate has
  // to do the deciding.
  const bare = /(^|[\s([{"'(])((?:\.\.?\/)[\w.@%+-]+(?:\/[\w.@%+-]+)*|(?:scripts|references|reference|assets|templates|examples|resources)\/[\w.@%+-]+(?:\/[\w.@%+-]+)*\.[A-Za-z0-9]{1,8})/g
  out = out.replace(bare, (whole, prefix, candidate) => {
    const resolved = rewrite(candidate)
    return resolved === undefined ? whole : `${prefix}${resolved}`
  })

  // A CC skill body may name the plugin root; the copy has no such variable.
  const beforeVars = out
  out = substitute(out, pluginDir)
  if (out !== beforeVars) stats.vars = (beforeVars.match(/\$\{(?:CLAUDE|ECC)_PLUGIN_ROOT\}/g) ?? []).length

  const argumentToken = '$ARGUMENTS'
  if (TABLE.variables[argumentToken] !== undefined && out.includes(argumentToken)) {
    stats.arguments = (out.match(/\$ARGUMENTS/g) ?? []).length
    out = out.split(argumentToken).join(TABLE.variables[argumentToken])
  }

  // Tool names are only rewritten where a tool is clearly meant: backticked,
  // bolded, or followed by the word "tool". Prose keeps its own wording.
  for (const ccName of CC_TOOL_NAMES) {
    const dshName = TABLE.toolNames[ccName]
    let count = 0
    out = out.replace(new RegExp('`' + ccName + '`', 'g'), () => { count += 1; return '`' + dshName + '`' })
    out = out.replace(new RegExp('\\*\\*' + ccName + '\\*\\*', 'g'), () => { count += 1; return '**' + dshName + '**' })
    out = out.replace(new RegExp('\\b' + ccName + ' tool\\b', 'g'), () => { count += 1; return dshName + ' tool' })
    if (count > 0) stats.tools[ccName] = count
  }

  return { text: out, stats }
}

/** Convenience for the installer's report: a compact one-line summary. */
export function describeTransform(stats) {
  const parts = []
  if (stats.refsPinned.length > 0) parts.push(`${stats.refsPinned.length} refs pinned`)
  if (stats.refsUnresolved.length > 0) parts.push(`${stats.refsUnresolved.length} refs unresolved`)
  if (stats.vars > 0) parts.push(`${stats.vars} vars`)
  if (stats.arguments > 0) parts.push(`${stats.arguments} $ARGUMENTS`)
  const tools = Object.values(stats.tools).reduce((sum, value) => sum + value, 0)
  if (tools > 0) parts.push(`${tools} tool names`)
  return parts.length === 0 ? 'unchanged' : parts.join(', ')
}

/** Relative display path for a report line. */
export function displayPath(path, from) {
  return relative(from, path).replace(/\\/g, '/')
}

export { dirname }
