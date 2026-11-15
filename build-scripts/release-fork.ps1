<#
.SYNOPSIS
    Build the "VRCX Custom" (S0iRu/VRCX fork) Windows installer and optionally
    publish it as a GitHub release so installed copies auto-update.

.DESCRIPTION
    Version scheme: <upstream Version file>.<N>, e.g. 2026.11.14.1, 2026.11.14.2 ...
    N is the next free number among the fork's existing releases for that base.
    The release title is "VRCX <version>", which is what the in-app updater compares.

.EXAMPLE
    # build the installer only (build\VRCX-Custom_<ver>_Setup_x64.exe)
    pwsh build-scripts\release-fork.ps1

    # build, push the current branch and publish a GitHub release
    pwsh build-scripts\release-fork.ps1 -Publish

    # build and run the installer locally
    pwsh build-scripts\release-fork.ps1 -Install
#>
param(
    [switch]$Publish,
    [switch]$Install,
    [string]$Repo = 'S0iRu/VRCX'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Run($exe, [string[]]$argv) {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { throw "$exe $($argv -join ' ') failed ($LASTEXITCODE)" }
}

# ---- version -------------------------------------------------------------
$base = (Get-Content -Raw Version).Trim()
$n = 1
if ($Publish) {
    $tags = (gh release list --repo $Repo --limit 200 --json tagName | ConvertFrom-Json).tagName
    $used = $tags | Where-Object { $_ -match "^v$([regex]::Escape($base))\.(\d+)$" } |
        ForEach-Object { [int]($_ -replace '.*\.', '') }
    if ($used) { $n = ($used | Measure-Object -Maximum).Maximum + 1 }
}
$version = "$base.$n"
Step "Version $version"

if ($Publish) {
    if (git status --porcelain) { throw 'Working tree is not clean. Commit your changes first.' }
}

# ---- build ---------------------------------------------------------------
Step 'Building frontend'
Run npm @('run', 'prod')

Step 'Building .NET (CEF)'
$dotnet = (Get-Command dotnet -ErrorAction SilentlyContinue).Source
if (-not $dotnet) { $dotnet = 'C:\Program Files\dotnet\dotnet.exe' }
Run $dotnet @('build', 'Dotnet/VRCX-Cef.csproj', '-p:Configuration=Release', '-p:WarningLevel=0',
    '-p:Platform=x64', '-p:PlatformTarget=x64', '-t:Clean;Build', '-maxcpucount',
    '--runtime', 'win-x64', '--self-contained', '-v', 'q')

Step 'Assembling build\Cef'
Remove-Item -Recurse -Force build\Cef\html -ErrorAction SilentlyContinue
Copy-Item -Recurse build\html build\Cef\html
Set-Content -NoNewline -Encoding ascii build\Cef\Version $version

# ---- installer -------------------------------------------------------------
Step 'Building installer'
$makensis = (Get-Command makensis -ErrorAction SilentlyContinue).Source
if (-not $makensis) {
    $makensis = @("${env:ProgramFiles(x86)}\NSIS\makensis.exe", "$env:ProgramFiles\NSIS\makensis.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $makensis) { throw 'makensis not found. Install NSIS: winget install NSIS.NSIS' }
Set-Content -Encoding ascii Installer\version_define_fork.nsh "!define PRODUCT_VERSION_FROM_FILE `"$version`""
Push-Location Installer
try { Run $makensis @('/V2', 'installer-fork.nsi') } finally { Pop-Location }
$setup = "build\VRCX-Custom_${version}_Setup_x64.exe"
Move-Item -Force Installer\VRCX-Custom_Setup_x64.exe $setup
Step "Installer: $setup"

# ---- publish -------------------------------------------------------------
if ($Publish) {
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    Step "Pushing $branch"
    Run git @('push', 'origin', $branch)

    $sha = (git rev-parse HEAD).Trim()
    $lastTag = (gh release list --repo $Repo --limit 1 --json tagName | ConvertFrom-Json).tagName
    $range = if ($lastTag) { "$lastTag..HEAD" } else { 'upstream/master..HEAD' }
    git fetch origin --tags --quiet 2>$null
    $log = git log --no-merges --pretty='- %s' $range 2>$null
    if (-not $log) { $log = git log --no-merges --pretty='- %s' -5 }
    $notes = "Fork build of VRCX $base.`n`n$($log -join "`n")"

    Step "Creating release v$version"
    Run gh @('release', 'create', "v$version", $setup, '--repo', $Repo, '--target', $sha,
        '--title', "VRCX $version", '--notes', $notes)
}

if ($Install) {
    Step 'Running installer'
    Start-Process -Wait $setup
}

Step 'Done'
