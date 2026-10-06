# Claude-Code → DeepSeek-Harness compatibility

Five scripts, one table:

| file | role |
| --- | --- |
| `mapping.json` | **the naming transfer table.** Data only: it names every CC artifact kind, says what dsh target it becomes, and maps names between the two vocabularies — including CC tool names, which drive both hook matchers and body text. |
| `install.mjs` | fetches a fixed repository list and copies `SKILL.md` skills into `~/.dsh/skills/cc-<owner>__<repo>/`. |
| `compile.mjs` | executes `mapping.json`: emits `cmd-*` / `agent-*` skills and MCP rows from the fetched sources. Importable — `plugin-install.mjs` reuses its emitters. |
| `plugin-install.mjs` | **the plugin installer.** Reads a URL list, resolves Claude Code *marketplaces* and *plugins*, and emits skills, commands, agents, MCP rows, and generated hook configs. |
| `transform.mjs` | the harness-mismatch repairs: hook commands routed off their spawning wrappers, matchers translated, and skill bodies rewritten so a dangling reference or a CC-only token still resolves. |
| `hook-shim.cjs` | in-process hook runner. Replaces the spawn that dsh's shell refuses, so a registered hook actually runs. |
| `audit.mjs` | read-only fidelity audit over the installed corpus: inventory, Claude-Code-isms, dangling references, completeness against the source checkouts. |
| `verify-roots.mjs` | counts what is actually discoverable under each configured root. |
| `repos.txt` | the URL list `plugin-install.mjs` installs, one reference per line. |
| `generated-mcp.patch.yml` | MCP rows produced from CC `mcp.json` / `.mcp.json`. |
| `generated-hooks.patch.yml` | `hooks-claude-code` rows, pointing at `generated-hooks/<plugin>.json`. |
| `generated-hooks/*.json` | derived hook configs: matchers translated, commands shim-routed, unsupported events dropped. |

```powershell
node plugin-install.mjs                       # every repository in repos.txt
node plugin-install.mjs --reload-hooks        # …and make a regenerated hook config take effect
node plugin-install.mjs https://github.com/affaan-m/ECC
node plugin-install.mjs --dry owner/repo      # resolve and report, write nothing
node compile.mjs                              # table only, e.g. after a mapping edit
node audit.mjs                                # read-only fidelity audit
node verify-roots.mjs                         # count discoverable skills
```

`--reload-hooks` exists because the hook bridge reads its config **once, when the plugin mounts**: a regenerated `generated-hooks/<plugin>.json` is otherwise ignored until the host restarts. The flag unmounts and remounts the hook rows in the profile patch, which the host reconciles live — no restart. It is opt-in because an install must not rewrite a user composition on its own, and the rows always go back exactly as they were.

The sources are never rewritten: every rule describes an *output*, and the compiler is the only thing that knows how to produce it. Correcting a mapping means editing `mapping.json`, never the CC repository.

## The plugin model

Claude Code distributes capability as plugins: a marketplace manifest names plugins, each plugin ships a `plugin.json`, and its components live in convention directories. `plugin-install.mjs` reads exactly that, which is why a URL list is enough:

| CC artifact | dsh target | status |
| --- | --- | --- |
| `**/SKILL.md` | copied into the plugin's root, then made user-invocable (see below) | native |
| `commands/*.md` | `cmd-<stem>/SKILL.md`, user-invocable, model invocation off | compiled |
| `**/agents/*.md` | `agent-<owner>-<name>/SKILL.md`, user-invocable, model invocation off | compiled |
| `mcp.json` / `.mcp.json` | one `dsh-mcp-client` row per server | compiled |
| `hooks/hooks.json` | one `dsh-hooks-claude-code` row per plugin, **opt-in** | compiled |
| `plugin.json`, `marketplace.json` | plugin identity and membership — drives the install, not an artifact | consumed |
| `rules/`, `contexts/`, `manifests/` | no dsh equivalent; the same content is reachable through the plugin's skills | unsupported |

A marketplace `plugin.source` is a path relative to the repository, so `source: "./plugin"` (as agentmemory declares) is normal. Also carried: CC tool names → dsh tool names (`Read`→`read`, `Bash`→`pwsh`, `Task`→`subagent`, …) and the `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PROJECT_DIR}` / `$ARGUMENTS` variables, substituted into emitted bodies.

## Traps that silently lose content

Each was hit live. None of them raises an error: every one costs artifacts and looks like a successful install.

**1. `skill-filesystem` is `disabled: true` in the `web-app` bundle.** An id-targeted patch that only sets `config` is applied — the dump shows `customSkillDirs` — and still discovers nothing, because the plugin never mounts. The profile patch must also declare `disabled: false`:

```yaml
- id: skill-filesystem
  disabled: false
  config:
    customSkillDirs:
      - "!!js dshHomePath('skills', 'cc-<owner>__<repo>')"
```

**2. dsh skill names are `^[a-z0-9]+(?:-[a-z0-9]+)*$`.** Claude Code's alphabet is wider, and CC agent names are snake_case (`abstract_bilingual_agent`). `skill-filesystem` skips such a file with a warning in the host log and no failure anywhere else, so a verbatim copy loses the whole artifact. Names are therefore transliterated (runs outside the alphabet collapse into one hyphen, collisions get a `-2` suffix) and the original survives in `x-dsh-cc-agent-name` / `x-dsh-cc-command`.

**3. Two skills with the same declared name overwrite each other.** A skill's directory is its declared `name`, so copying a corpus that repeats a name silently keeps only the last one — ECC ships nine variants of `coding-standards` (canonical, `.agents/` and `.kiro/` mirrors, seven `docs/<lang>/` translations), and 903 sources collapsed to 294 directories with no warning at all. `installSkills` now groups by base name first and spells the tree out only for a CONTESTED name (`coding-standards`, `coding-standards-zh-cn`, …), so a repository with a single skill tree keeps the bare names it declares. `clearCopiedSkills` drops the previous copies first, so a re-run is idempotent even after a naming change.

**4. The invocation policy must not retire a skill that is already user-hidden.** A skill declaring `user-invocable: false` is model-only by the SOURCE's intent; adding `disable-model-invocation: true` on top leaves it reachable by neither path, and it simply vanishes from every list. Eight agentmemory reference skills declare exactly that, so `applyInvocationPolicy` leaves them model-invocable and reports them as `user-hidden`.

**5. A name must be unique across ROOTS, not only within one.** The skill registry keys on the declared name, so two different skills that share one name across two repositories collapse into a single catalog entry and the loser becomes unreachable — silently, with both directories present on disk. Measured: 5 such pairs (`deep-research`, `gget`, `exa-search`, `literature-review`, `scholar-evaluation`), every one with different content. A root that claims a name first keeps it; a later root is qualified with its own plugin slug (`deep-research-ecc`).

Completeness cannot be checked by comparing names alone — a collision leaves the name present with the wrong body. Compare directory counts against source counts per root, and reconcile the live catalog against the disk.

## Layout constraint

`skill-filesystem` discovers only the **immediate children** of a root — a directory holding `SKILL.md`, or a flat `.md` file. So:

- each repository gets its own root (`cc-<owner>__<repo>`), and a repository that ships **several** plugins gets one root per plugin (`cc-<owner>__<repo>__<plugin>`);
- a repository that ships a **single** plugin keeps one root even when that plugin's source is a subdirectory — a second root would duplicate every skill the first one contributed;
- every compiled `cmd-*` / `agent-*` directory sits directly beside the copied skills.

`plugin-install.mjs` deletes only directories it owns (`cmd-*`, `agent-*`) before rewriting, so re-running is idempotent and installer copies are refreshed in place rather than duplicated.

## Catalog size

The skill catalog is assembled into **every** request, so a bulk import would be paid for on every turn. `mapping.json` carries a `policies.importedSkillInvocation` entry, and the compiler sets `disable-model-invocation: true` on copied skills *and* on compiled commands and agents. A source the size of ECC (903 skills, 424 commands, 307 agents) would otherwise multiply the catalog by an order of magnitude.

Everything stays reachable as `/skill <name>` and by explicit invocation. Model-invocable: the four curated skills plus whatever a user opts back in by editing a copy's frontmatter.

## Enabling the generated MCP and hook rows

Both fragments are deliberately separate: appending them to a profile patch changes your own composition, and a server or hook that misbehaves takes a live turn down with it.

MCP rows are inert until a tool is called. Env values that CC spells `${VAR}` or `${VAR:-default}` are emitted as `!!js` expressions, because `dsh-mcp-client` hands `config.env` to the child verbatim (`z.dict(String)`) and would otherwise pass the token as literal text; the expression reads `process.env` at load time instead of baking a secret into the patch file.

## Hooks: two mismatches, both silent

A hook copied faithfully from Claude Code is registered, invoked, and has **no effect** — nothing in any log says the check never ran. Two independent causes, both measured live.

**The spawn.** A CC hook command is not the script; it is an inline `node -e` bootstrap that `spawnSync`s the entry, and ECC's `run-with-flags.js` spawns *again* for any hook exporting no `run()` — and again whenever its own `require()` throws. dsh's shell denies a hook child the pipes a piped spawn needs, so the child died with `spawnSync … EPERM`, the wrapper emitted empty stdout and exited 0. Measured: 33 of 87 hook invocations in one session were EPERM failures. `hook-shim.cjs` runs the target **in-process**, with the same preparation as ECC's bootstrap (plugin-root env, agent data home, argv) and the same passthrough suppression — verified byte-identical on stdout against the original. In `--gated` mode it asks ECC's own `hook-flags.js` whether the hook is enabled, so `ECC_HOOKS_ENABLED` / `ECC_HOOK_PROFILE` / `ECC_DISABLED_HOOKS` keep their exact meaning, and it calls a `run()`-exporting hook itself. `transform.mjs` recognises all three shapes a CC hook ships its target in (bootstrap tail, hand-rolled `spawnSync`, `require(s).cli()`); the generated config contains zero `spawnSync` and zero references to `run-with-flags.js`.

**The matcher.** A matcher is a regex over the TOOL NAME, and CC names tools `Bash` / `Write` / `Edit` while dsh names them `pwsh` / `write` / `edit`. Measured before the fix: only the `.*` catch-all entries ever fired, so every tool-named gate was dead in principle. Matchers are translated through `mapping.json`, and duplicates collapse (`Bash|PowerShell|Write|Edit|MultiEdit` → `pwsh|write|edit`).

A hook row therefore never points at a source `hooks.json`. `plugin-install.mjs` generates `cc-compat/generated-hooks/<plugin>.json` with matchers translated, commands routed through the shim, and unsupported events dropped. The bridge reads its config **once at load**, so regenerating that file requires unmounting and remounting the hook rows in the profile patch; the patch itself is hot-reloaded, so no restart is needed.

**ECC's default profile also blocks tool calls.** Measured on ECC's own `PreToolUse` command, one fresh session per case:

| `ECC_HOOK_PROFILE` | `ECC_GATEGUARD` | verdict |
| --- | --- | --- |
| unset (defaults to `standard`) | — | `deny` — refuses the first Bash command until facts are presented |
| `standard` | — | `deny` |
| `standard` | `off` | no decision |
| `standard` + `ECC_DISABLED_HOOKS=pre:config-protection` | — | no decision |
| `minimal` | — | no decision |

`$DSH_HOME/.env` therefore carries `ECC_GATEGUARD=off` and `ECC_DISABLED_HOOKS=pre:config-protection`. No global `CLAUDE_PLUGIN_ROOT` is needed: the shim passes the root per plugin and a direct command carries an absolute path, which is also why one value could never have served several plugins.

`PreCompact`, `PostToolUseFailure`, `SessionEnd`, `Notification`, and `TaskCompleted` have no dsh extension point and are dropped by the generator. Residual, measured after the fix: ECC's `observe-runner.js` reports `shell runtime unavailable` for its shell-backed observation path — a shell-backed hook cannot run under the same sandbox — and a few hooks exit 1 without output. Neither blocks a tool call.

Removing the `hooks-*` list from the profile patch disables the hooks without touching any plugin's skills, commands, or agents.

## Rewriting what a verbatim copy cannot carry

A `SKILL.md` can be byte-perfect and still be useless, because it was written for a different harness. `transform.mjs` repairs the installed copy — never the source — and reports every change:

| mismatch | repair | measured |
| --- | --- | --- |
| `../_shared/x.md`, `scripts/y.py`: CC resolves these against the plugin root, dsh hands the model the skill directory | a dangling reference is pinned to its real location in the source checkout, recovered through a suffix index when a translated variant ships only its `SKILL.md` | **1802** pinned |
| `${CLAUDE_PLUGIN_ROOT}` in a body | substituted to the plugin root | 7 |
| `$ARGUMENTS` | substituted from `mapping.json` | 15 |
| `` `Read` ``, `**Bash**`, `Task tool` | translated to the dsh tool name | 33 |
| `Cargo.toml`, `tsconfig.json`, `./setup.sh` | **left alone** — the user's project files, not bundled resources | 17 remaining in ECC, all `./` scaffolding |

**Every `.md` in the copy is treated, not just the top level.** A skill's `references/` files link onward, and ECC alone ships 3201 nested markdown files of which 585 carry paths — normalizing only `SKILL.md` left the majority of references dangling while the report looked clean. A nested file's reference resolves against its own directory first, then the skill directory, then the plugin root, which is why the resolution takes an ordered list of bases rather than one.

After a run, every pinned path is verified: **887 distinct absolute paths referenced, 887 resolve, 0 missing**.

## Verifying an install

Counting what is configured is not counting what is registered. The live catalog is one RPC call, and the path must equal the method:

```powershell
$body = '{"type":"client-request","rpcId":"probe","method":"skill.list","payload":{"sessionId":"<id>"}}'
Invoke-WebRequest -Uri "http://127.0.0.1:3080/api/skill.list" -Method POST `
  -ContentType "application/json" -Body $body -UseBasicParsing
```

The profile patch is watched, so an edit is reconciled into the running host without a restart. Compare the result against the previous snapshot and require `lost = 0` before believing an install.
