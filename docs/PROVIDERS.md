# Providers, credentials and endpoints

This stack ships **no keys**. Every provider reads its key from an environment
variable or a credential ref that you create on the target machine. The tables
below are what a working install actually needs.

DSH resolves a credential in this order (highest first):

1. inherited process environment
2. `$DSH_HOME/.credentials.yaml`
3. `$DSH_HOME/.env` (read-only fallback)

## Credential refs

| Ref | Needed by | Notes |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | `llm-deepseek` | The primary provider. |
| `OPENROUTER_API_KEY` | `llm-pi-ai` provider `openrouter` | Referenced as `apiKeyEnv` in `settings.template.yaml`. |
| `FIRECRAWL_FALLBACK_API_KEY` | profile patch, web search | Cloud fallback only; the local endpoint is keyless. Never written into the patch. |
| `OPENCODE_GO_API_KEY`, `ZAI_API_KEY`, `ZENMUX_API_KEY`, `OLLAMA_CLOUD_API_KEY`, `ANTHROPIC_API_KEY`, `LMSTUDIO_API_KEY`, `NOUS_API_KEY`, `OPENCODE_API_KEY`, `GROQ_API_KEY`, `FREELLMAPI_API_KEY` | optional `llm-pi-ai` providers | Only if you keep those provider blocks from `settings.template.yaml`. Delete the ones you do not use. |
| `AGENTMEMORY_SECRET` | optional MCP row | Only if your agentmemory server requires one. |

```
# $DSH_HOME/.credentials.yaml — fill in on the target machine, never commit
DEEPSEEK_API_KEY: ...
OPENROUTER_API_KEY: ...
FIRECRAWL_FALLBACK_API_KEY: ...
```

The same refs may be exported as environment variables instead.

## Environment variables read by the profile patch

| Variable | Default | Effect |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | Harness home. Everything the installer writes is relative to it. |
| `FIRECRAWL_BASE_URL` | `http://127.0.0.1:3002` | Endpoint for both the Firecrawl search provider and the Firecrawl MCP bridge. |
| `DSH_TRUSTED_HOSTS` | *(empty)* | Comma-separated extra hostnames trusted by the `/api` browser-trust fence — for a reverse proxy or tunnel. Nothing extra is trusted until you set it. |
| `DSH_AGENTS_HOME` | `~/.agents` | Shared agent config root; `$DSH_AGENTS_HOME/skills` is a default skill root. |
| `AGENTMEMORY_URL` | `http://localhost:3111` | agentmemory server for the optional MCP row. |
| `CODEMEMORY_MCP_BIN` | `%APPDATA%\npm\node_modules\codebase-memory-mcp\bin\codebase-memory-mcp.exe` | Override the code-graph binary location. The row disables itself when the binary is absent. |
| `DSH_CHECKOUT` | *(auto-detected)* | Harness source checkout, used by `dsh-ponytail`'s chip test for jsdom and React. Only needed to run that test outside an installed profile. |

## Per-feature prerequisites

| Feature | Prerequisite | What breaks without it |
| --- | --- | --- |
| `base` | a running DSH installation | nothing to install into |
| web search | a Firecrawl instance at `FIRECRAWL_BASE_URL` | `web_search` falls back to the cloud endpoint, or fails if there is no fallback key |
| `dsh-usage-budget` | network for `models.dev` prices | costs show without prices; balances are simply absent |
| `cc-compat` | `git` + network on the first run | the CC skills, agents, commands and hooks are missing |
| optional MCP: agentmemory | an agentmemory server | the `mcp__agentmemory__*` tools never appear |
| optional MCP: chrome-devtools | network for the first `npx` fetch | the browser tools never appear |
| optional MCP: code-graph | `npm i -g codebase-memory-mcp` | the `mcp__cbm__*` tools never appear; the row disables itself |

## Things worth knowing before you debug

**`!!js` is evaluated with `new Function`, not in the loader's own scope.**
The implementation is literally:

```js
new Function('ctx', 'expr', `with (ctx) { return eval(expr) }`)
```

So an expression can use true globals (`process`) and anything on the loader
context (`ctx.webRuntime`, `dshHomePath`), but **not** `require`, ESM imports,
or a file-scope variable. `verify.mjs` fails the build on `require(` inside a
`!!js` expression, because the failure mode is the entire plugin tree refusing
to load.

Use `process.getBuiltinModule('node:fs')` when you need a builtin.

**The loader provides `dshHomePath(...)`.** It resolves `$DSH_HOME` and falls
back to `~/.dsh`, which is what makes this stack's patch layers
machine-independent:

```yaml
configPath: !!js dshHomePath('cc-compat', 'generated-hooks', 'ecc.json')
```

**A missing `configPath` is a load error, not a warning.** That is why the
`cc-compat` patch layer is a separate file the installer appends only after the
generator has produced the files it points at.

**`npx`-based MCP servers need a clean stdout.** A launcher that prints a banner
destroys the JSON-RPC stream. The code-graph row points at the binary directly
for exactly this reason.

## Firecrawl

The default expects a self-hosted Firecrawl (SearXNG-backed) on port 3002. Two
behaviours in the patch exist because of how that deployment fails in practice:

- a per-attempt `timeoutMs: 15000` leaves room for the fallback inside the
  tool's own 60s budget,
- `fallbackOnEmpty: true` asks the cloud endpoint when the local instance
  answers with zero sources.

Set `FIRECRAWL_BASE_URL` to point at a different instance; the MCP bridge
follows the same variable.
