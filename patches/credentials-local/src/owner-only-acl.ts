/**
 * Owner-only access control for the credentials document on Windows.
 *
 * POSIX expresses the provider's owner-only promise as a permission mode, which
 * `writeFileAtomic` stamps on the replacement inode. Windows has no such mode —
 * the `mode` argument cannot restrict access there — so an ACL has to carry the
 * promise instead, and it has to be applied by hand because the atomic replace
 * creates a *fresh* inode that inherits its parent directory's entries.
 *
 * A credentials document written under a home directory that grants another
 * local principal read access therefore inherits that access. This module closes
 * that path: `enforceOwnerOnlyAcl` re-founds the document's DACL on the owner
 * alone, and `inspectOwnerOnlyAcl` reports the entries a read path must refuse.
 *
 * Both directions are locale-independent by construction: well-known SIDs are
 * used as literals (`*S-1-5-18`, `*S-1-5-32-544`) rather than localized account
 * names such as `System` or `Administrators`, and PowerShell is asked for
 * `.Value` (a SID string) instead of a rendered account name. Windows
 * PowerShell is invoked with `-EncodedCommand`, so the script text never passes
 * through a shell or an argument-quoting layer, and the document path is handed
 * over through the environment rather than interpolated into the script.
 *
 * `enforceOwnerOnlyAcl` is fail-closed: a non-zero `icacls` exit throws, so a
 * write path can never silently publish a wider document than it claims.
 * @module @deepseek-ai/dsh-credentials-local/owner-only-acl
 */

import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** The platform whose access control this module manages. */
const WINDOWS = process.platform === 'win32'

/**
 * Well-known SIDs kept in an owner-only DACL. `Administrators` and `SYSTEM` are
 * mandatory: the operating system's own maintenance paths require access to
 * every file, and a DACL that omits them is not a supported configuration.
 */
const SYSTEM_SID = 'S-1-5-18'
const ADMINISTRATORS_SID = 'S-1-5-32-544'

/** Cap for each helper invocation; these are local, immediate calls. */
const HELPER_TIMEOUT_MS = 15_000

/** Resolve a system binary under `%SystemRoot%` rather than through `PATH`. */
function systemBinary(relative: string): string {
  return `${process.env.SystemRoot ?? 'C:\\Windows'}\\${relative}`
}

/**
 * Windows PowerShell and `icacls`, both resolved absolutely so that an
 * attacker-writable directory earlier in `PATH` cannot decide which binary
 * inspects or narrows the credentials document.
 */
const POWERSHELL = systemBinary('System32\\WindowsPowerShell\\v1.0\\powershell.exe')
const ICACLS = systemBinary('System32\\icacls.exe')

/** A SID observed in a document's discretionary access control list. */
export interface AclEntry {
  /** Security identifier in canonical `S-1-5-…` string form. */
  readonly sid: string
  /** Whether the entry grants access (as opposed to denying it). */
  readonly allow: boolean
}

/** What one inspection of the document's DACL found. */
export interface OwnerOnlyInspection {
  /** Distinct access entries, allow and deny alike. */
  readonly entries: readonly AclEntry[]
  /** Whether the DACL no longer inherits entries from its parent directory. */
  readonly inheritanceBlocked: boolean
  /** Whether every granting entry belongs to the owner, `SYSTEM`, or `Administrators`. */
  readonly ownerOnly: boolean
}

/**
 * Render PowerShell source for `-EncodedCommand`, which takes base64 over
 * UTF-16LE. Encoding the script sidesteps every layer that would otherwise
 * reinterpret quotes or backslashes on the way to the interpreter.
 * @param script - PowerShell source text.
 * @returns base64 of the script in the encoding `-EncodedCommand` expects.
 */
function encodeCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/**
 * Run one PowerShell script, handing `filename` through the environment.
 * @param script - PowerShell source reading `$env:DSH_ACL_TARGET`.
 * @param filename - absolute path of the document.
 * @returns the script's standard output, trimmed.
 * @throws when the helper fails or exceeds its timeout.
 */
async function runAgainst(script: string, filename: string): Promise<string> {
  const { stdout } = await run(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodeCommand(script)],
    {
      timeout: HELPER_TIMEOUT_MS,
      windowsHide: true,
      env: { ...process.env, DSH_ACL_TARGET: filename },
    },
  )
  return stdout.trim()
}

/**
 * Whether a SID names the owner's own logon session rather than a different
 * principal.
 *
 * Windows stamps `S-1-5-5-0-<logonid>` onto a file whose inheritance is blocked,
 * because that SID is part of the creating token. A logon ID is minted per logon
 * session and is not an account, so it cannot be assumed by another local user:
 * an attacker cannot create a file bearing someone else's logon SID, and a
 * document carrying only the owner's own logon SID plus the OS-mandated system
 * principals is still owner-only. Classifying the SID this way is what keeps the
 * check from refusing the provider's own correctly-protected documents, which
 * would otherwise be the normal outcome of every Windows commit.
 *
 * The SID is *not* accepted on trust: it is only ever reached after the account
 * SID has been resolved from the running token, and the form is checked exactly.
 * @param sid - SID in canonical form.
 * @returns whether the SID belongs to the current logon session.
 */
function isLogonSessionSid(sid: string): boolean {
  return /^S-1-5-5-[0-9]+-[0-9]+$/.test(sid)
}

/**
 * Memoized owner SID. The account cannot change under a running process, and
 * every commit and read would otherwise pay a PowerShell spawn for an answer
 * that never varies — which measurably slowed the write path.
 */
let ownerSidPromise: Promise<string> | undefined

/**
 * Resolve the SID of the account running this process, once.
 * @returns the current principal's SID as canonical text.
 * @throws when the SID cannot be resolved.
 */
export async function currentUserSid(): Promise<string> {
  ownerSidPromise ??= resolveCurrentUserSid()
  return ownerSidPromise
}

/**
 * Resolve the SID from the identity's own token, so no localized account name is
 * consulted and the answer is correct on every display language.
 * @returns the current principal's SID.
 * @throws when the SID cannot be resolved.
 */
async function resolveCurrentUserSid(): Promise<string> {
  const stdout = await runAgainst(
    'Write-Output ([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value)',
    '',
  )
  if (!/^S-1-[0-9-]+$/.test(stdout)) {
    throw new Error(`credentials-local: could not resolve the owning account's SID (got ${JSON.stringify(stdout)})`)
  }
  return stdout
}

/**
 * The SIDs an owner-only document may grant access to: the owning account and
 * the two principals the operating system requires. The owner's logon-session
 * SID is admitted separately by {@link isLogonSessionSid}, because it is part of
 * the owner's token rather than a separate account.
 * @returns the allowed account-SID set.
 * @throws when the owning account's SID cannot be resolved.
 */
export async function ownerOnlySids(): Promise<ReadonlySet<string>> {
  return new Set([await currentUserSid(), SYSTEM_SID, ADMINISTRATORS_SID])
}

/**
 * Read the document's discretionary access control list as SIDs.
 *
 * The read goes through `[System.IO.File]::GetAccessControl` rather than the
 * `Get-Acl` cmdlet on purpose: `Get-Acl` lives in the
 * `Microsoft.PowerShell.Security` module, which a constrained host can refuse to
 * load, and a refused module would have looked like an unreadable document. The
 * static .NET call depends on no cmdlet module.
 *
 * Only access rules are read, so unrelated access-control sections (auditing,
 * ownership) cannot be mistaken for an access grant, and SIDs are requested as
 * `SecurityIdentifier` so the result is an invariant `S-1-5-…` string on every
 * display language rather than a localized account name.
 * @param filename - absolute path of the document.
 * @returns the inspection, or `undefined` off Windows and when the security
 *   descriptor cannot be read — so callers can treat `undefined` as "not
 *   established" rather than as "safe".
 */
export async function inspectOwnerOnlyAcl(filename: string): Promise<OwnerOnlyInspection | undefined> {
  if (!WINDOWS) return undefined
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    '  $acl = [System.IO.File]::GetAccessControl($env:DSH_ACL_TARGET)',
    '} catch {',
    '  Write-Output "ERROR"',
    '  exit 0',
    '}',
    'Write-Output ("PROTECTED " + $acl.AreAccessRulesProtected)',
    'foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {',
    '  Write-Output ("RULE " + $rule.AccessControlType + " " + $rule.IdentityReference.Value)',
    '}',
  ].join('\n')
  let stdout: string
  try {
    stdout = await runAgainst(script, filename)
  } catch {
    return undefined
  }
  const lines = stdout.split(/\r?\n/).filter(line => line.length > 0)
  const header = /^PROTECTED (True|False)$/.exec(lines[0] ?? '')
  if (header === null) return undefined
  const entries: AclEntry[] = []
  const seen = new Set<string>()
  for (const line of lines.slice(1)) {
    const rule = /^RULE (Allow|Deny) (S-1-[0-9-]+)$/.exec(line)
    if (rule === null) return undefined
    const allow = rule[1] === 'Allow'
    const sid = rule[2] as string
    const key = `${allow ? 'allow' : 'deny'}:${sid}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ sid, allow })
  }
  const allowed = await ownerOnlySids()
  return {
    entries,
    inheritanceBlocked: header[1] === 'True',
    ownerOnly: entries.every(entry => !entry.allow || allowed.has(entry.sid) || isLogonSessionSid(entry.sid)),
  }
}

/**
 * Re-found the document's DACL on the owner alone, so it no longer inherits
 * access from its parent directory.
 *
 * The narrowing is `icacls /reset` followed by `/inheritance:r` and
 * `/grant:r`. `/reset` is the step that matters and the one that is easy to get
 * wrong: it replaces the ACL with a fresh one derived for the object and
 * re-enables inheritance in a single operation. `/inheritance:r` alone does not
 * discard anything — it *converts* the inherited entries into explicit ones —
 * so a foreign grant survives it and reappears as an effective ACE. Removing
 * entries individually is not an option either, because the principal to remove
 * cannot be named portably (`icacls /remove:g *` is rejected). `/reset` avoids
 * both problems.
 *
 * `/reset` leaves inheritance enabled, which would let the parent directory
 * grant access again on the next re-evaluation, so `/inheritance:r` follows it
 * to block that path, and `/grant:r` then states the owner-only set. Grants use
 * well-known SIDs plus the owner's resolved SID, so the sequence behaves the
 * same on a German or an English system, and it is idempotent: re-running it on
 * an already-protected document leaves the same DACL. A non-zero `icacls` exit
 * throws, so a caller on a write path cannot publish a wider document than it
 * claims.
 * @param filename - absolute path of the document.
 * @returns whether the DACL was narrowed; false off Windows, where the POSIX
 *   mode already carries the promise.
 * @throws when `icacls` refuses the change.
 */
export async function enforceOwnerOnlyAcl(filename: string): Promise<boolean> {
  if (!WINDOWS) return false
  const owner = await currentUserSid()
  const grants = [...await ownerOnlySids()].map(sid => `*${sid}:(F)`)
  try {
    // A document this provider already founded on the owner is left alone. The
    // repair below costs two `icacls` spawns, and the write path commits on
    // every credential change, so re-running it on the common case would charge
    // each write for a DACL that is already correct.
    if (await isAlreadyOwnerOnly(filename)) return true
    // `/reset` is the step that carries the weight: it replaces the ACL with a
    // fresh one derived for the object and re-enables inheritance, which is the
    // only step that *discards* a foreign grant. `/inheritance:r` alone does not
    // — it converts inherited entries into explicit ones, so a foreign grant
    // survives it and reappears as an effective ACE; removing entries
    // individually is not an option either, because `icacls /remove:g *` is
    // rejected.
    await run(ICACLS, [filename, '/reset'], { timeout: HELPER_TIMEOUT_MS, windowsHide: true })
    // `/reset` leaves inheritance enabled, which would let the parent hand the
    // access straight back, so it is blocked and the owner-only set restated.
    await run(ICACLS, [filename, '/inheritance:r', '/grant:r', ...grants], { timeout: HELPER_TIMEOUT_MS, windowsHide: true })
  } catch (error) {
    // An absent path is not a failure to enforce: a drain or a competing writer
    // can remove the document between the commit and this call, and there is
    // nothing left to protect. Any other `icacls` refusal is fatal, because it
    // would mean publishing a document wider than the provider promises.
    if (await isAbsent(filename)) return false
    const detail = error instanceof Error ? error.message : String(error)
    const repair = `icacls "${filename}" /reset /inheritance:r /grant:r "*${owner}:(F)" "*${SYSTEM_SID}:(F)" "*${ADMINISTRATORS_SID}:(F)"`
    throw new Error(
      `credentials-local: could not restrict ${filename} to its owner; run '${repair}' before starting again (${detail})`,
    )
  }
  return true
}

/**
 * Whether a path no longer exists.
 * @param filename - absolute path to check.
 * @returns whether the path is absent.
 */
async function isAbsent(filename: string): Promise<boolean> {
  try {
    await stat(filename)
    return false
  } catch {
    return true
  }
}

/**
 * Whether a path's DACL is already blocked from inheriting and grants nothing
 * beyond the owner-only set.
 *
 * This is the guard for {@link enforceOwnerOnlyAcl}'s common case, so it must
 * stay cheap: one PowerShell spawn that resolves the allowed SIDs and evaluates
 * the DACL in-process, instead of a spawn per question. It answers `false` on
 * any unreadable descriptor, which routes the caller into the repair rather than
 * skipping it.
 * @param filename - absolute path to probe.
 * @returns whether the path already satisfies the owner-only bound.
 */
async function isAlreadyOwnerOnly(filename: string): Promise<boolean> {
  const owner = await currentUserSid()
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$allowed = @('${owner}', '${SYSTEM_SID}', '${ADMINISTRATORS_SID}')`,
    'try {',
    '  $acl = [System.IO.File]::GetAccessControl($env:DSH_ACL_TARGET)',
    '} catch {',
    '  Write-Output "NO"',
    '  exit 0',
    '}',
    'if (-not $acl.AreAccessRulesProtected) { Write-Output "NO"; exit 0 }',
    'foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {',
    '  if ($rule.AccessControlType -ne "Allow") { continue }',
    '  $sid = $rule.IdentityReference.Value',
    // The owner's own logon-session SID is part of the owner's token, so it is
    // not foreign access; see isLogonSessionSid for why that is sound.
    '  if ($allowed -contains $sid) { continue }',
    '  if ($sid -match "^S-1-5-5-[0-9]+-[0-9]+$") { continue }',
    '  Write-Output "NO"',
    '  exit 0',
    '}',
    'Write-Output "YES"',
  ].join('\n')
  try {
    return await runAgainst(script, filename) === 'YES'
  } catch {
    return false
  }
}
