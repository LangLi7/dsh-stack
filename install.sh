#!/usr/bin/env bash
#
# Install the portable DSH stack into a DeepSeek Harness home.
#
#   ./install.sh                        # base feature into $DSH_HOME or ~/.dsh
#   ./install.sh --features base,cc-compat
#   ./install.sh --dry-run
#
# Idempotent: re-running replaces the files the stack owns and leaves
# everything else alone. Runtime data (sessions, goals, credentials, caches)
# is never touched.
#
# Flags mirror install.ps1; see that file for the long description.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_STACK_PROFILE="web"
FEATURES="base"
DRY_RUN=0
SKIP_VERIFY=0
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dsh-home)   DSH_HOME_ARG="$2"; shift 2 ;;
    --profile)    DSH_STACK_PROFILE="$2"; shift 2 ;;
    --features)   FEATURES="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=1; shift ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    --force)      FORCE=1; shift ;;
    -h|--help)    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }
info() { printf '    %s\n' "$1"; }
warn() { printf '    ! %s\n' "$1" >&2; }
run()  { if [ "$DRY_RUN" = 1 ]; then info "would run: $*"; else "$@"; fi; }

# --- resolve the harness home the way the harness does -----------------------
if [ -n "${DSH_HOME_ARG:-}" ]; then
  DSH_HOME_RESOLVED="$DSH_HOME_ARG"
elif [ -n "${DSH_HOME:-}" ]; then
  DSH_HOME_RESOLVED="$DSH_HOME"
else
  DSH_HOME_RESOLVED="$HOME/.dsh"
fi
export DSH_HOME="$DSH_HOME_RESOLVED"
PROFILE_DIR="$DSH_HOME/profiles/$DSH_STACK_PROFILE"

# --- parse features ----------------------------------------------------------
IFS=',' read -r -a REQUESTED <<< "$FEATURES"
SELECTED="base"
for name in "${REQUESTED[@]}"; do
  name="$(echo "$name" | xargs)"
  [ -z "$name" ] && continue
  case "$name" in
    base|cc-compat|optional) ;;
    *) echo "unknown feature '$name'; known: base, cc-compat, optional" >&2; exit 2 ;;
  esac
  case " $SELECTED " in *" $name "*) ;; *) SELECTED="$SELECTED $name" ;; esac
done

echo
echo "dsh-stack installer"
info "repository   : $REPO_ROOT"
info "harness home : $DSH_HOME"
info "profile      : $DSH_STACK_PROFILE  ($PROFILE_DIR)"
info "features     : $SELECTED"
[ "$DRY_RUN" = 1 ] && warn "dry run — nothing will be written"

# --- preconditions -----------------------------------------------------------
step 'Checking preconditions'
command -v node >/dev/null 2>&1 || { echo 'node is not on PATH; DeepSeek Harness needs Node >= 22.19' >&2; exit 1; }
NODE_VERSION="$(node --version)"
info "node $NODE_VERSION"
NODE_MAJOR="${NODE_VERSION#v}"; NODE_MAJOR="${NODE_MAJOR%%.*}"
[ "$NODE_MAJOR" -ge 22 ] || { echo "Node $NODE_VERSION is too old; the harness needs >= 22.19" >&2; exit 1; }
case " $SELECTED " in
  *" cc-compat "*)
    command -v git >/dev/null 2>&1 || { echo "feature 'cc-compat' needs git on PATH" >&2; exit 1; }
    info "$(git --version)"
    ;;
esac

# --- base: plugins ----------------------------------------------------------
step 'Installing plugins'
for plugin in dsh-ponytail dsh-usage-budget dsh-i18n-de; do
  src="$REPO_ROOT/plugins/$plugin"
  [ -d "$src" ] || { echo "plugin source missing: $src" >&2; exit 1; }
  info "$plugin"
  if [ "$DRY_RUN" = 1 ]; then
    info "copy $src -> $PROFILE_DIR/node_modules/$plugin"
  else
    mkdir -p "$PROFILE_DIR/node_modules/$plugin"
    cp -R "$src/." "$PROFILE_DIR/node_modules/$plugin/"
    info "copied -> $PROFILE_DIR/node_modules/$plugin"
  fi
done

# --- base: skills -----------------------------------------------------------
step 'Installing portable skills'
SKILL_SOURCE="$REPO_ROOT/home/skills"
SKILL_COUNT="$(find "$SKILL_SOURCE" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
info "$SKILL_COUNT skills"
if [ "$DRY_RUN" = 1 ]; then
  info "copy $SKILL_SOURCE/* -> $DSH_HOME/skills"
else
  mkdir -p "$DSH_HOME/skills"
  for dir in "$SKILL_SOURCE"/*/; do
    cp -R "$dir" "$DSH_HOME/skills/"
  done
  info "copied -> $DSH_HOME/skills"
fi
if [ -f "$REPO_ROOT/home/skills-lock.json" ]; then
  run cp "$REPO_ROOT/home/skills-lock.json" "$DSH_HOME/skills-lock.json"
fi

# --- base: profile patch layer ----------------------------------------------
step 'Composing the profile patch layer'
if [ "$DRY_RUN" = 0 ]; then mkdir -p "$PROFILE_DIR"; fi
INSTALLED_PATCH="$PROFILE_DIR/cordis.patch.yml"
if [ -f "$INSTALLED_PATCH" ] && ! grep -q 'dsh-stack:' "$INSTALLED_PATCH"; then
  if [ "$FORCE" = 1 ]; then
    warn 'existing profile patch has no dsh-stack markers; --force was given, so it will be replaced'
  else
    warn 'existing profile patch has no dsh-stack markers; it is backed up and then extended'
    run cp "$INSTALLED_PATCH" "$INSTALLED_PATCH.bak-dsh-stack-$(date +%Y%m%d-%H%M%S)"
  fi
fi
PATCH_FILES=('cordis.patch.yml')
case " $SELECTED " in
  *" cc-compat "*) PATCH_FILES+=('cordis.patch.cc-compat.yml') ;;
esac
case " $SELECTED " in
  *" optional "*) PATCH_FILES+=('cordis.patch.optional.yml') ;;
esac
# A feature already present in the profile under a dsh-stack marker keeps its
# block: composing only the selected features would otherwise delete the rows
# of an add-on that is currently installed and mounted.
if [ -f "$INSTALLED_PATCH" ] && [ "$FORCE" = 0 ]; then
  for candidate in cordis.patch.cc-compat.yml cordis.patch.optional.yml; do
    case " ${PATCH_FILES[*]} " in *" $candidate "*) continue ;; esac
    if grep -qF "# >>> dsh-stack: $candidate" "$INSTALLED_PATCH"; then
      PATCH_FILES+=("$candidate")
      info "$candidate is already installed; keeping its block"
    fi
  done
fi
for name in "${PATCH_FILES[@]}"; do
  if [ "$name" = 'cordis.patch.yml' ] && [ -f "$INSTALLED_PATCH" ] && [ "$FORCE" = 0 ]; then
    # The profile already has a patch file. Copying the template over it would
    # both discard rows it does not know about and leave the stack's own rows
    # present twice — once unmanaged, once inside the composed block. The block
    # is the only writer for this file.
    info 'cordis.patch.yml exists; its dsh-stack block is updated in place (template not copied)'
    continue
  fi
  run cp "$REPO_ROOT/home/profiles/web/$name" "$PROFILE_DIR/$name"
done
if [ "$DRY_RUN" = 1 ]; then
  info "would run: node tools/compose-patch.mjs --profile-dir $PROFILE_DIR ${PATCH_FILES[*]}"
else
  node "$REPO_ROOT/tools/compose-patch.mjs" --profile-dir "$PROFILE_DIR" "${PATCH_FILES[@]}"
fi

# --- credentials: Windows owner-only ACL for the credentials document ---------
case " $SELECTED " in
  *" credentials "*)
    step 'Installing the credentials document ACL fix'
    # This package belongs to the HARNESS INSTALLATION, not to the profile, so it
    # is located by resolving it from candidate anchors and reading back the
    # directory that won.
    cred_package='@deepseek-ai/dsh-credentials-local'
    locator="$(mktemp)"
    cat > "$locator" <<'LOCATOR'
const { createRequire } = require('node:module')
const { dirname } = require('node:path')
const [anchor, name] = process.argv.slice(2)
try {
  console.log(dirname(createRequire(anchor + '/noop.js').resolve(name + '/package.json')))
} catch {
  process.exit(3)
}
LOCATOR
    cred_target=''
    anchors="$DSH_HOME/profiles $DSH_HOME"
    # `dsh` on PATH is a shim in the npm bin directory: the package root is the
    # shim's directory plus the package path, not its grandparent.
    if command -v dsh >/dev/null 2>&1; then
      bin_dir="$(cd "$(dirname "$(command -v dsh)")" && pwd)"
      for candidate in "$bin_dir/node_modules/@deepseek-ai/dsh" "$bin_dir/../@deepseek-ai/dsh"; do
        [ -f "$candidate/package.json" ] && anchors="$anchors $candidate"
      done
      info "dsh shim: $bin_dir"
    fi
    for candidate in "${APPDATA:-}/npm/node_modules/@deepseek-ai/dsh"; do
      [ -n "$candidate" ] && [ -f "$candidate/package.json" ] && anchors="$anchors $candidate"
    done
    for anchor in $anchors; do
      found="$(node "$locator" "$anchor" "$cred_package" 2>/dev/null || true)"
      if [ -n "$found" ]; then cred_target="$found"; break; fi
    done
    rm -f "$locator"
    if [ -z "$cred_target" ] || [ ! -d "$cred_target" ]; then
      echo "feature 'credentials' needs $cred_package, which does not resolve from the harness home or the installation." >&2
      echo "  Looked from: $anchors" >&2
      exit 1
    fi
    info "target: $cred_target"
    cred_bundle="$cred_target/lib/index.js"
    if [ -f "$cred_bundle" ] && grep -qE 'owner-only|icacls|/inheritance' "$cred_bundle" && [ "$FORCE" = 0 ]; then
      info 'this installation already enforces an owner-only ACL; the overlay was NOT applied'
      info '(run with --force to replace it with the version this repository carries)'
    elif [ "$DRY_RUN" = 1 ]; then
      info "would copy the overlay over $cred_target (lib/index.js backed up first)"
    else
      if [ -f "$cred_bundle" ] && [ ! -f "$cred_bundle.bak-dsh-stack" ]; then
        cp "$cred_bundle" "$cred_bundle.bak-dsh-stack"
        info "backup: $cred_bundle.bak-dsh-stack"
      fi
      cp "$REPO_ROOT/patches/credentials-local/lib/index.js" "$cred_bundle"
      mkdir -p "$cred_target/lib/types"
      cp "$REPO_ROOT/patches/credentials-local/lib/types/owner-only-acl.js" "$cred_target/lib/types/"
      cp "$REPO_ROOT/patches/credentials-local/lib/types/owner-only-acl.d.ts" "$cred_target/lib/types/"
      info 'overlay applied: lib/index.js + lib/types/owner-only-acl.js'
    fi
    test_dir="$DSH_HOME/dsh-stack/credentials-local"
    if [ "$DRY_RUN" = 1 ]; then
      info "would copy the regression test to $test_dir"
    else
      mkdir -p "$test_dir"
      cp "$REPO_ROOT/patches/credentials-local/tests/owner-only-acl.test.mjs" "$test_dir/"
      info "regression test: node \"$test_dir/owner-only-acl.test.mjs\" \"$cred_target\""
      if [ "$SKIP_VERIFY" = 0 ]; then
        if node "$test_dir/owner-only-acl.test.mjs" "$cred_target"; then
          info 'credentials regression test passed'
        else
          warn 'the credentials regression test FAILED — see above'
        fi
      fi
    fi
    ;;
esac

# --- cc-compat --------------------------------------------------------------
case " $SELECTED " in
  *" cc-compat "*)
    step 'Installing Claude-Code compatibility (clones + compile)'
    COMPAT_TARGET="$DSH_HOME/cc-compat"
    if [ "$DRY_RUN" = 1 ]; then
      info "copy $REPO_ROOT/cc-compat -> $COMPAT_TARGET"
    else
      mkdir -p "$COMPAT_TARGET"
      cp -R "$REPO_ROOT/cc-compat/." "$COMPAT_TARGET/"
      info "copied -> $COMPAT_TARGET"
      info 'cloning the sources in repos.txt into cc-sources (needs network on the first run)'
      node "$COMPAT_TARGET/install.mjs"
      info 'compiling plugins: skills, agents, commands, hooks, MCP rows'
      node "$COMPAT_TARGET/plugin-install.mjs"
      # The generator's patch fragments are NOT composed in. Checked row by row:
      # `generated-hooks.patch.yml` declares exactly the three hook rows the
      # cc-compat template declares, and the `generated-mcp*` fragments declare
      # rows the websearch and optional templates already own. Composing both
      # sides produces the same row two to five times — the loader tolerates it
      # (last wins) but the file becomes unreadable.
      if [ -f "$COMPAT_TARGET/generated-hooks.patch.yml" ]; then
        info 'generated patch fragments exist but are already covered by the layer templates; not composed'
      fi
    fi
    ;;
esac

# --- verification -----------------------------------------------------------
if [ "$SKIP_VERIFY" = 0 ]; then
  step 'Verifying the installation'
  if [ "$DRY_RUN" = 1 ]; then
    info 'skipped (dry run)'
  else
    node "$REPO_ROOT/tools/verify.mjs"
  fi
fi

cat <<'EOF'

Done.

Next steps:
  1. credentials: add the refs listed in manifest.json under .credentials to
     $DSH_HOME/.credentials.yaml (or export them as environment variables).
     The stack ships no keys.
  2. start the harness:   dsh web
     (a plugin row added while a harness is running appears only on the next
      start, because the plugin set is fixed at boot)
  3. check the composed tree:   dsh web --dump-config | grep firecrawl
  4. re-verify at any time:     node tools/verify.mjs
EOF
