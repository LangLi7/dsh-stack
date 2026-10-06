/**
 * Regression test for the Windows owner-only access control of the credentials
 * document, ported from the upstream package's `tests/owner-only-acl.spec.ts`.
 *
 * Two differences from the upstream spec, both deliberate:
 *
 * 1. It runs on `node:test` instead of vitest, and imports the INSTALLED
 *    package instead of `../src/*.ts`. The defect it guards is about what the
 *    shipped artifact does, so testing the built bundle is the point rather
 *    than a compromise — and it runs on a machine that has only the harness
 *    installed, without the monorepo.
 * 2. It asserts what the provider's PUBLIC surface promises, not the helper
 *    functions: the patched bundle inlines `owner-only-acl.ts`, so
 *    `enforceOwnerOnlyAcl` and `inspectOwnerOnlyAcl` are not importable from
 *    it. The access control is therefore read the way the operating system
 *    reports it, with `icacls`.
 *
 * The defect this test fails on, without the overlay:
 *
 *   On Windows the provider skipped its owner-only check entirely
 *   (`if (process.platform === 'win32') return`), and `writeFileAtomic`
 *   publishes a FRESH inode that inherits its parent directory's entries. On a
 *   machine whose temp directory or home directory grants another principal
 *   access — the audited host carries an orphaned ACE for a deleted account and
 *   a sandbox group, both with Modify — the credentials document inherited that
 *   access. The secret was readable by a principal the provider claimed to
 *   exclude.
 *
 * What "owner-only" is measured as: the set of principals `icacls` reports must
 * be a subset of {owner, SYSTEM, Administrators}. Inherited (`(I)`) entries
 * count. That matters, because the fix's real work is to CLEAR inheritance —
 * the directory keeps its inherited entries, so a document that merely
 * re-granted its owner without blocking inheritance would still list them.
 *
 * No credential VALUE is ever printed or asserted on: the document is a
 * throwaway and a failure message must not survive as a sample of the format.
 *
 * Usage: node owner-only-acl.test.mjs <path to the installed dsh-credentials-local>
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const run = promisify(execFile)
const WINDOWS_ONLY = process.platform === 'win32'
const POWERSHELL = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
const SANDBOX_GROUP = 'CodexSandboxUsers'

const targetArg = process.argv[2]
if (targetArg === undefined) {
  console.error('usage: node owner-only-acl.test.mjs <path to dsh-credentials-local>')
  process.exit(2)
}
const TARGET = resolve(targetArg)

const requireFromTarget = createRequire(join(TARGET, 'noop.js'))
const { Context } = requireFromTarget('@deepseek-ai/cordis')
const { credentialRef } = requireFromTarget('@deepseek-ai/dsh-credentials')
const { LocalCredentialProvider } = await import(pathToFileURL(join(TARGET, 'lib', 'index.js')).href)

const KEY = credentialRef('DSH_CRED_TEST')
const cleanups = []

test.afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()()
})

/** Run icacls and return its stdout, without throwing on a non-zero exit. */
async function icacls(args) {
  try {
    const { stdout } = await run('icacls', args, { windowsHide: true, timeout: 20_000 })
    return stdout
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
}

/** The current user's SID, as a string. */
async function currentUserSid() {
  const { stdout } = await run(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],
    { windowsHide: true, timeout: 15_000 },
  )
  return stdout.trim()
}

/**
 * The access control entries of a path, read as SIDs.
 *
 * Not parsed out of `icacls` text, for two measured reasons: `icacls` prints
 * LOCALIZED account names (`VORDEFINIERT\Administratoren` on this host), so
 * matching names would be locale-dependent; and it prints an unresolvable SID
 * without the `*` prefix `icacls` itself uses when asked to emit SIDs. Reading
 * the DACL through .NET returns `SecurityIdentifier.Value`, the same string in
 * every locale — and it reports an orphaned ACE (a deleted account) instead of
 * failing to translate it, which is exactly the entry that matters here.
 *
 * `Get-Acl` is NOT used: this host's execution policy blocks the
 * Microsoft.PowerShell.Security module's autoload, so the cmdlet does not exist
 * in a non-interactive child. The .NET static methods have no such dependency.
 * PowerShell is invoked with `-EncodedCommand` and the path is passed through
 * the environment, never interpolated into the script text.
 * @param path - the file or directory to inspect.
 * @returns one entry per ACE.
 */
async function aclEntries(path) {
  const script = `
$ErrorActionPreference = 'Stop'
$target = $env:DSH_ACL_PROBE_PATH
$acl = if ([System.IO.Directory]::Exists($target)) { [System.IO.Directory]::GetAccessControl($target) } else { [System.IO.File]::GetAccessControl($target) }
foreach ($ace in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
  [pscustomobject]@{
    sid = $ace.IdentityReference.Value
    allow = $ace.AccessControlType.ToString() -eq 'Allow'
    inherited = $ace.IsInherited
  } | ConvertTo-Json -Compress
}`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const { stdout, stderr } = await run(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true, timeout: 20_000, env: { ...process.env, DSH_ACL_PROBE_PATH: path } },
  )
  const entries = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line))
  // A silent empty read would make every assertion below vacuous. Fail loudly.
  if (entries.length === 0) {
    assert.fail(`the access control of ${path} could not be read (stdout ${JSON.stringify(stdout)}, stderr ${String(stderr).slice(0, 300)})`)
  }
  return entries
}

/** The SIDs with a granted access entry, inherited ones included. */
async function allowedSids(path) {
  return (await aclEntries(path)).filter(entry => entry.allow).map(entry => entry.sid)
}

/** SYSTEM and Administrators keep access by design; the owner is passed in. */
function allowedSet(ownerSid) {
  return new Set([ownerSid, 'S-1-5-18', 'S-1-5-32-544'])
}

/**
 * Apply the documented repair to one path, as the TWO icacls calls that work.
 *
 * Measured on a German Windows, where both details bite:
 *
 * - `/reset` must be its own invocation. Combined with other options it is
 *   rejected (`Ungültiger Parameter: "/inheritance:r"`, exit 87) — the error
 *   text the provider prints lists the steps on one line, which is a hint about
 *   the sequence, not a runnable command.
 * - `/reset` is also the step that carries the weight: `/reset` plus
 *   `/inheritance:r` build the correct ACL. `/inheritance:r` alone strips the
 *   entries but keeps an explicit grant made earlier, and `/grant:r` alone only
 *   ADDS — measured: the inherited foreign entries survived it.
 * - `/grant:r` needs literal-SID syntax (`*S-1-5-…`). Without the `*`, icacls
 *   reads the value as an account NAME and fails, which is why the
 *   implementation grants with `*` prefixes.
 *
 * @param path - the file or directory to repair.
 * @param ownerSid - the owner's SID.
 */
async function repairOwnerOnly(path, ownerSid) {
  await icacls([path, '/reset'])
  await icacls([
    path, '/inheritance:r', '/grant:r',
    `*${ownerSid}:(F)`, '*S-1-5-18:(F)', '*S-1-5-32-544:(F)',
  ])
}

/**
 * Grant one named group read access to a path and PROVE the grant landed.
 *
 * `icacls /grant` only adds an entry, and a SID that cannot be resolved makes it
 * fail — which would leave a test asserting nothing. Hence the read-back.
 * @returns true when the group is now among the path's granted SIDs.
 */
async function grantGroupRead(path, group) {
  const before = await allowedSids(path)
  const groupSid = (await run(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `(New-Object System.Security.Principal.NTAccount($env:DSH_ACL_GROUP)).Translate([System.Security.Principal.SecurityIdentifier]).Value`],
    { windowsHide: true, timeout: 15_000, env: { ...process.env, DSH_ACL_GROUP: group } },
  )).stdout.trim()
  // `*<sid>` so a localized system grants it as a SID, never as a name.
  await icacls([path, '/grant', `*${groupSid}:(R)`])
  const after = await allowedSids(path)
  return after.includes(groupSid) || after.length > before.length
}

/** Whether the sandbox group exists on this host. */
async function hasSandboxGroup() {
  try {
    const { stdout } = await run(
      POWERSHELL,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `(Get-LocalGroup -Name ${SANDBOX_GROUP}).Name`],
      { windowsHide: true, timeout: 15_000 },
    )
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

/** A throwaway directory to host the document. */
async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-credentials-acl-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** Mount the provider against one document path. */
async function boot(path) {
  const ctx = new Context()
  const fiber = ctx.plugin(LocalCredentialProvider, { path, watch: false })
  cleanups.push(async () => { await fiber.dispose() })
  await fiber
  return ctx
}

test('the provider writes an owner-only document even where the directory grants access to others', { skip: !WINDOWS_ONLY }, async () => {
  // This is the everyday promise and the actual regression detector. The temp
  // directory on this host inherits Modify for a sandbox group and for an
  // orphaned ACE; a document that merely re-granted its owner would still list
  // them, so clearing inheritance is what this asserts.
  const dir = await tempDir()
  const inherited = await allowedSids(dir)
  const path = join(dir, '.credentials.yaml')

  const ctx = await boot(path)
  await ctx.credentials.set(KEY, 'probe')

  const owner = await currentUserSid()
  const allowed = allowedSet(owner)
  const onDocument = await allowedSids(path)
  const beyondOwner = onDocument.filter(sid => !allowed.has(sid))
  assert.deepEqual(
    beyondOwner, [],
    `the written document grants access beyond its owner (directory had: ${inherited.join(', ')}): ${beyondOwner.join(', ')}`,
  )
  assert.ok(onDocument.includes(owner), `the owner is missing from the document's access list: ${onDocument.join(', ')}`)
})

test('a document widened by an explicit grant is refused, naming the icacls repair', { skip: !WINDOWS_ONLY }, async () => {
  if (!(await hasSandboxGroup())) {
    assert.fail(`${SANDBOX_GROUP} is absent on this host, so the widened-document case cannot be reproduced here`)
  }
  const dir = await tempDir()
  const path = join(dir, '.credentials.yaml')
  await writeFile(path, 'version: 1\nrefs:\n  DSH_CRED_TEST: placeholder\n', { mode: 0o600 })
  if (!(await grantGroupRead(path, SANDBOX_GROUP))) {
    assert.fail(`could not widen the document: granting ${SANDBOX_GROUP} read access had no effect`)
  }

  const ctx = new Context()
  await assert.rejects(
    async () => { await ctx.plugin(LocalCredentialProvider, { path, watch: false }) },
    /readable beyond its owner[\s\S]*icacls/,
    'the provider accepted a document that grants a lower-trust principal read access',
  )
})

test('the documented repair is accepted, and the next commit leaves the document owner-only', { skip: !WINDOWS_ONLY }, async () => {
  if (!(await hasSandboxGroup())) {
    assert.fail(`${SANDBOX_GROUP} is absent on this host, so the widened-then-repaired case cannot be reproduced here`)
  }
  const dir = await tempDir()
  const path = join(dir, '.credentials.yaml')
  const owner = await currentUserSid()

  await writeFile(path, 'version: 1\nrefs:\n  DSH_CRED_TEST: placeholder\n', { mode: 0o600 })
  if (!(await grantGroupRead(path, SANDBOX_GROUP))) {
    assert.fail(`could not widen the document: granting ${SANDBOX_GROUP} read access had no effect`)
  }
  await assert.rejects(
    async () => { await boot(path) },
    /readable beyond its owner[\s\S]*icacls/,
    'the provider accepted a document that grants a lower-trust principal read access',
  )

  // The repair, applied the way the implementation documents it.
  //
  // Measured refinement: repairing the DOCUMENT alone is enough for the mount
  // to be accepted — the mount check reads the document's DACL, not its
  // directory's. The directory matters on the WRITE path, where
  // `ensureOwnerOnlyDir` narrows it before anything is published. Both are
  // repaired here, which is what an operator would do and what makes the final
  // assertion below meaningful.
  await repairOwnerOnly(path, owner)
  await repairOwnerOnly(dir, owner)

  const ctx = await boot(path)
  await ctx.credentials.set(KEY, 'probe')

  const beyondOwner = (await allowedSids(path)).filter(sid => !allowedSet(owner).has(sid))
  assert.deepEqual(beyondOwner, [], `after the repair and a commit the document still grants: ${beyondOwner.join(', ')}`)
})

test('away from Windows the helper contract is a no-op, not a pretence', { skip: WINDOWS_ONLY }, async () => {
  // The POSIX peer asserts the mode; there is nothing to assert here beyond the
  // provider still working, which keeps the suite meaningful on a Linux runner.
  const dir = await tempDir()
  const path = join(dir, '.credentials.yaml')
  const ctx = await boot(path)
  await ctx.credentials.set(KEY, 'probe')
  const { readFile } = await import('node:fs/promises')
  const text = await readFile(path, 'utf8')
  assert.match(text, /DSH_CRED_TEST/)
})
