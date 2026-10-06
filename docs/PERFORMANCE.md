# Diagnostics: harness start time and CPU behaviour

Measured, not estimated. Every number below comes from a command that is quoted
alongside it, on this machine (Windows 11, 20 logical CPUs, Node v24.19.0, Brave
as the GUI browser).

## The headline: "it does not start" and "it is slow" were the same report

Three separate defects were found while chasing "the harness is slow to start".
Two of them are the reason a start *failed*, and the third is a real CPU leak:

| Finding | Effect | Status |
| --- | --- | --- |
| **`hmr` is disabled in the `web-app` bundle, but `dsh web` requires the HMR service for its patch watcher** | the npm-installed harness prints its URL and then exits code 1: `dsh: user patch-layer watching requires the Cordis HMR service` | **fixed** in the base patch layer |
| **The credentials document was readable beyond its owner** (inherited grants to a sandbox group and an unresolvable SID) | after the `credentials` feature is installed, the provider refuses to start on it — correctly, naming the `icacls` repair | **fixed** on this machine; the check is the point |
| **A long-running harness burns ~1 core while idle** | sluggish machine, 1.3–2.2 GB resident, no browser connected | **measured, not yet profiled** — see below |

The first two are why the harness looked broken or "slow to start": it never
finished a start at all in those states, and the failure came late enough to
look like slowness rather than an error.

## Start time: 1.4–1.7 seconds to HTTP

Measured with `tools/boot-cpu-probe.mjs`, which polls HTTP every 200 ms:

| What was started | Time to HTTP 200 |
| --- | --- |
| Installed harness, `--profile web --no-open` | **1.69 s** |
| Same, second run | **1.58 s** |
| Same, against the full live home (147 composed rows, 187 MB session history) | **1.41–1.57 s** |
| Same, with `--inspect=127.0.0.1:9230` added | **2.30 s** (the inspector costs ~0.6 s) |

So the boot phase itself is fast, and **boot time is not the problem** unless
the process then dies — which is exactly what the `hmr` row above caused.

The instrument has two measured caveats, both recorded in its own comments so
nobody trusts a number it cannot produce: `bin.js` may start the server as a
grandchild, so the launcher pid can be a dead end; and `netstat -ano` produced
no output in the sandboxed shell this was developed in, so the port-owner
fallback can legitimately fail. When it cannot measure, it prints
`IDLE CPU : not measured` and exits non-zero rather than reporting a zero.

## The CPU leak: measured, cause not yet named

The live harness process, 4.9 hours old, **0 established connections** to its
port:

```
CPU total : 23 443 s over 4.9 h uptime      (~66 % of one core, averaged)
sampled   : 13.19 s of CPU per 10 s of wall clock   (132 % of one core)
threads   : one thread Running, 14 446 s of its own; five others waiting on
            the libuv threadpool
memory    : 1 321 MB working set, 2 181 MB private
```

A freshly started harness against the **same** home and installation is idle.
The spin therefore accumulates while the harness runs — it is not configuration
and not the start itself.

### Ruled out by measurement

- **MCP servers**: four configured (`firecrawl`, `agentmemory`,
  `chrome-devtools`, `code-graph`). After hours each sits at 0.1–4 s of CPU, so
  they are not the spin. Startup logs do show them working, though, and two
  things there deserve attention: `chrome-devtools-mcp` is launched with
  `@latest`, so `npx` re-resolves it against the network on every boot, and
  `@agentmemory/mcp` spends 2 s on a `livez` probe against a server that is not
  running, then falls back to 7 of 54 tools. Neither is slow enough to be the
  reported problem, both are avoidable.
- **Composite size**: the live tree composes **147 rows**; a source checkout of
  the same version composed **604**. The smaller tree is the one spinning.
- **The dev checkout**: `node --import tsx/esm apps/cli/src/bin.ts web` currently
  fails to boot at all (`Cannot find module … profiles/web/#include`), so it is
  not a silently-running slow instance.

### How to name the cause in one restart

Windows offers no way to attach Node's inspector to an already-running process
(no `SIGUSR1`), so this needs a restart with profiling enabled:

```powershell
node --cpu-prof --cpu-prof-dir "$env:TEMP\dshprof" `
     "$env:APPDATA\npm\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web
# use the harness normally until the machine feels slow, then stop it:
# the .cpuprofile in $env:TEMP\dshprof names the hot function.
```

Until that profile exists, the honest statement is: *the harness starts in
1.4–1.7 s, and a long-running instance leaks a busy loop.* Anyone who observes
sluggishness should restart the harness — if the machine immediately quiets
down, that is this finding confirmed.

## Firecrawl: already running locally, nothing to install

Recon found a complete self-hosted stack already up (5 hours):

| Container | Role |
| --- | --- |
| `firecrawl-api-1` | the API on `0.0.0.0:3002` |
| `firecrawl-playwright-service-1` | rendering |
| `firecrawl-redis-1`, `firecrawl-rabbitmq-1`, `firecrawl-nuq-postgres-1`, `firecrawl-foundationdb-1` | queue, cache, storage |
| `searxng` | the search engine behind it, on `0.0.0.0:8081` |

Smoke tests, run for real against `http://127.0.0.1:3002`:

```
POST /v1/search  {"query":"deepseek harness","limit":3}
  -> HTTP 200, success=true, 3 results
     - DeepSeek | Into the Unknown   [https://www.deepseek.com/]
     - DeepSeek | API Platform       [https://www.deepseek.com/en/platform/]
     - DeepSeek App                  [https://download.deepseek.com/]

POST /v1/scrape  {"url":"https://example.com","formats":["markdown"]}
  -> HTTP 200, success=true, 958 characters of markdown
```

The profile patch already points the model-facing `web_search` tool at this
endpoint (`searchProvider: firecrawl-official`, `FIRECRAWL_BASE_URL` defaulting
to `http://127.0.0.1:3002`), so local mode needs no further work.

### Cloud mode: if you do not want the local stack

The patch already supports it without a code change — point the provider at the
cloud and supply the key through the credential ref:

```powershell
$env:FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev'
# FIRECRAWL_FALLBACK_API_KEY stays a credential ref, never a literal:
# add it to $DSH_HOME/.credentials.yaml or export it
```

With `FIRECRAWL_BASE_URL` set to the cloud host, both the search provider and
the MCP bridge follow it and the SearXNG containers can be stopped. No key is
ever written into the patch file, which is what `docs/PROVIDERS.md` describes
under credential refs.

## Two composition defects found while probing

Both were in this repository's own composer, and both were silent:

1. **The skill catalog was empty on the live instance.** The composed tree
   reported `skill-filesystem: disabled: true` — 0 of 29 skills. When two blocks
   declare the same row id, `dedupeAcrossBlocks` keeps the **last** declaration.
   The base layer set `disabled: false`; the cc-compat layer re-declared the row
   with only `config:` and no `disabled`. The cc-compat copy won, so the enable
   was dropped with the base copy — silently, because a `config` patch on a
   disabled row raises nothing. Fixed by stating `disabled: false` in the layer
   that survives. Verified: the composed tree now reports `disabled: false` with
   `customSkillDirs` intact.
2. **`hmr` was never enabled**, so the installed harness exited right after
   printing its URL. Fixed in the base layer, with a comment explaining that the
   row is what makes the installed harness usable rather than an optimisation.

## Note on the upstream ACL comment

`owner-only-acl.ts` documents `/inheritance:r` as *converting* inherited entries
into explicit ones. On this machine it removes them: after `/inheritance:r` on a
directory, its access list was empty and the foreign ACE was gone. The
implementation is unaffected — it runs `/reset` and then
`/inheritance:r /grant:r`, which is correct either way — but the stated reason
is not what happens here. Recorded rather than silently "fixed", because the
comment came from the source this overlay carries.
