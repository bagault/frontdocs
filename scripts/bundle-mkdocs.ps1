# Bundle mkdocs + mkdocs-material + pymdown-extensions into a standalone
# binary using PyInstaller. The output goes to src-tauri\binaries\ with the
# Tauri sidecar naming convention: mkdocs-<target-triple>.exe
#
# Requirements: python3
# Usage: .\scripts\bundle-mkdocs.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir

# ── Helpers ─────────────────────────────────────────────────────────────────
function Write-Info  { param([string]$Msg) Write-Host "[INFO]  $Msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Msg) Write-Host "[OK]    $Msg" -ForegroundColor Green }
function Write-Err   { param([string]$Msg) Write-Host "[ERR]   $Msg" -ForegroundColor Red; exit 1 }

# ── Platform detection ──────────────────────────────────────────────────────
$Arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
switch ($Arch) {
    "X64"   { $Triple = "x86_64-pc-windows-msvc" }
    "Arm64" { $Triple = "aarch64-pc-windows-msvc" }
    default { Write-Err "Unsupported architecture: $Arch" }
}

Write-Info "Bundling mkdocs for $Triple"

$VenvDir     = Join-Path $ProjectDir ".mkdocs-venv"
$BinariesDir = Join-Path $ProjectDir "src-tauri\binaries"
$WorkDir     = Join-Path $ProjectDir ".pyinstaller-work"

if (-not (Test-Path $BinariesDir)) { New-Item -ItemType Directory -Path $BinariesDir | Out-Null }

# ── Virtual environment ─────────────────────────────────────────────────────
if (-not (Test-Path $VenvDir)) {
    Write-Info "Creating Python virtual environment..."
    & python -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) { Write-Err "Failed to create virtual environment" }
}

& "$VenvDir\Scripts\Activate.ps1"

# ── Install dependencies ────────────────────────────────────────────────────
Write-Info "Installing mkdocs and PyInstaller into venv..."
& pip install --upgrade pip --quiet
& pip install mkdocs mkdocs-material pymdown-extensions pyinstaller --quiet

# ── Run PyInstaller ─────────────────────────────────────────────────────────
Write-Info "Running PyInstaller (--onefile) ..."
Set-Location $ProjectDir

& pyinstaller --onefile `
    --name mkdocs `
    --distpath $BinariesDir `
    --workpath $WorkDir `
    --specpath $WorkDir `
    --collect-all mkdocs `
    --collect-all mkdocs_material `
    --collect-all material `
    --collect-all pymdownx `
    --collect-all markdown `
    --collect-all pygments `
    --collect-all jinja2 `
    --collect-all yaml `
    --collect-all mergedeep `
    --collect-all ghp_import `
    --collect-all pyyaml_env_tag `
    --collect-all pathspec `
    --collect-all paginate `
    --collect-all babel `
    --collect-all colorama `
    --clean `
    --noconfirm `
    "$ScriptDir\mkdocs_entry.py"

if ($LASTEXITCODE -ne 0) { Write-Err "PyInstaller failed" }

# ── Rename to Tauri sidecar convention ──────────────────────────────────────
$SrcExe = Join-Path $BinariesDir "mkdocs.exe"
$DstExe = Join-Path $BinariesDir "mkdocs-$Triple.exe"
Move-Item -Force $SrcExe $DstExe

& deactivate

Write-Ok "Sidecar ready: src-tauri\binaries\mkdocs-$Triple.exe"
$Size = (Get-Item $DstExe).Length / 1MB
Write-Info ("Size: {0:N1} MB" -f $Size)
