<#
.SYNOPSIS
  Install the portable DSH stack into a DeepSeek Harness home.

.DESCRIPTION
  Places the stack's plugins, skills and profile patch layer into the harness
  home, so a second machine ends up with the same working setup. Runtime data
  (sessions, goals, credentials, caches) is never touched — this installer only
  writes the files the stack owns.

  Idempotent: re-running replaces the files it manages and leaves everything
  else alone. The profile patch is composed under stable markers, so repeated
  runs do not stack duplicate rows.

.PARAMETER DshHome
  Harness home. Defaults to $env:DSH_HOME, then ~/.dsh — the same precedence
  the harness itself uses.

.PARAMETER Profile
  Profile to install into. Default 'web'.

.PARAMETER Features
  Comma-separated feature ids from manifest.json. Default 'base'.
  'base' is always applied, even when omitted from the list.

.PARAMETER DryRun
  Print every action without writing anything.

.PARAMETER SkipVerify
  Do not run tools/verify.mjs at the end.

.PARAMETER Force
  Overwrite an existing installed profile patch that carries no dsh-stack
  markers. Without it, an unmanaged patch file is backed up and then extended,
  never replaced.

.EXAMPLE
  ./install.ps1
  Installs the base feature into $env:DSH_HOME (or ~/.dsh).

.EXAMPLE
  ./install.ps1 -Features base,cc-compat
  Also clones the Claude-Code plugin sources and wires the generated rows.
#>
[CmdletBinding()]
param(
  [string]$DshHome,
  [string]$Profile = 'web',
  [string]$Features = 'base',
  [switch]$DryRun,
  [switch]$SkipVerify,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = $PSScriptRoot
$Manifest = Get-Content (Join-Path $RepoRoot 'manifest.json') -Raw | ConvertFrom-Json

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Info { param([string]$Message) Write-Host "    $Message" }
function Write-Warn { param([string]$Message) Write-Host "    ! $Message" -ForegroundColor Yellow }

function Copy-Tree {
  param([string]$From, [string]$To)
  if ($DryRun) { Write-Info "copy $From -> $To"; return }
  New-Item -ItemType Directory -Path $To -Force | Out-Null
  Copy-Item -Path (Join-Path $From '*') -Destination $To -Recurse -Force
  Write-Info "copied -> $To"
}

# --- resolve the harness home the way the harness does -----------------------
if (-not $DshHome) {
  $DshHome = if ($env:DSH_HOME -and $env:DSH_HOME.Trim()) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
}
$DshHome = [System.IO.Path]::GetFullPath($DshHome)
$env:DSH_HOME = $DshHome
$ProfileDir = Join-Path $DshHome "profiles\$Profile"

# --- parse features ----------------------------------------------------------
$requested = @($Features -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
$known = @($Manifest.features.PSObject.Properties.Name)
foreach ($name in $requested) {
  if ($known -notcontains $name) { throw "unknown feature '$name'; known: $($known -join ', ')" }
}
$selected = @('base') + @($requested | Where-Object { $_ -ne 'base' }) | Select-Object -Unique

Write-Host ""
Write-Host "dsh-stack installer" -ForegroundColor White
Write-Info "repository   : $RepoRoot"
Write-Info "harness home : $DshHome"
Write-Info "profile      : $Profile  ($ProfileDir)"
Write-Info "features     : $($selected -join ', ')"
if ($DryRun) { Write-Warn "dry run — nothing will be written" }
Write-Host ""

# --- preconditions -----------------------------------------------------------
Write-Step 'Checking preconditions'
try { $nodeVersion = (& node --version) } catch { throw 'node is not on PATH; DeepSeek Harness needs Node >= 22.19' }
Write-Info "node $nodeVersion"
$major = [int](($nodeVersion -replace '^v', '') -split '\.')[0]
if ($major -lt 22) { throw "Node $nodeVersion is too old; the harness needs >= 22.19" }
if ($selected -contains 'cc-compat') {
  try { $null = & git --version; Write-Info (& git --version) } catch { throw "feature 'cc-compat' needs git on PATH" }
}

# --- base: plugins ----------------------------------------------------------
Write-Step 'Installing plugins'
$pluginTarget = Join-Path $ProfileDir 'node_modules'
foreach ($plugin in @($Manifest.features.base.plugins)) {
  $from = Join-Path $RepoRoot "plugins\$plugin"
  if (-not (Test-Path $from)) { throw "plugin source missing: $from" }
  Write-Info "$plugin"
  Copy-Tree -From $from -To (Join-Path $pluginTarget $plugin)
}

# --- base: skills -----------------------------------------------------------
Write-Step 'Installing portable skills'
$skillTarget = Join-Path $DshHome 'skills'
$skillSource = Join-Path $RepoRoot 'home\skills'
$skillNames = @(Get-ChildItem $skillSource -Directory | Select-Object -ExpandProperty Name)
Write-Info "$($skillNames.Count) skills: $($skillNames -join ', ')"
if ($DryRun) { Write-Info "copy $skillSource\* -> $skillTarget" }
else {
  New-Item -ItemType Directory -Path $skillTarget -Force | Out-Null
  Get-ChildItem $skillSource -Directory | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $skillTarget -Recurse -Force
  }
  Write-Info "copied -> $skillTarget"
}
$lockSource = Join-Path $RepoRoot 'home\skills-lock.json'
if (Test-Path $lockSource) {
  if ($DryRun) { Write-Info "copy skills-lock.json -> $DshHome" }
  else { Copy-Item $lockSource (Join-Path $DshHome 'skills-lock.json') -Force; Write-Info 'copied skills-lock.json' }
}

# --- base: profile patch layer ----------------------------------------------
Write-Step 'Composing the profile patch layer'
if (-not (Test-Path $ProfileDir)) {
  if ($DryRun) { Write-Info "would create $ProfileDir" }
  else { New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null }
}
$installedPatch = Join-Path $ProfileDir 'cordis.patch.yml'
if ((Test-Path $installedPatch) -and -not (Select-String -Path $installedPatch -Pattern 'dsh-stack:' -Quiet -ErrorAction SilentlyContinue)) {
  if ($Force) {
    Write-Warn 'existing profile patch has no dsh-stack markers; -Force was given, so it will be replaced'
  } else {
    Write-Warn 'existing profile patch has no dsh-stack markers; it is backed up and then extended'
    if (-not $DryRun) {
      $backup = "$installedPatch.bak-dsh-stack-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
      Copy-Item $installedPatch $backup -Force
      Write-Info "backup: $backup"
    }
  }
}
$patchFiles = @($Manifest.features.base.patches)
foreach ($name in $selected) {
  if ($name -eq 'base') { continue }
  $patchFiles += @($Manifest.features.$name.patches)
}

# A feature already present in the profile under a dsh-stack marker keeps its
# block: composing only the selected features would otherwise delete the rows
# of an add-on that is currently installed and mounted.
if ((Test-Path $installedPatch) -and -not $Force) {
  foreach ($candidate in @($Manifest.features.PSObject.Properties.Name | ForEach-Object { $Manifest.features.$_.patches } | Where-Object { $_ -ne 'cordis.patch.yml' })) {
    if ($patchFiles -contains $candidate) { continue }
    if (Select-String -Path $installedPatch -Pattern ([regex]::Escape("# >>> dsh-stack: $candidate")) -Quiet) {
      $patchFiles += $candidate
      Write-Info "$candidate is already installed; keeping its block"
    }
  }
}

# Preflight: a patch layer may only be written when every plugin package it
# mounts is resolvable FROM THE PROFILE. The loader does not warn about an
# unresolvable name — it aborts the whole boot with `plugin tree failed to
# load`, so a stack that installs "successfully" would be a harness that does
# not start at all.
$resolver = @'
const { createRequire } = require('node:module')
const [profileDir, ...names] = process.argv.slice(2)
const requireFromProfile = createRequire(profileDir + '/noop.js')
const missing = []
for (const name of names) {
  try { requireFromProfile.resolve(name + '/package.json') } catch { missing.push(name) }
}
if (missing.length > 0) { console.log(missing.join(',')); process.exit(3) }
'@
foreach ($layer in $patchFiles) {
  $required = @()
  if ($Manifest.patchRequirements.PSObject.Properties.Name -contains $layer) {
    $required = @($Manifest.patchRequirements.$layer)
  }
  if ($required.Count -eq 0) { continue }
  $resolverFile = Join-Path ([System.IO.Path]::GetTempPath()) "dsh-stack-resolve-$PID.cjs"
  Set-Content -Path $resolverFile -Value $resolver -Encoding utf8
  $missing = (& node $resolverFile $ProfileDir @required 2>&1 | Out-String).Trim()
  $code = $LASTEXITCODE
  Remove-Item $resolverFile -Force -ErrorAction SilentlyContinue
  if ($code -eq 3) {
    throw ("feature layer '$layer' needs plugin(s) that are not resolvable from $ProfileDir`n" +
      "  missing: $missing`n" +
      "  The loader aborts the whole boot on an unresolvable plugin name, so this layer was NOT written.`n" +
      "  Either install the missing package into the profile, or install without this feature.`n" +
      "  Note: a plugin that already exists in ANOTHER harness home is not visible here.")
  }
  if ($code -ne 0) {
    throw "the plugin preflight itself failed for '$layer' (exit $code):`n$missing"
  }
  Write-Info "preflight ok: $layer ($($required.Count) plugin(s) resolvable)"
}
foreach ($name in $patchFiles) {
  $source = Join-Path $RepoRoot "home\profiles\web\$name"
  if (-not (Test-Path $source)) { throw "patch template missing: $source" }
  if ($name -eq 'cordis.patch.yml' -and (Test-Path $installedPatch) -and -not $Force) {
    # The profile already has a patch file. Copying the template over it would
    # both discard rows it does not know about and leave the stack's own rows
    # present twice — once unmanaged, once inside the composed block. The block
    # is the only writer for this file.
    Write-Info 'cordis.patch.yml exists; its dsh-stack block is updated in place (template not copied)'
    continue
  }
  if ($DryRun) { Write-Info "copy $name -> $ProfileDir" }
  else { Copy-Item $source (Join-Path $ProfileDir $name) -Force; Write-Info "copied $name" }
}
if ($DryRun) {
  Write-Info "would run: node tools\compose-patch.mjs --profile-dir $ProfileDir $($patchFiles -join ' ')"
} else {
  $composeArgs = @((Join-Path $RepoRoot 'tools\compose-patch.mjs'), '--profile-dir', $ProfileDir) + $patchFiles
  & node @composeArgs
  if ($LASTEXITCODE -ne 0) { throw 'compose-patch.mjs failed' }
}

# --- credentials: Windows owner-only ACL for the credentials document ---------
if ($selected -contains 'credentials') {
  Write-Step 'Installing the credentials document ACL fix'
  # This package belongs to the HARNESS INSTALLATION, not to the profile: the
  # provider resolves from the installation's own node_modules. Patching it is
  # the only way to change the behaviour of an already-installed harness, which
  # is why it is opt-in and why the target is probed first.
  $credPackage = '@deepseek-ai/dsh-credentials-local'
  # The provider is resolved from the installation's own node_modules, so the
  # target is found by resolving it the same way the harness will, from each
  # candidate anchor, and then reading back the directory that won.
  $locator = @'
const { createRequire } = require('node:module')
const { dirname } = require('node:path')
const [anchor, name] = process.argv.slice(2)
try {
  const requireFromAnchor = createRequire(anchor + '/noop.js')
  const manifest = requireFromAnchor.resolve(name + '/package.json')
  console.log(dirname(manifest))
} catch {
  process.exit(3)
}
'@
  $locatorFile = Join-Path ([System.IO.Path]::GetTempPath()) "dsh-stack-locate-$PID.cjs"
  Set-Content -Path $locatorFile -Value $locator -Encoding utf8
  # Anchors, in order: the home being installed into (a real junction farm once
  # the harness has booted), then the INSTALLATION itself. The credentials
  # provider belongs to the installation, not to any home — a second harness home
  # on the same machine has no copy of it — so resolving only from $DshHome would
  # refuse a perfectly installable target.
  $anchors = @((Join-Path $DshHome 'profiles'), $DshHome)
  # `dsh` on PATH is a shim (`dsh.ps1` in the npm bin directory), so the package
  # root is the shim's directory plus the package path — not its grandparent.
  try {
    $dshCommand = Get-Command dsh -ErrorAction Stop
    $binDir = Split-Path $dshCommand.Source -Parent
    foreach ($candidate in @(
      (Join-Path $binDir 'node_modules\@deepseek-ai\dsh'),
      (Join-Path $binDir '..\@deepseek-ai\dsh')
    )) {
      if (Test-Path (Join-Path $candidate 'package.json')) { $anchors += (Resolve-Path $candidate).Path }
    }
    Write-Info "dsh shim: $($dshCommand.Source)"
  } catch {
    Write-Info 'dsh is not on PATH; resolving from the harness home only'
  }
  # Global npm roots, for a harness installed somewhere the shim does not reveal.
  foreach ($candidate in @(
    (Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh'),
    (Join-Path $env:ProgramFiles 'nodejs\node_modules\@deepseek-ai\dsh')
  )) {
    if ($candidate -and (Test-Path (Join-Path $candidate 'package.json'))) { $anchors += (Resolve-Path $candidate).Path }
  }
  $credTarget = $null
  foreach ($anchor in $anchors) {
    $found = (& node $locatorFile $anchor $credPackage 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $found) { $credTarget = $found; break }
  }
  Remove-Item $locatorFile -Force -ErrorAction SilentlyContinue
  if (-not $credTarget -or -not (Test-Path $credTarget)) {
    throw "feature 'credentials' needs $credPackage, which does not resolve from the harness home or the installation.`n  Install the harness first, or install without this feature.`n  Looked from: $($anchors -join ', ')"
  }
  Write-Info "target: $credTarget"

  $credBundle = Join-Path $credTarget 'lib\index.js'
  $alreadyFixed = (Test-Path $credBundle) -and (Select-String -Path $credBundle -Pattern 'owner-only|icacls|/inheritance' -Quiet)
  if ($alreadyFixed -and -not $Force) {
    Write-Info 'this installation already enforces an owner-only ACL; the overlay was NOT applied'
    Write-Info '(run with -Force to replace it with the version this repository carries)'
  } else {
    $overlay = Join-Path $RepoRoot 'patches\credentials-local'
    if (-not (Test-Path (Join-Path $overlay 'lib\index.js'))) { throw "overlay missing: $overlay" }
    if ($DryRun) {
      Write-Info "would copy the overlay over $credTarget (lib\index.js backed up first)"
    } else {
      if (Test-Path $credBundle) {
        $backup = "$credBundle.bak-dsh-stack"
        if (-not (Test-Path $backup)) { Copy-Item $credBundle $backup -Force; Write-Info "backup: $backup" }
        else { Write-Info "backup already present, kept: $backup" }
      }
      Copy-Item (Join-Path $overlay 'lib\index.js') (Join-Path $credTarget 'lib\index.js') -Force
      New-Item -ItemType Directory -Path (Join-Path $credTarget 'lib\types') -Force | Out-Null
      foreach ($file in @('owner-only-acl.js', 'owner-only-acl.d.ts')) {
        Copy-Item (Join-Path $overlay "lib\types\$file") (Join-Path $credTarget "lib\types\$file") -Force
      }
      Write-Info 'overlay applied: lib\index.js + lib\types\owner-only-acl.js'
    }
  }

  # The regression test is kept with the install so it can be re-run against the
  # artifact that is actually loaded, which is the only thing that proves the fix
  # is in effect.
  $testDir = Join-Path $DshHome 'dsh-stack\credentials-local'
  if ($DryRun) {
    Write-Info "would copy the regression test to $testDir"
  } else {
    New-Item -ItemType Directory -Path $testDir -Force | Out-Null
    Copy-Item (Join-Path $RepoRoot 'patches\credentials-local\tests\owner-only-acl.test.mjs') $testDir -Force
    Write-Info 'regression test available:'
    Write-Info "  node `"$testDir\owner-only-acl.test.mjs`" `"$credTarget`""
    $env:DSH_STACK_CRED_TARGET = $credTarget
    if (-not $SkipVerify -and -not $DryRun) {
      & node (Join-Path $testDir 'owner-only-acl.test.mjs') $credTarget
      if ($LASTEXITCODE -ne 0) { Write-Warn 'the credentials regression test FAILED — see above' }
      else { Write-Info 'credentials regression test passed' }
    }
  }
}

# --- cc-compat --------------------------------------------------------------
if ($selected -contains 'cc-compat') {
  Write-Step 'Installing Claude-Code compatibility (clones + compile)'
  $compatTarget = Join-Path $DshHome 'cc-compat'
  Copy-Tree -From (Join-Path $RepoRoot 'cc-compat') -To $compatTarget
  if (-not $DryRun) {
    Write-Info 'cloning the sources in repos.txt into cc-sources (needs network on the first run)'
    & node (Join-Path $compatTarget 'install.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'cc-compat/install.mjs failed' }
    Write-Info 'compiling plugins: skills, agents, commands, hooks, MCP rows'
    & node (Join-Path $compatTarget 'plugin-install.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'cc-compat/plugin-install.mjs failed' }
    # The generator's patch fragments are NOT composed in. Checked row by row:
    # `generated-hooks.patch.yml` declares exactly the three hook rows the
    # cc-compat template declares, and the `generated-mcp*` fragments declare
    # rows the websearch and optional templates already own. Composing both
    # sides produces the same row two to five times — the loader tolerates it
    # (last wins) but the file becomes unreadable. The generator's real output
    # is the compiled skills and agents plus `generated-hooks/<plugin>.json`,
    # which the template points at.
    if (Test-Path (Join-Path $compatTarget 'generated-hooks.patch.yml')) {
      Write-Info 'generated patch fragments exist but are already covered by the layer templates; not composed'
    }
  }
}

# --- verification -----------------------------------------------------------
if (-not $SkipVerify) {
  Write-Step 'Verifying the installation'
  if ($DryRun) { Write-Info 'skipped (dry run)' }
  else {
    & node (Join-Path $RepoRoot 'tools\verify.mjs')
    if ($LASTEXITCODE -ne 0) {
      Write-Warn 'verification reported failures — see above'
      exit 1
    }
  }
}

# --- next steps -------------------------------------------------------------
Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. credentials: add the refs listed in manifest.json under .credentials"
Write-Host "     to $DshHome\.credentials.yaml (or export them as environment variables)."
Write-Host "     The stack ships no keys."
Write-Host "  2. start the harness:   dsh web"
Write-Host "     (the profile is booted with its own patch layer; a plugin row added"
Write-Host "      while a harness is running appears only on the next start)"
Write-Host "  3. check the composed tree:   dsh web --dump-config | Select-String firecrawl"
Write-Host "  4. re-verify at any time:     node tools\verify.mjs"
Write-Host ""
