# Sanitization record

This repository is a curated export of a private harness home, not a copy of
it. This file records what was left out and why, so a future reader (or a
future export) does not have to reverse-engineer the decisions.

## Excluded from the export

| Excluded | Why |
| --- | --- |
| `$DSH_HOME/.credentials.yaml` and `.env` | Secrets. The stack ships credential *refs*, never values. |
| `$DSH_HOME/sessions/`, `projects/`, `storages/`, `attachments/`, `data/`, `profiles/*/node_modules` | Runtime state and caches, mostly per session. |
| `$DSH_HOME/crew/` | Durable crew goals and to-do lists — the working memory of one project, meaningless elsewhere. |
| `$DSH_HOME/settings.yaml` | Machine state: UI onboarding flags, absolute paths, live provider state. The intent-carrying sections were extracted by hand into `home/settings.template.yaml`. |
| ~25 third-party harness homes that happened to live under the same directory (`.aider-desk`, `.crush`, `.goose`, `.claude`, `.qwen`, …) | Other tools' state. Not this harness's business. |
| `$DSH_HOME/usage-budget/`, `.usage-export/`, `.npm-cache/`, `.verify-landing/`, `.edge-tmp*/` | Caches and live usage data. |
| `$DSH_HOME/tools/open-code-review/` | A clone of an upstream project, not this stack's content. |
| The seven `cc-*` skill mirrors (~77 MB) | Copies of third-party repositories. `cc-compat` clones them from upstream at install time instead, so their licences and provenance stay with them. |
| `$DSH_HOME/profiles/node_modules/@deepseek-ai/*` | Junctions into a local dev checkout. The harness heals this directory itself on every boot. |

## Sanitized in place

| Change | Reason |
| --- | --- |
| All absolute user paths in the profile patch replaced with `!!js dshHomePath(...)` | The patch has to describe a layout, not one machine's disk. |
| A tunnel hostname removed from `connection.trustedHosts`, replaced by the `DSH_TRUSTED_HOSTS` variable | Publishing a hostname publishes an endpoint. Empty by default: no extra host is trusted until the operator says so. |
| Firecrawl endpoint and fallback key ref parameterized (`FIRECRAWL_BASE_URL`) | Same reason; the key itself was always a credential ref, never a literal. |
| `cc-compat/generated-hooks/*.json`, `generated-*.patch.yml`, `audit-report.json`, `catalog-snapshot-*.txt` dropped | Generator output full of absolute paths. The installer regenerates all of it in the target home. |
| `dsh-ponytail/lib/gate.js`: `DEFAULT_SKILL_ROOTS` and `DEFAULT_STATE_FILE` were literal absolute constants under one user's home | **A real defect, not cosmetics.** The plugin would have edited the original author's skills directory on the target machine and reported on the wrong state file. Now resolved at call time from `$DSH_HOME` / `$DSH_AGENTS_HOME` with `~/.dsh` / `~/.agents` fallbacks. |
| `dsh-ponytail/tests/chip.test.mjs`: checkout and bundle paths were absolute | The test now takes the checkout from `DSH_CHECKOUT` (auto-detecting common neighbours) and loads `lib/client.js` relative to itself — which is the same file the host serves, so the assertion is unchanged. |
| `cc-compat/verify-roots.mjs`: hardcoded patch path, and its root parser did not understand `!!js` | It now takes the patch from `$DSH_HOME`, and evaluates the `dshHomePath(...)` shape it finds, so it still reports the real roots. |
| 22 probe scripts removed from `dsh-usage-budget` | They read `$DSH_HOME/.credentials.yaml` or a live `settings.yaml` and called provider APIs. They are local instruments, not tests: publishing them would hand out scripts that reference files the reader does not have. |
| `dsh-usage-budget/tools/strip-types.mjs` removed | A build step that needs the harness checkout's `typescript` to strip types from `lib/` sources. `lib/` is shipped already stripped, so a fresh clone never needs it. |
| `packages/credentials/credentials-local` from the dev checkout — EXPORTED, not dropped | The Windows owner-only ACL fix existed only as an uncommitted change in a local checkout, so a fresh clone of the harness would not have contained it. It ships as `patches/credentials-local/` (modified sources plus the built artifacts) and is applied by the `credentials` feature. See `README.md` for why this one patches an installation-owned package and how the installer guards it. |

## Added for portability

- `install.ps1`, `install.sh`, `manifest.json` — feature-wise installation.
- `tools/compose-patch.mjs` — appends feature patch layers to the profile patch
  under stable markers, so re-running the installer replaces its own block
  instead of stacking duplicates.
- `tools/verify.mjs` — see the README for what it actually checks.
- `cordis.patch.cc-compat.yml` and `cordis.patch.optional.yml` — the optional
  halves of the original single patch file, split so a base install cannot fail
  on rows whose prerequisites are missing.
- `patches/credentials-local/` — the Windows owner-only ACL fix, as both the
  modified sources and the built artifacts, plus a regression test ported to
  `node:test` that runs against the installed package.

## Verification performed before publishing

Anything below was measured on the authoring machine, not assumed:

- the full repo check (`node tools/verify.mjs --repo-only`) and the install
  check (31/31) pass with no warnings;
- a clone from GitHub installs into an isolated `$DSH_HOME`, composes an
  identical patch file, and is idempotent across runs (identical hash);
- that install boots under the installed `dsh`, serves all three plugin client
  bundles (`200`), and answers the Ponytail RPC with a working toggle that
  reaches the skills' frontmatter;
- the credentials regression test fails 3 of 4 against the stock bundle and
  passes 3 of 4 against the patched one;
- a second install into a home that was never booted resolves the credentials
  provider from the installation itself, which is the only place it exists.

Not covered: the Ponytail chip in a real browser session. Its test renders the
component offline through the module loader, which is evidence about the
component, not about the running page.

## Provenance of the bundled skills

`home/skills` is the union of two roots, deduplicated by name:

- `$DSH_HOME/skills` (16 skills): `agent-code-reviewer`,
  `agent-security-reviewer`, `analyse`, `analyse-voll`, `bewerbung-assistant`,
  `cmd-harness-audit`, `codegraph`, `crew-project-blueprint`,
  `crew-project-planning`, `crew-project-research`, `deep-research`,
  `design-md`, `nl2sql`, `self-improve`, `smart-principles`, `typesafe-ai`.
- `~/.agents/skills` (13 skills): the 6 Ponytail skills plus `autofix`,
  `code-review`, `find-skills`, `hf-cli`, `open-code-review`,
  `open-code-review-delegate`, `security-audit`.

Several of these were installed from public upstreams by the `skills.sh` CLI
(`ponytail` and its five command skills from `DietrichGebert/ponytail`,
`open-code-review` from `alibaba/open-code-review`, `security-audit`,
`design-md` from `VoltAgent/awesome-design-md`). Their licences are their own;
check the licence file inside each skill directory before redistributing
further.

The 16-skill root was verified before export: every directory holds a
`SKILL.md`, which is the shape the skill provider requires.

## What the verification does not cover

`verify.mjs` proves the *shape* of an installation: resolvable plugins, valid
patches, no leaked secrets. It does not prove that a plugin behaves correctly
inside a running harness. That requires a boot:

```bash
DSH_HOME=/tmp/dsh-cleanroom dsh web --dump-config   # composed tree
```

and, for the Ponytail chip, a real browser session — the chip's own test renders
it offline through the module loader, which is evidence about the component, not
about the running page.
