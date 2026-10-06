// Boot the harness against a chosen home, wait for HTTP, then measure idle CPU.
//
//   node boot-cpu-probe.mjs <dshHome> <port> [seconds]
//
// The server is spawned as a detached child so a slow boot cannot be confused
// with a dead one: readiness comes from HTTP polling, and the CPU sample is
// taken after the process has been up and idle for a while. Everything is
// reported as numbers, because "it feels slow" and "it burns 132% of a core"
// are different problems and only one of them is actionable.

import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const [home, port, seconds = '20'] = process.argv.slice(2)
if (home === undefined || port === undefined) {
  console.error('usage: node boot-cpu-probe.mjs <dshHome> <port> [seconds]')
  process.exit(2)
}
const sampleSeconds = Number(seconds)

const bin = join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
if (!existsSync(bin)) {
  console.error(`dsh entry not found: ${bin}`)
  process.exit(2)
}

const started = Date.now()
// `stdio: 'ignore'` is load-bearing, not tidiness. Piped stdio ties the child's
// lifetime to this process: when the probe's own stdout closes, the server's
// next write to its pipe takes the server down — which is exactly what made
// every earlier attempt report a ~1.5 s boot followed by an already-dead
// process, and left the idle measurement unmeasurable. Nothing here reads the
// server's output; readiness comes from HTTP.
const child = spawn(process.execPath, [bin, '--profile', 'web', '--port', String(port), '--no-open'], {
  env: { ...process.env, DSH_HOME: home },
  stdio: 'ignore',
  detached: true,
})
child.unref()

/** One HTTP probe. @returns true when the server answers below 500. */
async function probe() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) })
    return response.status < 500
  } catch {
    return false
  }
}

let readyAt
const deadline = Date.now() + 120_000
while (Date.now() < deadline) {
  if (await probe()) { readyAt = Date.now(); break }
  await new Promise(resolve => setTimeout(resolve, 200))
}

if (readyAt === undefined) {
  console.log(`home            : ${home}`)
  console.log('BOOT            : no HTTP answer within 120 s')
  try { process.kill(child.pid, 'SIGKILL') } catch { /* already gone */ }
  process.exit(1)
}

console.log(`home            : ${home}`)
console.log(`BOOT to HTTP    : ${((readyAt - started) / 1000).toFixed(2)} s`)

/**
 * Measure the CPU of one pid through the OS, or NaN when it cannot be read.
 * @param pid - the process to sample.
 * @returns accumulated processor seconds.
 */
function cpuOf(pid) {
  try {
    const result = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).CPU`],
      { encoding: 'utf8', windowsHide: true },
    )
    return Number(result.trim())
  } catch {
    return Number.NaN
  }
}

/**
 * The process that owns a listening port, via `netstat -ano`.
 *
 * Two caveats, both measured on this host rather than assumed:
 *
 * - `bin.js` may start the server as a grandchild, so the pid `spawn` returns
 *   can be a short-lived launcher. When it is gone, the port owner is the one
 *   worth sampling.
 * - `netstat` produced no output at all in the sandboxed shell this tool was
 *   developed in, so the lookup can legitimately fail. That is reported as
 *   "not measured" instead of silently reporting the launcher's zero.
 *
 * @returns the owning pid, or undefined.
 */
function portOwner(port) {
  try {
    const output = execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true })
    for (const line of output.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 5 && parts[1].endsWith(`:${port}`)) return Number(parts[4])
    }
  } catch {
    return undefined
  }
  return undefined
}

/** Whether a pid still exists. */
function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

console.log(`home            : ${home}`)
console.log(`BOOT to HTTP    : ${((readyAt - started) / 1000).toFixed(2)} s`)

const samplePid = isAlive(child.pid) ? child.pid : portOwner(port)
if (samplePid === undefined) {
  console.log('IDLE CPU        : not measured (the launched process is gone and the port owner could not be resolved)')
  process.exitCode = 1
} else {
  const cpuBefore = cpuOf(samplePid)
  await new Promise(resolve => setTimeout(resolve, sampleSeconds * 1000))
  const cpuAfter = cpuOf(samplePid)
  const consumed = cpuAfter - cpuBefore
  console.log(`server pid      : ${samplePid}  (launcher pid was ${child.pid})`)
  console.log(`IDLE CPU        : ${consumed.toFixed(2)} s over ${sampleSeconds} s wall = ${((consumed / sampleSeconds) * 100).toFixed(0)} % of one core`)
  try { process.kill(samplePid, 'SIGKILL') } catch { /* already gone */ }
}
try { process.kill(child.pid, 'SIGKILL') } catch { /* already gone */ }
await new Promise(resolve => setTimeout(resolve, 1500))
console.log('stopped')
