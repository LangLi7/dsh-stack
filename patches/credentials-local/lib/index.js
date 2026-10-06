import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { watch } from "chokidar";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Document, isMap, isScalar, parseDocument } from "yaml";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { canonicalizeWatchPath, resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { CredentialProvider, credentialRef, parseCredentialKey } from "@deepseek-ai/dsh-credentials";
//#region lib/types/owner-only-acl.js
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
const run = promisify(execFile);
/** The platform whose access control this module manages. */
const WINDOWS = process.platform === "win32";
/**
* Well-known SIDs kept in an owner-only DACL. `Administrators` and `SYSTEM` are
* mandatory: the operating system's own maintenance paths require access to
* every file, and a DACL that omits them is not a supported configuration.
*/
const SYSTEM_SID = "S-1-5-18";
const ADMINISTRATORS_SID = "S-1-5-32-544";
/** Cap for each helper invocation; these are local, immediate calls. */
const HELPER_TIMEOUT_MS = 15e3;
/** Resolve a system binary under `%SystemRoot%` rather than through `PATH`. */
function systemBinary(relative) {
	return `${process.env.SystemRoot ?? "C:\\Windows"}\\${relative}`;
}
/**
* Windows PowerShell and `icacls`, both resolved absolutely so that an
* attacker-writable directory earlier in `PATH` cannot decide which binary
* inspects or narrows the credentials document.
*/
const POWERSHELL = systemBinary("System32\\WindowsPowerShell\\v1.0\\powershell.exe");
const ICACLS = systemBinary("System32\\icacls.exe");
/**
* Render PowerShell source for `-EncodedCommand`, which takes base64 over
* UTF-16LE. Encoding the script sidesteps every layer that would otherwise
* reinterpret quotes or backslashes on the way to the interpreter.
* @param script - PowerShell source text.
* @returns base64 of the script in the encoding `-EncodedCommand` expects.
*/
function encodeCommand(script) {
	return Buffer.from(script, "utf16le").toString("base64");
}
/**
* Run one PowerShell script, handing `filename` through the environment.
* @param script - PowerShell source reading `$env:DSH_ACL_TARGET`.
* @param filename - absolute path of the document.
* @returns the script's standard output, trimmed.
* @throws when the helper fails or exceeds its timeout.
*/
async function runAgainst(script, filename) {
	const { stdout } = await run(POWERSHELL, [
		"-NoProfile",
		"-NonInteractive",
		"-ExecutionPolicy",
		"Bypass",
		"-EncodedCommand",
		encodeCommand(script)
	], {
		timeout: HELPER_TIMEOUT_MS,
		windowsHide: true,
		env: {
			...process.env,
			DSH_ACL_TARGET: filename
		}
	});
	return stdout.trim();
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
function isLogonSessionSid(sid) {
	return /^S-1-5-5-[0-9]+-[0-9]+$/.test(sid);
}
/**
* Memoized owner SID. The account cannot change under a running process, and
* every commit and read would otherwise pay a PowerShell spawn for an answer
* that never varies — which measurably slowed the write path.
*/
let ownerSidPromise;
/**
* Resolve the SID of the account running this process, once.
* @returns the current principal's SID as canonical text.
* @throws when the SID cannot be resolved.
*/
async function currentUserSid() {
	ownerSidPromise ??= resolveCurrentUserSid();
	return ownerSidPromise;
}
/**
* Resolve the SID from the identity's own token, so no localized account name is
* consulted and the answer is correct on every display language.
* @returns the current principal's SID.
* @throws when the SID cannot be resolved.
*/
async function resolveCurrentUserSid() {
	const stdout = await runAgainst("Write-Output ([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value)", "");
	if (!/^S-1-[0-9-]+$/.test(stdout)) throw new Error(`credentials-local: could not resolve the owning account's SID (got ${JSON.stringify(stdout)})`);
	return stdout;
}
/**
* The SIDs an owner-only document may grant access to: the owning account and
* the two principals the operating system requires. The owner's logon-session
* SID is admitted separately by {@link isLogonSessionSid}, because it is part of
* the owner's token rather than a separate account.
* @returns the allowed account-SID set.
* @throws when the owning account's SID cannot be resolved.
*/
async function ownerOnlySids() {
	return new Set([
		await currentUserSid(),
		SYSTEM_SID,
		ADMINISTRATORS_SID
	]);
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
async function inspectOwnerOnlyAcl(filename) {
	if (!WINDOWS) return void 0;
	const script = [
		"$ErrorActionPreference = 'Stop'",
		"try {",
		"  $acl = [System.IO.File]::GetAccessControl($env:DSH_ACL_TARGET)",
		"} catch {",
		"  Write-Output \"ERROR\"",
		"  exit 0",
		"}",
		"Write-Output (\"PROTECTED \" + $acl.AreAccessRulesProtected)",
		"foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {",
		"  Write-Output (\"RULE \" + $rule.AccessControlType + \" \" + $rule.IdentityReference.Value)",
		"}"
	].join("\n");
	let stdout;
	try {
		stdout = await runAgainst(script, filename);
	} catch {
		return;
	}
	const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
	const header = /^PROTECTED (True|False)$/.exec(lines[0] ?? "");
	if (header === null) return void 0;
	const entries = [];
	const seen = /* @__PURE__ */ new Set();
	for (const line of lines.slice(1)) {
		const rule = /^RULE (Allow|Deny) (S-1-[0-9-]+)$/.exec(line);
		if (rule === null) return void 0;
		const allow = rule[1] === "Allow";
		const sid = rule[2];
		const key = `${allow ? "allow" : "deny"}:${sid}`;
		if (seen.has(key)) continue;
		seen.add(key);
		entries.push({
			sid,
			allow
		});
	}
	const allowed = await ownerOnlySids();
	return {
		entries,
		inheritanceBlocked: header[1] === "True",
		ownerOnly: entries.every((entry) => !entry.allow || allowed.has(entry.sid) || isLogonSessionSid(entry.sid))
	};
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
async function enforceOwnerOnlyAcl(filename) {
	if (!WINDOWS) return false;
	const owner = await currentUserSid();
	const grants = [...await ownerOnlySids()].map((sid) => `*${sid}:(F)`);
	try {
		if (await isAlreadyOwnerOnly(filename)) return true;
		await run(ICACLS, [filename, "/reset"], {
			timeout: HELPER_TIMEOUT_MS,
			windowsHide: true
		});
		await run(ICACLS, [
			filename,
			"/inheritance:r",
			"/grant:r",
			...grants
		], {
			timeout: HELPER_TIMEOUT_MS,
			windowsHide: true
		});
	} catch (error) {
		if (await isAbsent(filename)) return false;
		const detail = error instanceof Error ? error.message : String(error);
		const repair = `icacls "${filename}" /reset /inheritance:r /grant:r "*${owner}:(F)" "*${SYSTEM_SID}:(F)" "*${ADMINISTRATORS_SID}:(F)"`;
		throw new Error(`credentials-local: could not restrict ${filename} to its owner; run '${repair}' before starting again (${detail})`);
	}
	return true;
}
/**
* Whether a path no longer exists.
* @param filename - absolute path to check.
* @returns whether the path is absent.
*/
async function isAbsent(filename) {
	try {
		await stat(filename);
		return false;
	} catch {
		return true;
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
async function isAlreadyOwnerOnly(filename) {
	const script = [
		"$ErrorActionPreference = 'Stop'",
		`$allowed = @('${await currentUserSid()}', '${SYSTEM_SID}', '${ADMINISTRATORS_SID}')`,
		"try {",
		"  $acl = [System.IO.File]::GetAccessControl($env:DSH_ACL_TARGET)",
		"} catch {",
		"  Write-Output \"NO\"",
		"  exit 0",
		"}",
		"if (-not $acl.AreAccessRulesProtected) { Write-Output \"NO\"; exit 0 }",
		"foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {",
		"  if ($rule.AccessControlType -ne \"Allow\") { continue }",
		"  $sid = $rule.IdentityReference.Value",
		"  if ($allowed -contains $sid) { continue }",
		"  if ($sid -match \"^S-1-5-5-[0-9]+-[0-9]+$\") { continue }",
		"  Write-Output \"NO\"",
		"  exit 0",
		"}",
		"Write-Output \"YES\""
	].join("\n");
	try {
		return await runAgainst(script, filename) === "YES";
	} catch {
		return false;
	}
}
//#endregion
//#region lib/types/index.js
/**
* File-backed credentials provider over `$DSH_HOME/.credentials.yaml`, layered
* against the environment by how much each layer is trusted:
*
* ```text
* inherited process environment      (read-only, wins)
* > $DSH_HOME/.credentials.yaml      (provider-managed, writable)
* > <invocation cwd>/.env            (read-only fallback)
* > $DSH_HOME/.env                   (read-only fallback)
* ```
*
* The inherited environment wins because `DEEPSEEK_API_KEY=… dsh`, a CI
* secret, or a container `-e` is this run's explicit intent; it cannot be
* edited from inside, so it must be *visibly* read-only rather than silently
* shadow writes. Everything below it loses to the managed store, so a key the
* Models page writes takes effect immediately even when an older key sits in
* the user's `.env`.
*
* The invoking project may supply a key, because the product trusts the
* project it is launched in. It ranks below the managed store, so a key stored
* through the Models page is never displaced by one a checkout happens to carry.
*
* The file is the provider-managed writable source: every write re-reads the
* document under a cross-process writer lock before patching only its own key
* — comments and the formatting of every untouched entry survive — external
* edits hot-publish through the seam, and each reload replaces the snapshot
* wholesale so a deleted entry never lingers in memory.
*
* The document holds nothing but credentials, which is why it is a strict
* `CredentialRef`-to-string mapping rather than a dotenv file: a store the
* Harness owns and never materializes into the environment cannot also serve
* as the user's environment layer; a store that doubled as the environment
* layer would shadow non-secret entries behind its precedence, making them
* silently unreachable.
* @module @deepseek-ai/dsh-credentials-local
*/
/** Basename of the credentials document inside the harness home. */
const CREDENTIALS_FILENAME = ".credentials.yaml";
/**
* Resolve the runtime spec from plugin config: an explicit `path` wins,
* otherwise the document lives at `<harness home>/.credentials.yaml`.
* @param config - raw plugin config.
* @returns the resolved file location and watch behavior.
*/
function resolveSpec(config) {
	return {
		filename: resolve(config.path ?? join(resolveDshHome(config.dshHome), ".credentials.yaml")),
		watch: config.watch ?? true,
		debounceMs: config.debounceMs ?? 100
	};
}
/** Permission bits outside the owner; a credentials document must have none of them. */
const GROUP_OTHER_BITS = 63;
/**
* How long a record write waits for the cross-process writer lock. A record
* mutation runs its caller's decision while holding the lock, and for the
* operation this half exists to serve — an owner refreshing an expired token —
* that decision includes a network round trip. The file-work default would
* fail every other writer of this document for its duration. A contender's
* wait is sized by the longest holder it can meet, and refs and records share
* one file and one lock, so every writer of this document — reference writes
* and record deletes included — waits this long, not only the mutation that
* holds it. Like the retry cadence in `dsh-atomic-write`, this is a
* robustness bound of the write protocol rather than a deployment choice: it
* is sized by what a provider request costs, which no deployment varies.
*/
const DOCUMENT_LOCK_WAIT_MS = 3e4;
/**
* Create the document's parent directory and make it owner-only.
*
* `mode: 0o700` is the POSIX half of that promise. The Windows half has to be
* an ACL, and it has to be applied to the *directory* rather than only to the
* document: inheritance flows downward, so a directory that grants a lower-trust
* principal read access hands that access to every document created or replaced
* inside it. That is exactly the shape the audit found on a real host — the
* harness home granted a local sandbox group read-and-execute, and the atomic
* replace copied it onto the credentials document. Protecting the directory
* keeps the provider's own writes from ever producing a document that its read
* check would then have to refuse.
* @param dir - the parent directory to create and restrict.
* @throws when the directory cannot be created or restricted to its owner.
*/
async function ensureOwnerOnlyDir(dir) {
	await mkdir(dir, {
		recursive: true,
		mode: 448
	});
	await enforceOwnerOnlyAcl(dir);
}
/**
* Commit the document atomically, then narrow its access control to the owner.
*
* The two steps are one operation on purpose. `writeFileAtomic` publishes a
* freshly created inode, and on Windows a fresh inode inherits its parent
* directory's access entries — so a harness home that grants another local
* principal read access would hand that access to every replacement document.
* Re-applying the owner-only DACL after the rename is what makes the provider's
* promise hold on Windows as the POSIX mode does on POSIX, and doing it here
* keeps every commit path (reference write, record write, record delete,
* pre-release migration) from having to remember it separately.
* @param filename - absolute path of the document.
* @param content - complete next document text.
* @throws when the atomic write fails, or when the owner-only restriction cannot be applied.
*/
async function commitDocument(filename, content) {
	await writeFileAtomic(filename, content, {
		mode: 384,
		dirMode: 448
	});
	await enforceOwnerOnlyAcl(filename);
}
/**
* Reject a credentials document other OS users can read, before its contents
* are read at all. The provider creates and replaces the file at `0600`, but a
* hand-written or externally generated one carries whatever protection its
* parent directory granted it, and silently serving secrets out of a document
* another local principal can read would make the owner-only promise
* meaningless.
*
* Both platforms are checked, each on its own terms rather than one being
* skipped: POSIX inspects the permission bits, Windows inspects the DACL for
* access granted to a principal other than the owner, `SYSTEM`, and
* `Administrators`. Windows cannot express an owner-only document as a mode, so
* the absence of a mode to inspect is no longer a reason to make no decision at
* all — see `./owner-only-acl.ts` for how the ACL is read and narrowed.
* @param filename - absolute path of the document.
* @throws when the path hierarchy is invalid, or when the file exists and grants
*   access beyond its owner, naming the repair command for the current platform.
*/
async function assertOwnerOnly(filename) {
	let mode;
	try {
		mode = (await stat(filename)).mode;
	} catch (error) {
		if (!isENOENT(error)) throw error;
		await canonicalizeWatchPath(filename);
		return;
	}
	if (process.platform === "win32") {
		const inspection = await inspectOwnerOnlyAcl(filename);
		if (inspection === void 0) throw new Error(`credentials-local: ${filename} could not be verified as owner-only (its access control list was unreadable); restrict it with 'icacls "${filename}" /reset /inheritance:r /grant:r "*<owner-sid>:(F)"' or remove it before starting again`);
		if (inspection.ownerOnly) return;
		const principals = inspection.entries.filter((entry) => entry.allow).map((entry) => entry.sid).join(", ");
		throw new Error(`credentials-local: ${filename} is readable beyond its owner (access granted to ${principals}); restrict it with 'icacls "${filename}" /reset /inheritance:r /grant:r "*<owner-sid>:(F)"' before starting again`);
	}
	if ((mode & GROUP_OTHER_BITS) === 0) return;
	throw new Error(`credentials-local: ${filename} is readable beyond its owner (mode ${(mode & 511).toString(8)}); run "chmod 600 ${filename}" before starting again`);
	/* v8 ignore stop */
}
/** Whether a filesystem error means absence; every non-ENOENT failure must surface. */
function isENOENT(error) {
	return error?.code === "ENOENT";
}
/**
* Describe one YAML parse failure without quoting the source. The parser's own
* message embeds the offending line, which here holds a secret.
* @param error - the parser's error.
* @returns the error code with its line and column.
*/
function describeYamlError(error) {
	const at = error.linePos?.[0];
	/* v8 ignore next -- `prettyErrors` populates linePos on every error; the guard answers its optional type */
	const where = at === void 0 ? "" : ` at line ${String(at.line)}, column ${String(at.col)}`;
	return `${error.code}${where}`;
}
/** The document layout this build reads and writes. */
const DOCUMENT_VERSION = 1;
/**
* Parse one credentials document. Everything is rejected rather than skipped —
* an unversioned root, an unknown top-level key, a key that is not addressable,
* a wrong-typed value, an unknown record tag or field — because this file holds
* nothing but credentials and a silently ignored entry reads as "the credential
* I stored has no effect". Duplicate keys surface as parser errors. An empty
* document is an empty store and needs no version.
* @param text - the document's text.
* @param filename - absolute path, quoted in errors.
* @returns the parsed references and records.
*/
function parseCredentialsDocument(text, filename) {
	const document = parseDocument(text, {
		prettyErrors: true,
		uniqueKeys: true
	});
	if (document.errors.length > 0) throw new Error(`credentials-local: invalid document at ${filename}: ${document.errors.map(describeYamlError).join("; ")}`);
	const root = document.toJS() ?? {};
	if (typeof root !== "object" || root === null || Array.isArray(root)) throw new TypeError(`credentials-local: ${filename} must be a mapping`);
	const fields = root;
	const keys = Object.keys(fields);
	if (keys.length === 0) return {
		refs: /* @__PURE__ */ new Map(),
		records: /* @__PURE__ */ new Map()
	};
	if (!("version" in fields)) throw new Error(`credentials-local: ${filename} uses the pre-release flat layout. Add \`version: 1\` and nest the existing ${keys.length} ${keys.length === 1 ? "entry" : "entries"} under \`refs:\`. No values need to change.`);
	if (fields["version"] !== 1) throw new Error(`credentials-local: ${filename} declares version ${JSON.stringify(fields["version"])}; this build reads version 1`);
	for (const key of keys) if (key !== "version" && key !== "refs" && key !== "records") throw new Error(`credentials-local: unknown top-level key "${key}" in ${filename}`);
	return {
		refs: parseRefs(fields["refs"], filename),
		records: parseRecords(fields["records"], filename)
	};
}
/**
* Render the version-1 layout for a pre-release flat document, or `undefined`
* for anything else. The flat layout is recognized exactly — a non-empty
* top-level mapping of addressable reference names to non-empty string
* scalars, with no `version` key and no document directives — and the rewrite
* nests the original lines verbatim under `refs:` at two spaces' indent, so
* comments, blank lines, and each value's spelling survive byte for byte.
* Anything the recognizer declines keeps {@link parseCredentialsDocument}'s
* loud rejection: a document this build cannot prove it understands is never
* rewritten. Remove with the pre-release stance at the first tagged release.
* @param text - the document's text.
* @returns the migrated text, or `undefined` when the text is not the recognized flat layout.
*/
function renderFlatLayoutMigration(text) {
	const document = parseDocument(text, {
		prettyErrors: true,
		uniqueKeys: true
	});
	if (document.errors.length > 0) return void 0;
	const flat = document.contents;
	if (!isMap(flat) || flat.items.length === 0) return void 0;
	for (const line of text.split("\n")) if (/^(%|---|\.\.\.)/.test(line)) return void 0;
	for (const pair of flat.items) {
		if (!isScalar(pair.key) || typeof pair.key.value !== "string" || pair.key.value === "version") return void 0;
		try {
			credentialRef(pair.key.value);
		} catch {
			return;
		}
		if (!isScalar(pair.value) || typeof pair.value.value !== "string" || pair.value.value.length === 0) return void 0;
	}
	return `version: 1\nrefs:\n${text.split("\n").map((line) => line.length === 0 ? line : `  ${line}`).join("\n")}${text.endsWith("\n") ? "" : "\n"}`;
}
/** Admit a `refs` section: POSIX-identifier keys over non-empty string values. */
function parseRefs(section, filename) {
	const entries = /* @__PURE__ */ new Map();
	for (const [key, value] of Object.entries(asSection(section, "refs", filename))) {
		credentialRef(key);
		if (typeof value !== "string") throw new TypeError(`credentials-local: the value for "${key}" in ${filename} must be a string`);
		if (value.length === 0) throw new Error(`credentials-local: the value for "${key}" in ${filename} is empty; remove the key instead`);
		entries.set(key, value);
	}
	return entries;
}
/** Admit a `records` section: `<scope>/<id>` keys over tagged record mappings. */
function parseRecords(section, filename) {
	const entries = /* @__PURE__ */ new Map();
	for (const [key, value] of Object.entries(asSection(section, "records", filename))) {
		parseCredentialKey(key);
		entries.set(key, parseRecord(key, value, filename));
	}
	return entries;
}
/**
* Refuse an api-key record the read path could not admit, before it is
* rendered: an empty key, an env name outside the reference grammar, or an
* empty env value would persist a document `parseRecord` rejects at the next
* boot — a durable-boundary write is validated where it is written.
* @param key - the record's credential key, for the failure message.
* @param record - the api-key record a mutation returned.
*/
function assertStorableApiKey(key, record) {
	if (record.key !== void 0 && record.key.length === 0) throw new TypeError(`credentials-local: record "${key}" has an empty key; omit the field instead`);
	for (const [name, value] of Object.entries(record.env ?? {})) {
		credentialRef(name);
		if (value.length === 0) throw new TypeError(`credentials-local: record "${key}" env "${name}" must be a non-empty string`);
	}
}
/** One section of the document as a plain mapping; absent and null both mean empty. */
function asSection(section, name, filename) {
	if (section === void 0 || section === null) return {};
	if (typeof section !== "object" || Array.isArray(section)) throw new TypeError(`credentials-local: "${name}" in ${filename} must be a mapping`);
	return section;
}
/** Admit one record entry, rejecting an unknown tag or field rather than dropping it. */
function parseRecord(key, value, filename) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`credentials-local: record "${key}" in ${filename} must be a mapping`);
	const fields = value;
	const kind = fields["kind"];
	if (kind === "api-key") {
		assertFields(key, fields, [
			"kind",
			"key",
			"env"
		], filename);
		const apiKey = fields["key"];
		if (apiKey !== void 0 && (typeof apiKey !== "string" || apiKey.length === 0)) throw new TypeError(`credentials-local: record "${key}" in ${filename} has a non-string or empty key`);
		const env = parseRecordEnv(key, fields["env"], filename);
		return {
			kind: "api-key",
			...apiKey === void 0 ? {} : { key: apiKey },
			...env === void 0 ? {} : { env }
		};
	}
	if (kind === "grant") {
		assertFields(key, fields, ["kind", "payload"], filename);
		if (!("payload" in fields)) throw new Error(`credentials-local: record "${key}" in ${filename} has no payload`);
		assertJsonValue(`record "${key}" payload in ${filename}`, fields["payload"], /* @__PURE__ */ new Set());
		return {
			kind: "grant",
			payload: fields["payload"]
		};
	}
	if (kind === void 0) throw new Error(`credentials-local: record "${key}" in ${filename} has no kind`);
	throw new Error(`credentials-local: record "${key}" in ${filename} has unknown kind ${JSON.stringify(kind)}`);
}
/** Reject a field the tag does not define, so a typo is not silently dropped. */
function assertFields(key, fields, allowed, filename) {
	for (const field of Object.keys(fields)) if (!allowed.includes(field)) throw new Error(`credentials-local: record "${key}" in ${filename} has unknown field "${field}"`);
}
/** Admit an api-key record's provider environment: POSIX names over non-empty strings. */
function parseRecordEnv(key, env, filename) {
	if (env === void 0) return void 0;
	if (typeof env !== "object" || env === null || Array.isArray(env)) throw new TypeError(`credentials-local: record "${key}" in ${filename} has a non-mapping env`);
	const parsed = {};
	for (const [name, value] of Object.entries(env)) {
		credentialRef(name);
		if (typeof value !== "string" || value.length === 0) throw new TypeError(`credentials-local: record "${key}" env "${name}" in ${filename} must be a non-empty string`);
		parsed[name] = value;
	}
	return parsed;
}
/**
* Reject a payload that cannot survive a JSON round trip, on the way in and on
* the way out. The seam promises owners their payload comes back exactly as
* written, and both directions can break that: a document may spell `.inf` or
* an alias cycle, and an owner may hand over a `Date`, a class instance, or a
* `bigint` that this document has no faithful spelling for. Neither the value
* nor any nested value is quoted in a diagnostic.
* @param where - the subject named in a diagnostic, already free of any value.
* @param value - the payload or nested value to admit.
* @param seen - objects on the current path, for cycle detection.
* @throws TypeError naming `where` when the value cannot round-trip.
*/
function assertJsonValue(where, value, seen) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return;
	if (typeof value === "number") {
		if (Number.isFinite(value)) return;
		throw new TypeError(`credentials-local: ${where} holds a non-finite number`);
	}
	if (typeof value === "object") {
		if (seen.has(value)) throw new TypeError(`credentials-local: ${where} is cyclic`);
		if (Object.getPrototypeOf(value) === Object.prototype || Array.isArray(value)) {
			seen.add(value);
			for (const nested of Object.values(value)) assertJsonValue(where, nested, seen);
			seen.delete(value);
			return;
		}
	}
	throw new TypeError(`credentials-local: ${where} holds a value JSON cannot represent`);
}
/**
* The comment-preserving mutable tree one edit renders from. Editing the
* parsed document rather than rebuilding it keeps comments and the formatting
* of every untouched entry; an absent document starts a fresh one.
* @param text - the current document text, `undefined` while the file is absent.
* @returns the tree to edit, carrying this build's version stamp.
*/
function mutableDocument(text) {
	const document = text === void 0 ? new Document({}) : parseDocument(text);
	document.setIn(["version"], 1);
	return document;
}
/**
* Render the next document text with one reference set or deleted.
* @param text - the current document text, `undefined` while the file is absent.
* @param ref - the reference to write.
* @param value - the new value, or `undefined` to delete the key.
* @returns the text to persist.
*/
function renderRef(text, ref, value) {
	const document = mutableDocument(text);
	if (value === void 0) deleteSectionEntry(document, "refs", ref);
	else document.setIn(["refs", ref], value);
	return document.toString();
}
/**
* Render the next document text with one record written or deleted. The record
* node is replaced wholesale rather than edited field by field: records are
* machine-written, so there is no hand formatting inside one to preserve.
* @param text - the current document text, `undefined` while the file is absent.
* @param key - the record to write.
* @param record - the new record, or `undefined` to delete it.
* @returns the text to persist.
*/
function renderRecord(text, key, record) {
	const document = mutableDocument(text);
	if (record === void 0) deleteSectionEntry(document, "records", key);
	else document.setIn(["records", key], record);
	return document.toString();
}
/**
* Remove one entry from a section, taking its annotation with it. A comment
* block written above a section's first entry annotates that entry, but the
* parser attaches it to the section's map rather than to the pair — leaving it
* behind would move it onto whichever entry became first, which reads as an
* annotation of a credential nobody wrote it for.
* @param document - the mutable tree being edited.
* @param section - the section holding the entry.
* @param key - the entry to remove.
*/
function deleteSectionEntry(document, section, key) {
	const map = document.get(section, true);
	/* v8 ignore next -- both callers render a delete only for an entry they just
	found in the parsed snapshot, so the section it lives in is always a map;
	the guard is what narrows `get`'s `unknown`. */
	if (isMap(map)) {
		const first = map.items[0];
		/* v8 ignore next -- a map that holds the entry has a first item, and the
		parser admits only scalar keys, so only the identity test can be false. */
		if (first !== void 0 && isScalar(first.key) && first.key.value === key) map.commentBefore = null;
	}
	document.deleteIn([section, key]);
}
/**
* Structural equality over two admitted JSON values. Records reach this after
* {@link assertJsonValue}, so the walk meets only JSON shapes; key order is
* ignored because an external editor may reorder a record's fields without
* changing what it stores.
* @param left - one value.
* @param right - the other value.
* @returns whether the two carry the same JSON content.
*/
function sameJsonValue(left, right) {
	if (left === right) return true;
	if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
	if (Array.isArray(left) !== Array.isArray(right)) return false;
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	return leftKeys.every((key) => key in right && sameJsonValue(left[key], right[key]));
}
/** File-backed credentials provider (`$DSH_HOME/.credentials.yaml`). */
var LocalCredentialProvider = class extends CredentialProvider {
	config;
	static Config = z.object({
		path: z.string(),
		dshHome: z.string(),
		watch: z.boolean().default(true),
		debounceMs: z.number().min(0).default(100)
	});
	spec;
	/**
	* Raw text of the last read or persisted document; `undefined` while the
	* file is absent. Watcher events whose content equals this cache are no-ops,
	* which is also the self-write suppression.
	*/
	text;
	/** Parsed reference snapshot; replaced wholesale on every reload. */
	values = /* @__PURE__ */ new Map();
	/** Parsed record snapshot; replaced wholesale on every reload. */
	records = /* @__PURE__ */ new Map();
	/**
	* Single exclusive operation chain: watcher reloads and line edits run one
	* at a time in queue order (settled tail), so an edit can never render from
	* text a concurrent reload is busy replacing.
	*/
	operations = Promise.resolve();
	/** Set at dispose: refuse new writes and let in-flight work no-op. */
	closed = false;
	/** Opaque read of {@link closed}: control flow cannot narrow it across awaits. */
	isClosed() {
		return this.closed;
	}
	constructor(ctx, config) {
		super(ctx);
		this.config = config;
		this.spec = resolveSpec(config);
	}
	/** The inherited-environment value for a reference, or `undefined` when empty or unset. */
	inherited(ref) {
		const entry = launchEnvironmentOf(this.ctx).getFrom(ref, ["process"]);
		return entry !== void 0 && entry.value.length > 0 ? entry.value : void 0;
	}
	/**
	* The `.env` fallback for a reference — below the managed store, never above
	* it. The invoking project ranks over the user's home file, matching the
	* environment layering: the more specific location wins.
	*/
	dotenvFallback(ref) {
		const entry = launchEnvironmentOf(this.ctx).getFrom(ref, ["project-env", "user-env"]);
		return entry !== void 0 && entry.value.length > 0 ? entry : void 0;
	}
	async *[Service.init]() {
		yield async () => {
			this.closed = true;
			await this.operations;
		};
		await this.loadInitial();
		if (!this.spec.watch) return;
		const watcher = watch(await canonicalizeWatchPath(this.spec.filename), {
			ignoreInitial: true,
			awaitWriteFinish: {
				stabilityThreshold: this.spec.debounceMs,
				pollInterval: Math.max(1, Math.min(this.spec.debounceMs, 10))
			}
		});
		watcher.on("all", () => {
			if (this.closed) return;
			this.queueRefresh();
		});
		watcher.on("ready", () => {
			if (this.closed) return;
			this.queueRefresh();
		});
		watcher.on("error", (error) => {
			this.ctx.logger.warn("credentials-local: watcher error on %s", this.spec.filename);
			this.ctx.logger.warn(error);
		});
		yield async () => {
			this.closed = true;
			await watcher.close();
			await this.operations;
		};
	}
	resolve(ref) {
		const inherited = this.inherited(ref);
		if (inherited !== void 0) return Promise.resolve({
			value: inherited,
			source: "env"
		});
		const stored = this.values.get(ref);
		if (stored !== void 0) return Promise.resolve({
			value: stored,
			source: "file"
		});
		const fallback = this.dotenvFallback(ref);
		if (fallback !== void 0) return Promise.resolve({
			value: fallback.value,
			source: fallback.source
		});
		return Promise.resolve(void 0);
	}
	describe(ref) {
		if (this.inherited(ref) !== void 0) return Promise.resolve({
			configured: true,
			source: "env",
			writable: false
		});
		if (this.values.get(ref) !== void 0) return Promise.resolve({
			configured: true,
			source: "file",
			writable: true
		});
		const fallback = this.dotenvFallback(ref);
		if (fallback !== void 0) return Promise.resolve({
			configured: true,
			source: fallback.source,
			writable: true
		});
		return Promise.resolve({
			configured: false,
			writable: true
		});
	}
	async set(ref, value) {
		if (value.length === 0) throw new Error(`credentials-local: an empty value cannot be stored for "${ref}"; use unset`);
		await this.write(ref, value);
	}
	async unset(ref) {
		await this.write(ref, void 0);
	}
	readRecord(key) {
		return Promise.resolve(this.records.get(key));
	}
	describeRecord(key) {
		const stored = this.records.get(key);
		if (stored === void 0) return Promise.resolve({
			configured: false,
			writable: true
		});
		return Promise.resolve({
			configured: true,
			kind: stored.kind,
			writable: true
		});
	}
	listRecords() {
		return Promise.resolve([...this.records].map(([key, record]) => ({
			key: parseCredentialKey(key),
			kind: record.kind
		})));
	}
	async modifyRecord(key, mutate) {
		if (this.isClosed()) throw new Error(`credentials-local is disposed: cannot modify "${key}"`);
		return this.enqueue(async () => {
			if (this.isClosed()) throw new Error(`credentials-local was disposed before the queued "${key}" modify ran`);
			await ensureOwnerOnlyDir(dirname(this.spec.filename));
			return withFileLock(this.spec.filename, async () => {
				await this.reconcileFromDisk();
				const current = this.records.get(key);
				const next = await mutate(current);
				if (next === void 0) return current;
				if (next.kind === "grant") assertJsonValue(`record "${key}" payload`, next.payload, /* @__PURE__ */ new Set());
				else assertStorableApiKey(key, next);
				const nextText = renderRecord(this.text, key, next);
				await commitDocument(this.spec.filename, nextText);
				this.text = nextText;
				this.records.set(key, next);
				this.notifyRecordUpdated(key);
				return next;
			}, { waitMs: DOCUMENT_LOCK_WAIT_MS });
		});
	}
	async deleteRecord(key) {
		if (this.isClosed()) throw new Error(`credentials-local is disposed: cannot delete "${key}"`);
		await this.enqueue(async () => {
			if (this.isClosed()) throw new Error(`credentials-local was disposed before the queued "${key}" delete ran`);
			await ensureOwnerOnlyDir(dirname(this.spec.filename));
			await withFileLock(this.spec.filename, async () => {
				await this.reconcileFromDisk();
				if (!this.records.has(key)) return;
				const nextText = renderRecord(this.text, key, void 0);
				await commitDocument(this.spec.filename, nextText);
				this.text = nextText;
				this.records.delete(key);
				this.notifyRecordUpdated(key);
			}, { waitMs: DOCUMENT_LOCK_WAIT_MS });
		});
	}
	/** Queue one exclusive document operation behind every earlier one. */
	enqueue(operation) {
		const task = this.operations.then(operation);
		this.operations = task.then(() => void 0, () => void 0);
		return task;
	}
	/** Queue a reload; only an invariant violation escaping the fan-out can reject it. */
	queueRefresh() {
		this.enqueue(() => this.refresh()).catch((error) => {
			this.ctx.logger.error("credentials-local: reload commit failed at %s", this.spec.filename);
			this.ctx.logger.error(error);
		});
	}
	/** Queue one line edit; entry checks reject early, the queue re-judges them at run time. */
	async write(ref, value) {
		const verb = value === void 0 ? "unset" : "set";
		if (this.isClosed()) throw new Error(`credentials-local is disposed: cannot ${verb} "${ref}"`);
		this.assertUnshadowed(ref, verb);
		return this.enqueue(async () => {
			if (this.isClosed()) throw new Error(`credentials-local was disposed before the queued "${ref}" ${verb} ran`);
			this.assertUnshadowed(ref, verb);
			await ensureOwnerOnlyDir(dirname(this.spec.filename));
			await withFileLock(this.spec.filename, async () => {
				await this.reconcileFromDisk();
				const existing = this.values.get(ref);
				if (value === void 0 && existing === void 0) return;
				const nextText = renderRef(this.text, ref, value);
				await commitDocument(this.spec.filename, nextText);
				this.text = nextText;
				if (value === void 0) this.values.delete(ref);
				else this.values.set(ref, value);
				this.notifyUpdated(ref);
			}, { waitMs: DOCUMENT_LOCK_WAIT_MS });
		});
	}
	/**
	* Reject a write the inherited environment would shadow into apparent
	* no-effect. Only that layer can shadow a write: everything else this
	* provider resolves ranks below the document being written.
	*/
	assertUnshadowed(ref, verb) {
		if (this.inherited(ref) !== void 0) throw new Error(`credentials-local: "${ref}" is supplied read-only by the launching environment, so ${verb} would be shadowed; unset it in the shell you start dsh from instead`);
	}
	/**
	* Boot read: an absent file is an empty store; an invalid one fails the
	* plugin's activation, because a credentials document that exists but
	* cannot be trusted must never be treated as "no credentials stored". The
	* one exception is the recognized pre-release flat layout, which is
	* upgraded in place first — a key stored by an earlier build must survive
	* the layout change without a hand edit.
	*/
	async loadInitial() {
		await assertOwnerOnly(this.spec.filename);
		let text;
		try {
			text = await readFile(this.spec.filename, "utf8");
		} catch (error) {
			if (!isENOENT(error)) throw error;
			return;
		}
		if (renderFlatLayoutMigration(text) !== void 0) text = await this.migrateFlatDocument();
		const document = parseCredentialsDocument(text, this.spec.filename);
		this.values = document.refs;
		this.records = document.records;
		this.text = text;
	}
	/**
	* One-shot upgrade of the recognized pre-release flat layout, before the
	* watcher exists. The rewrite runs under the document's writer lock and
	* re-reads first — a concurrent boot may have migrated already — and
	* whatever the re-read finds that is not the flat layout is returned
	* untouched for the ordinary parse. Values are carried verbatim; only the
	* enclosing layout changes. Remove with the pre-release stance at the
	* first tagged release.
	* @returns the document text this boot should parse.
	*/
	async migrateFlatDocument() {
		return withFileLock(this.spec.filename, async () => {
			const current = await readFile(this.spec.filename, "utf8");
			const migrated = renderFlatLayoutMigration(current);
			/* v8 ignore next 2 -- the losing side of the cross-process migration race:
			another boot rewrote the document between the unlocked recognize and
			this lock. That interleaving cannot be scheduled deterministically
			through a whole boot (migration.spec drives it best-effort); the
			decision itself is the recognizer's covered versioned-document decline. */
			if (migrated === void 0) return current;
			await commitDocument(this.spec.filename, migrated);
			this.ctx.logger.info("credentials-local: migrated %s to the version %d layout; values are unchanged", this.spec.filename, 1);
			return migrated;
		}, { waitMs: DOCUMENT_LOCK_WAIT_MS });
	}
	/**
	* Re-read the document after a watcher event. Unchanged content (including
	* this provider's own writes) is a no-op; an unreadable document keeps the
	* last good snapshot and warns — a live hot-reload must never take the
	* process down. An invariant violation escaping the fan-out is not a reload
	* failure and propagates to the queue's error surface.
	*/
	async refresh() {
		if (this.closed) return;
		try {
			await this.reconcileFromDisk();
		} catch (error) {
			if (error?.code === "INVARIANT") throw error;
			this.ctx.logger.warn("credentials-local: reload failed at %s; keeping the last good document", this.spec.filename);
			this.ctx.logger.warn(error);
		}
	}
	/**
	* Compare the on-disk text against the cache and publish any difference
	* into the seam. Absence publishes the empty store; an unreadable or
	* invalid document throws, so each caller picks its policy — a reload warns
	* and keeps the last good snapshot, a write fails loud rather than
	* overwriting a document it could not understand.
	*/
	async reconcileFromDisk() {
		await assertOwnerOnly(this.spec.filename);
		let text;
		try {
			text = await readFile(this.spec.filename, "utf8");
		} catch (error) {
			if (!isENOENT(error)) throw error;
			text = void 0;
		}
		if (text === this.text || this.isClosed()) return;
		const next = text === void 0 ? {
			refs: /* @__PURE__ */ new Map(),
			records: /* @__PURE__ */ new Map()
		} : parseCredentialsDocument(text, this.spec.filename);
		const changedRefs = this.changedRefs(this.values, next.refs);
		const changedRecords = this.changedRecords(this.records, next.records);
		this.text = text;
		this.values = next.refs;
		this.records = next.records;
		for (const ref of changedRefs) this.notifyUpdated(ref);
		for (const key of changedRecords) this.notifyRecordUpdated(key);
	}
	/** Entries whose stored value changed; the parser has already proven every key addressable. */
	changedRefs(prev, next) {
		const changed = [];
		for (const key of new Set([...prev.keys(), ...next.keys()])) {
			if (prev.get(key) === next.get(key)) continue;
			changed.push(credentialRef(key));
		}
		return changed;
	}
	/** Records whose stored value changed; the parser has already proven every key addressable. */
	changedRecords(prev, next) {
		const changed = [];
		for (const key of new Set([...prev.keys(), ...next.keys()])) {
			if (sameJsonValue(prev.get(key), next.get(key))) continue;
			changed.push(parseCredentialKey(key));
		}
		return changed;
	}
};
//#endregion
export { CREDENTIALS_FILENAME, DOCUMENT_VERSION, LocalCredentialProvider, LocalCredentialProvider as default, parseCredentialsDocument, renderFlatLayoutMigration, resolveSpec };
