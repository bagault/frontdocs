# Frontdocs build script for Windows
# Usage: .\scripts\build.ps1 [-Mode dev|prod]

param(
    [ValidateSet("dev", "prod")]
    [string]$Mode
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Split-Path -Parent $ScriptDir
Set-Location $ProjectDir

# ── Helpers ─────────────────────────────────────────────────────────────────
function Write-Info  { param([string]$Msg) Write-Host "[INFO]  $Msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Msg) Write-Host "[OK]    $Msg" -ForegroundColor Green }
function Write-Warn  { param([string]$Msg) Write-Host "[WARN]  $Msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$Msg) Write-Host "[ERR]   $Msg" -ForegroundColor Red }

# ── Platform info ───────────────────────────────────────────────────────────
$Arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
switch ($Arch) {
    "X64"   { $Triple = "x86_64-pc-windows-msvc" }
    "Arm64" { $Triple = "aarch64-pc-windows-msvc" }
    default {
        Write-Err "Unsupported architecture: $Arch"
        exit 1
    }
}

Write-Info "Platform: windows ($Triple)"

# ── Mode selection ──────────────────────────────────────────────────────────
if (-not $Mode) {
    Write-Host ""
    Write-Host "Select build mode:" -NoNewline -ForegroundColor White
    Write-Host ""
    Write-Host "  1) dev   - Development build (debug, fast compile, dev tools)" -ForegroundColor Cyan
    Write-Host "  2) prod  - Production build (optimized, bundled for distribution)" -ForegroundColor Cyan
    Write-Host ""
    $choice = Read-Host "Choice [1/2]"
    switch ($choice) {
        { $_ -eq "1" -or $_ -eq "dev" }  { $Mode = "dev" }
        { $_ -eq "2" -or $_ -eq "prod" } { $Mode = "prod" }
        default {
            Write-Err "Invalid choice: $choice"
            exit 1
        }
    }
}

Write-Host ""
Write-Host "Building Frontdocs - $Mode" -ForegroundColor White
Write-Host ""

# ── Prerequisites check ────────────────────────────────────────────────────
function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Err "Required command not found: $Name"
        Write-Host "  Install it and try again."
        exit 1
    }
}

Assert-Command "node"
Assert-Command "npm"
Assert-Command "cargo"
Assert-Command "rustc"

$nodeVer = & node -v
$rustVer = (& rustc --version) -replace 'rustc\s+', '' -replace '\s.*', ''
Write-Info "Node $nodeVer, Rust $rustVer"

# ── Install npm dependencies ───────────────────────────────────────────────
if (-not (Test-Path "node_modules")) {
    Write-Info "Installing npm dependencies..."
    & npm install
    if ($LASTEXITCODE -ne 0) { Write-Err "npm install failed"; exit 1 }
    Write-Ok "npm dependencies installed"
} else {
    Write-Info "node_modules/ exists, skipping npm install (run npm install manually if needed)"
}

# ── Ensure mkdocs is installed ────────────────────────────────────────────────
if (-not (Get-Command "mkdocs" -ErrorAction SilentlyContinue)) {
    Write-Info "mkdocs not found. Installing mkdocs and mkdocs-material..."
    & pip install mkdocs mkdocs-material pymdown-extensions
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to install mkdocs. Install it manually: pip install mkdocs mkdocs-material pymdown-extensions"
        exit 1
    }
    Write-Ok "mkdocs installed"
} else {
    $mkdocsVer = & mkdocs --version
    Write-Info "mkdocs found: $mkdocsVer"
}

# ── Build ───────────────────────────────────────────────────────────────────
if ($Mode -eq "dev") {
    Write-Info "Starting development build..."
    Write-Info "Running: npm run tauri dev"
    Write-Host ""
    & npm run tauri dev
    if ($LASTEXITCODE -ne 0) { Write-Err "Dev build failed"; exit 1 }
} else {
    Write-Info "Starting production build..."

    # Type-check frontend
    Write-Info "Type-checking Vue frontend..."
    & npx vue-tsc --noEmit
    if ($LASTEXITCODE -ne 0) { Write-Err "TypeScript checks failed"; exit 1 }
    Write-Ok "TypeScript checks passed"

    # Build with Tauri
    Write-Info "Running: npm run tauri build"
    Write-Host ""
    & npm run tauri build
    if ($LASTEXITCODE -ne 0) { Write-Err "Production build failed"; exit 1 }

    Write-Host ""
    Write-Ok "Production build complete!"

    # ── Locate artifacts ──────────────────────────────────────────────────
    $BundleDir = "src-tauri\target\release\bundle"
    Write-Host ""
    Write-Host "Build artifacts:" -ForegroundColor White

    $NsisDir = Join-Path $BundleDir "nsis"
    $MsiDir  = Join-Path $BundleDir "msi"

    foreach ($dir in @($NsisDir, $MsiDir)) {
        if (Test-Path $dir) {
            Get-ChildItem -Path $dir -File | Where-Object {
                $_.Extension -in ".exe", ".msi"
            } | ForEach-Object {
                Write-Host "  * $($_.FullName)" -ForegroundColor Green
            }
        }
    }

    Write-Host ""
    Write-Info "Artifacts are in: $BundleDir\"
}
