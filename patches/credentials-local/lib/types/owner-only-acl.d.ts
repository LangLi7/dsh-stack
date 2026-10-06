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
/** A SID observed in a document's discretionary access control list. */
export interface AclEntry {
    /** Security identifier in canonical `S-1-5-…` string form. */
    readonly sid: string;
    /** Whether the entry grants access (as opposed to denying it). */
    readonly allow: boolean;
}
/** What one inspection of the document's DACL found. */
export interface OwnerOnlyInspection {
    /** Distinct access entries, allow and deny alike. */
    readonly entries: readonly AclEntry[];
    /** Whether the DACL no longer inherits entries from its parent directory. */
    readonly inheritanceBlocked: boolean;
    /** Whether every granting entry belongs to the owner, `SYSTEM`, or `Administrators`. */
    readonly ownerOnly: boolean;
}
/**
 * Resolve the SID of the account running this process, once.
 * @returns the current principal's SID as canonical text.
 * @throws when the SID cannot be resolved.
 */
export declare function currentUserSid(): Promise<string>;
/**
 * The SIDs an owner-only document may grant access to: the owning account and
 * the two principals the operating system requires. The owner's logon-session
 * SID is admitted separately by {@link isLogonSessionSid}, because it is part of
 * the owner's token rather than a separate account.
 * @returns the allowed account-SID set.
 * @throws when the owning account's SID cannot be resolved.
 */
export declare function ownerOnlySids(): Promise<ReadonlySet<string>>;
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
export declare function inspectOwnerOnlyAcl(filename: string): Promise<OwnerOnlyInspection | undefined>;
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
export declare function enforceOwnerOnlyAcl(filename: string): Promise<boolean>;
//# sourceMappingURL=owner-only-acl.d.ts.map