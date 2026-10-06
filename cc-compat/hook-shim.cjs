#!/usr/bin/env node
/**
 * In-process runner for Claude-Code plugin hooks.
 *
 * Claude Code plugin hooks ship a two-stage command: an inline `node -e`
 * bootstrap resolves the plugin root and then `spawnSync`s the real entry
 * script, passing the hook payload on stdin and reading its stdout. Inside
 * dsh's shell that nested spawn fails — the sandbox denies a child the named
 * pipes a piped `spawnSync` needs — so `plugin-hook-bootstrap.js` reports
 * `spawnSync … EPERM`, emits empty stdout and exits 0. The hook is registered,
 * invoked, and has no effect: nothing in any log says the check never ran.
 *
 * This shim performs the same preparation — plugin-root env, agent data home,
 * argv — and then loads the entry script IN-PROCESS, so there is no nested
 * process at all. It also reproduces the bootstrap's passthrough suppression:
 * ECC hooks conventionally return their raw input as stdout, and forwarding
 * that verbatim would write the whole tool payload into the transcript.
 *
 * Usage (generated, never typed by hand):
 *   node hook-shim.cjs <pluginRoot> <entryRelPath> [args…]
 *   node hook-shim.cjs <pluginRoot> --gated <hookId> <entryRelPath> <profilesCsv>
 *
 * The `--gated` form is for a hook that ECC's `run-with-flags.js` would have
 * SPAWNED, because it exports no `run()` and works through module-scope side
 * effects. Rather than reimplement that wrapper, the shim asks ECC's own
 * `scripts/lib/hook-flags.js` whether the hook is enabled — so
 * `ECC_HOOKS_ENABLED`, `ECC_HOOK_PROFILE` and `ECC_DISABLED_HOOKS` keep their
 * exact meaning — and then loads the entry in-process.
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { PassThrough } = require('node:stream')

const argv = process.argv.slice(2)
const mode = argv[1] === '--gated' ? 'gated' : argv[1] === '--call' ? 'call' : 'direct'
const root = argv[0]
const rel = mode === 'gated' ? argv[3] : mode === 'call' ? argv[2] : argv[1]
const args = mode === 'gated' ? argv.slice(4) : mode === 'call' ? argv.slice(4) : argv.slice(2)
if (!root || !rel) {
  process.stderr.write('[hook-shim] usage: hook-shim.cjs <pluginRoot> <entryRelPath> [args…]\n')
  process.exit(0)
}

const resolvedRoot = path.resolve(root)
const entry = path.resolve(resolvedRoot, rel)
if (entry !== resolvedRoot && !entry.startsWith(resolvedRoot + path.sep)) {
  process.stderr.write(`[hook-shim] path traversal rejected: ${rel}\n`)
  process.exit(0)
}

// The entry script and everything it requires read these.
process.env.CLAUDE_PLUGIN_ROOT = resolvedRoot
process.env.ECC_PLUGIN_ROOT = resolvedRoot

// Read the payload ourselves so a later passthrough comparison has the original
// bytes; the entry script is then handed the same bytes through a replay stream.
let raw = ''
try {
  raw = fs.readFileSync(0, 'utf8')
} catch (_error) {
  raw = ''
}

const replay = new PassThrough()
Object.defineProperty(process, 'stdin', { configurable: true, get: () => replay })

// Collect stdout instead of writing it, so a passthrough can be dropped.
const chunks = []
const realWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, encoding, callback) => {
  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || 'utf8'))
  if (typeof callback === 'function') callback()
  return true
}

function emit() {
  const out = Buffer.concat(chunks)
  if (out.length === 0) return
  // ECC hooks follow `run(raw) -> raw`: detect a byte-exact prefix of the input
  // (child writes are truncated at varying pipe capacities) and drop it, which
  // is what plugin-hook-bootstrap.js does to keep the transcript small.
  if (raw.length > 0) {
    const rawBytes = Buffer.from(raw, 'utf8')
    if (out.length <= rawBytes.length && rawBytes.subarray(0, out.length).equals(out)) {
      process.stderr.write('[hook-shim] hook returned raw input as stdout; emitting empty\n')
      return
    }
  }
  // Must be SYNCHRONOUS: an entry script that ends with `process.exit()` reaches
  // this handler with the event loop already unwinding, and an asynchronous
  // write to a pipe is silently discarded there. The bootstrap never hit this
  // because it forwarded the child's stdout from its main flow.
  fs.writeSync(1, out)
}

process.on('exit', emit)

try {
  const dataHome = path.join(resolvedRoot, 'scripts', 'lib', 'agent-data-home.js')
  if (fs.existsSync(dataHome)) require(dataHome).ensureAgentDataHomeEnv()
} catch (_error) {
  // A missing data-home helper must not fail the hook.
}

if (mode === 'gated') {
  // ECC's own flag logic decides, so the documented switches keep their meaning.
  const hookId = argv[2]
  const profilesCsv = argv[4]
  process.env.ECC_HOOK_ID = hookId
  process.env.ECC_HOOK_INPUT_TRUNCATED = '0'
  process.env.ECC_HOOK_INPUT_MAX_BYTES = String(1024 * 1024)
  let enabled = true
  try {
    const flags = require(path.join(resolvedRoot, 'scripts', 'lib', 'hook-flags.js'))
    enabled = flags.isHookEnabled(hookId, { profiles: profilesCsv })
  } catch (_error) {
    // Without the flag helper the hook is treated as enabled, which is the
    // ECC default when no variable is set.
  }
  if (!enabled) {
    // Disabled means "no opinion": no output, success, and the entry never loads.
    replay.end(raw)
    process.exitCode = 0
    return
  }
}

/**
 * Render a `run()` hook's return value the way ECC's `run-with-flags.js` does.
 * A hook may answer with a string, with `{stdout, stderr, exitCode}`, or with
 * `{additionalContext}` — the last is wrapped through ECC's own builder so a
 * PreToolUse hook's context reaches dsh in the shape it expects.
 */
function resolveRunResult(payload, output) {
  if (typeof output === 'string' || Buffer.isBuffer(output)) return { stdout: String(output), exitCode: 0 }
  if (output !== null && typeof output === 'object') {
    if (output.stderr) process.stderr.write(String(output.stderr))
    const exitCode = Number.isInteger(output.exitCode) ? output.exitCode : 0
    if (Object.prototype.hasOwnProperty.call(output, 'additionalContext')) {
      let wrapped
      try {
        const helper = require(path.join(resolvedRoot, 'scripts', 'hooks', 'pretooluse-visible-output.js'))
        wrapped = helper.buildPreToolUseAdditionalContext(output.additionalContext)
      } catch (_error) {
        wrapped = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: output.additionalContext } })
      }
      return { stdout: wrapped, exitCode }
    }
    if (Object.prototype.hasOwnProperty.call(output, 'stdout')) return { stdout: String(output.stdout ?? ''), exitCode }
    return { stdout: exitCode === 0 ? payload : '', exitCode }
  }
  return { stdout: payload, exitCode: 0 }
}

// The entry script must see the argv it would have seen under the bootstrap.
process.argv = [process.argv[0], entry, ...args]

async function loadEntry() {
  const loaded = require(entry)
  if (mode === 'call') {
    // The inline command required a dispatcher and invoked one of its methods.
    const method = argv[3]
    if (loaded !== null && typeof loaded === 'object' && typeof loaded[method] === 'function') {
      loaded[method]()
    } else {
      process.stderr.write(`[hook-shim] ${String(method)}() is not exported by ${rel}\n`)
    }
    return
  }
  // A hook exporting `run()` does nothing at module scope, so it has to be
  // called. ECC's wrapper did this too, but only after a `require()` it could
  // not always make — and it spawned the hook whenever that failed.
  if (loaded !== null && typeof loaded === 'object' && typeof loaded.run === 'function') {
    const output = await loaded.run(raw, {
      hookId: mode === 'gated' ? argv[2] : undefined,
      pluginRoot: resolvedRoot,
      scriptPath: entry,
      truncated: false,
      maxStdin: 1024 * 1024,
    })
    const resolved = resolveRunResult(raw, output)
    if (resolved.stdout) process.stdout.write(resolved.stdout)
    process.exitCode = resolved.exitCode
  }
}

loadEntry()
  .catch(error => {
    process.stderr.write(`[hook-shim] entry failed: ${error && error.message ? error.message : String(error)}\n`)
    process.exitCode = 0
  })
  // A hook that only wires stdin handlers keeps the loop alive until 'end';
  // anything still buffered is flushed by the exit handler.
  .finally(() => { replay.end(raw) })
