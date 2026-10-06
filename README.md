# dsh-stack — a portable DeepSeek Harness setup

A clone-and-install copy of a working DeepSeek Harness (`dsh`) setup: the local
plugins, the profile patch layer that wires them, the skills, and the
Claude-Code compatibility tooling. Install it on another machine and you get
the same harness, not a blank one.

**What this is not:** a copy of a harness home. Sessions, goals, crew state,
caches, attachments and credentials stay on the machine that produced them —
partly because they are machine state, partly because some of them are secrets.
The installer writes only the files this stack owns and never touches the rest.

---

## What you get

| Piece | What it does |
| --- | --- |
| `dsh-ponytail` | A chip in the composer that switches the Ponytail skills on and off, plus `/ponytail on\|off\|toggle\|status` |
| `dsh-usage-budget` | Token and cost tracking per API key and model, prices from models.dev, balances from DeepSeek/OpenRouter, hover panel and a settings page |
| `dsh-i18n-de` | German localization of tool results and errors, with a settings toggle |
| profile patch layers | Core: mounts the three plugins, enables the skill catalog, re-enables `dsh-badge`. Add-ons: self-hosted web search, Claude-Code compatibility, MCP servers |
| 29 skills | `analyse`, `design-md`, `self-improve`, `crew-project-*`, `smart-principles`, the 6 Ponytail skills, 7 more from `~/.agents/skills` |
| `cc-compat` | Tooling that turns Claude-Code plugins (skills, agents, commands, hooks, MCP manifests) into dsh artifacts |
| `credentials` | Owner-only ACL for the credentials document on Windows — the stock provider skips its check there, so the document inherits its directory's access and another local principal can read the secret |
| `settings.template.yaml` | The intent-carrying sections of a working `settings.yaml`: 11 provider catalogs, crew role assignments, model limits. No keys. |

## Requirements

- **Node >= 22.19** — the version the harness itself requires. `install.sh`
  and `verify.mjs` run on Node.
- **A DeepSeek Harness installation** — `dsh` on `PATH`. The installer does not
  install the harness itself.
- **PowerShell 7+** for `install.ps1`, or any POSIX shell for `install.sh`.
- **git on `PATH`** and network access only for the `cc-compat` feature.
- Optional, per feature: a Firecrawl endpoint for web search, an agentmemory
  server, a global `codebase-memory-mcp` for the code-graph tools.

## Install

```powershell
git clone https://github.com/LangLi7/dsh-stack.git
cd dsh-stack
./install.ps1                                  # core feature into $env:DSH_HOME or ~/.dsh
./install.ps1 -Features base,cc-compat         # also clone + compile the CC plugins
./install.ps1 -Features base,websearch         # needs an out-of-tree Firecrawl plugin
./install.ps1 -DryRun                          # print every action, write nothing
```

```bash
./install.sh                                   # same, POSIX shell
./install.sh --features base,cc-compat,optional
```

If PowerShell refuses to run the script (`about_Execution_Policies`), either
run it as `pwsh -ExecutionPolicy Bypass -File ./install.ps1` or use
`install.sh` where a POSIX shell is available.

The target home is `$DSH_HOME`, then `~/.dsh` — the same precedence the harness
uses. Point it elsewhere with `-DshHome <path>` / `--dsh-home <path>`, or by
exporting `DSH_HOME`.

Then add the credentials the stack expects (see
[`docs/PROVIDERS.md`](docs/PROVIDERS.md)) and start the harness:

```bash
dsh web
```

## Verify

```bash
node tools/verify.mjs              # checks the installation under $DSH_HOME
node tools/verify.mjs --repo-only  # checks this repository only (no harness needed)
```

It checks what actually breaks, not what looks tidy:

1. **Every plugin resolves through Node resolution from the profile.** A plugin
   copied next to the profile but unreachable through the `node_modules` walk
   never mounts, and nothing says so. `verify.mjs` resolves it the way the
   loader will, then confirms every path the manifest promises exists.
2. **Every profile patch parses as an entry list** and obeys the expression
   dialect. This one earns its place: `!!js` is evaluated as
   `new Function('ctx', 'expr', 'with (ctx) { return eval(expr) }')`, so the
   scope is the loader context plus true globals. `require` is *not* in scope,
   and a `!!js require('node:fs')` aborts the whole boot with
   `plugin tree failed to load`.
3. **No secret shapes and no personal paths** anywhere in the repository.

The installer runs the same check before writing anything that needs a plugin
the target profile does not have — see below.

### Prove it end to end on an isolated home

```bash
export DSH_HOME=/tmp/dsh-cleanroom
./install.sh
dsh web --dump-config | grep -E 'ponytail|usage-budget|i18n-de|firecrawl'
dsh --profile web --port 3099 --no-open      # then probe it
```

`--dump-config` prints the composed tree, which is the honest answer to "is my
plugin actually mounted?". The wire-level probe for the Ponytail channel is
worth keeping, because it exercises the host half rather than trusting the
manifest:

```bash
curl -s http://127.0.0.1:3099/ponytail/status \
  -H 'content-type: application/json' \
  -d '{"type":"client-request","rpcId":"probe-1","method":"status","payload":{}}'
# {"type":"server-response","rpcId":"probe-1","result":{"ok":true,"value":{"enabled":true,...}}}
```

The endpoint is the channel plus the endpoint (`/ponytail` + `status`), the
envelope needs `type` and `method`, and the response echoes your `rpcId`.

## Layout

```
home/                     mirrors $DSH_HOME — copied to the harness home
  profiles/web/           the profile patch layers
    cordis.patch.yml              core: plugins, skill catalog, trusted hosts
    cordis.patch.websearch.yml    add-on: Firecrawl provider and MCP bridge
    cordis.patch.cc-compat.yml    add-on: CC skill roots and hook rows
    cordis.patch.optional.yml     add-on: MCP servers
  skills/                 29 skills -> $DSH_HOME/skills
  settings.template.yaml  merge by hand, never copied automatically
  skills-lock.json
plugins/                  plugin sources -> $DSH_HOME/profiles/<profile>/node_modules
patches/credentials-local/
  src/                    the modified sources (index.ts, owner-only-acl.ts)
  lib/                    the built artifacts the loader actually runs
  tests/                  the ported regression test (node:test, no vitest)
cc-compat/                installer + compiler -> $DSH_HOME/cc-compat
tools/
  compose-patch.mjs       assembles the profile patch from feature blocks
  verify.mjs              the post-install check
  boot-cpu-probe.mjs      measures start time and idle CPU of a live harness
docs/
  PROVIDERS.md            credentials, endpoints, env vars, per-feature prerequisites
  PERFORMANCE.md          measured start time, the idle-CPU leak, Firecrawl modes
  SANITIZATION.md         exactly what was removed from the private original, and why
manifest.json             features, env vars, credential refs, per-layer plugin requirements
```

## Features

`-Features base,websearch,cc-compat,credentials,optional` — `base` is always applied.

- **base** — profile patch core, the three local plugins, the 29 skills, and the
  switch that turns the skill catalog on. No network needed beyond the initial
  clone.
- **websearch** — points `web_search` at a self-hosted Firecrawl and adds the
  Firecrawl MCP bridge. Requires the **out-of-tree** plugin
  `@deepseek-ai/dsh-web-search-firecrawl` inside the profile, plus a reachable
  endpoint.
- **cc-compat** — clones the seven Claude-Code plugin repositories listed in
  `cc-compat/repos.txt`, compiles their artifacts, and folds the generated hook
  rows into the profile patch. Those upstream repositories are *not* vendored
  here; their licences stay with them.
- **credentials** — applies `patches/credentials-local` to the installation's
  `@deepseek-ai/dsh-credentials-local`. See below: this one is different in kind
  from the others, and the installer treats it that way.
- **optional** — MCP servers (agentmemory, chrome-devtools, code-graph). Each
  row needs its own prerequisite and stays inert until it exists; see
  `docs/PROVIDERS.md`.

### The `credentials` feature patches an installation-owned package

Unlike every other feature, this one does not add a plugin — it changes the
behaviour of a package the harness already ships. The reason is a real defect:

```
// stock dsh-credentials-local, before the fix
if (process.platform === 'win32') return   // no check at all on Windows
```

`writeFileAtomic` publishes a **fresh inode**, and on Windows a fresh inode
inherits its parent directory's access entries. On a harness home that grants
another principal read access — a sandbox group, or an orphaned ACE left by a
deleted account, both of which this authoring machine has — the credentials
document inherits that access. The secret is then readable by a principal the
provider claims to exclude, and nothing warns.

The overlay re-founds the document's DACL on the owner, `SYSTEM` and
`Administrators`, on both the directory (before a write) and the document
(after the atomic replace). Consequences the installer handles explicitly:

- **It probes before it writes.** If the installation's bundle already mentions
  `owner-only` / `icacls` / `/inheritance`, the overlay is skipped with a note —
  a future harness release that fixes this itself must not be regressed to this
  repository's copy. `-Force` / `--force` overrides.
- **It backs up.** The stock `lib/index.js` is kept as
  `lib/index.js.bak-dsh-stack`; restoring it is a single copy.
- **The regression test runs against the artifact that is actually loaded**, not
  against the sources: `patches/credentials-local/tests/owner-only-acl.test.mjs`
  is copied into the home and executed during the install. It is ported to
  `node:test` so it needs neither the monorepo nor vitest, and it asserts what
  the operating system reports about the file, through .NET rather than through
  `icacls` text — `icacls` prints localized account names and choked on the
  owner-SID form on a German system, both measured.

The test discriminates, which is the only reason to trust it:

```
against the stock bundle   3 of 4 fail   (the provider publishes a document
                                         readable beyond its owner)
against the patched bundle 3 of 4 pass   (the 4th skips off Windows)
```

It fails loudly rather than vacuously: if the ACL cannot be read, or if the
sandbox group cannot be granted, it reports that as a failure and names the
missing precondition instead of reporting a pass.

### Why the features are split, and why the installer refuses

A plugin name the loader cannot resolve is **not** a warning: the boot dies with
`plugin tree failed to load`. The `websearch` layer names an out-of-tree plugin,
so installing it on a profile that lacks that package produces a harness that
does not start at all. The installer therefore resolves every package a layer
mounts **from the profile, before writing anything**, and refuses with a
message naming the missing package:

```
feature layer 'cordis.patch.websearch.yml' needs plugin(s) that are not
resolvable from <profile>
  missing: @deepseek-ai/dsh-web-search-firecrawl
```

That check was added because the failure was reproduced, not imagined: the first
clean-room boot died exactly this way.

## Notes that save an hour

- **The installed harness will not start without the `hmr` row.** `dsh web`
  watches the profile patch layer, and that watcher requires the Cordis HMR
  service, which the `web-app` bundle ships `disabled: true`. Without the row
  the harness prints its URL and then exits code 1 with
  `user patch-layer watching requires the Cordis HMR service` — which reads as
  "starts and immediately dies". A source checkout tolerates it; the installed
  package does not. The base layer enables it; see `docs/PERFORMANCE.md`.
- **A plugin row added while a harness is running does nothing.** The patch
  watcher applies changes to already-mounted rows, but the plugin *set* is
  fixed at boot. A live-added row is ignored silently — nothing breaks, and it
  appears on the next `dsh web` start. This is observed, not inferred: a row
  present in the profile patch was absent from the running instance's routes
  until a restart.
- **Ids in a patch are split in two kinds.** `- id: x` with `config:` overrides
  a row a bundle already shipped; adding a *new* plugin needs
  `- insert: [{ id: x, name: 'package' }]`. A bare `- id:` for a row that does
  not exist is dropped with `patch: entry "x" not found`.
- **`disabled: false` must live in the declaration that survives.** When two
  layers name the same row id, the composer keeps the **last** one — the earlier
  fields are dropped with the earlier copy. A `config:`-only patch on a disabled
  row is a silent no-op, which is how the skill catalog stayed empty (0 of 29)
  while the patch file looked correct.
- **The `web-app` bundle ships `skill-filesystem` with `disabled: true`.** An
  id-targeted `config` patch alone — even one full of `customSkillDirs` —
  discovers nothing, because the plugin never mounts and nothing is logged.
  The core layer sets `disabled: false`, which is what actually turns the skill
  catalog on.
- **Skill roots are discovered automatically.** `$DSH_HOME/skills` and
  `$DSH_AGENTS_HOME/skills` (default `~/.agents/skills`) need no configuration.
  `customSkillDirs` is only for roots outside those, and it is additive — it
  does not replace the defaults.
- **The provider reads only direct children of a skill root.** Nested skill
  trees are invisible, which is why each `cc-*` source gets its own root.
- **`dsh web --patch <file>` is not the same command as
  `dsh --profile web --patch <file>`.** The `web` subcommand rejects parent
  options (`error: unknown option '--patch'`); use the explicit profile form
  when you need an overlay.
- **`dsh web` from the npm package and from a source checkout can behave
  differently.** On the exact same profile, the npm-installed
  `@deepseek-ai/dsh` booted and served the Ponytail channel, while a running
  instance from a locally modified dev checkout returned 405 for the same
  request. Keep the harness version you test against and the one you run on the
  same lineage.

## Licence

The stack's own code (plugins, tools, installer) is MIT — see `LICENSE`.
Bundled skills keep their upstream licences; `docs/SANITIZATION.md` records
where each came from. The `cc-compat` feature installs third-party repositories
at run time and does not redistribute them.
