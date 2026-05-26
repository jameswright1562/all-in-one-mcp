param(
  [string]$InstallerPath = "",
  [switch]$Build,
  [switch]$NoExit
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$stageRoot = Join-Path $repoRoot ".codex-temp\exe-sandbox"
$sandboxFolder = "C:\Users\WDAGUtilityAccount\Desktop\all-in-one-mcp-exe-test"

function Resolve-Installer {
  if ($InstallerPath) {
    return (Resolve-Path $InstallerPath).Path
  }

  $bundleRoot = Join-Path $repoRoot "apps\tauri-vue\src-tauri\target\release\bundle"
  $installer = Get-ChildItem $bundleRoot -Recurse -Filter "*setup.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $installer) {
    throw "No NSIS setup exe found under $bundleRoot. Run with -Build or build first with 'pnpm tauri:build'."
  }

  return $installer.FullName
}

if ($Build) {
  Push-Location $repoRoot
  try {
    pnpm tauri:build
  } finally {
    Pop-Location
  }
}

if (-not (Get-Command WindowsSandbox.exe -ErrorAction SilentlyContinue)) {
  throw "WindowsSandbox.exe was not found. Enable 'Windows Sandbox' in Windows Features, then reboot."
}

Remove-Item $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stageRoot | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageRoot "logs") | Out-Null

$installer = Resolve-Installer
Copy-Item $installer (Join-Path $stageRoot (Split-Path $installer -Leaf)) -Force
Copy-Item (Join-Path $PSScriptRoot "run-in-sandbox.ps1") (Join-Path $stageRoot "run-in-sandbox.ps1") -Force
Copy-Item (Join-Path $repoRoot "packages\runtime\test\fixtures\stdio-tool-server.mjs") (Join-Path $stageRoot "stdio-tool-server.mjs") -Force

$command = "powershell.exe -ExecutionPolicy Bypass -File `"$sandboxFolder\run-in-sandbox.ps1`""
if ($NoExit) {
  $command = "powershell.exe -NoExit -ExecutionPolicy Bypass -File `"$sandboxFolder\run-in-sandbox.ps1`""
}

$hostFolder = [System.Security.SecurityElement]::Escape((Resolve-Path $stageRoot).Path)
$sandboxFolderEscaped = [System.Security.SecurityElement]::Escape($sandboxFolder)
$commandEscaped = [System.Security.SecurityElement]::Escape($command)
$wsbPath = Join-Path $stageRoot "all-in-one-mcp-exe-test.wsb"

@"
<Configuration>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$hostFolder</HostFolder>
      <SandboxFolder>$sandboxFolderEscaped</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>$commandEscaped</Command>
  </LogonCommand>
</Configuration>
"@ | Set-Content -Path $wsbPath -Encoding UTF8

Write-Host "Starting Windows Sandbox with installer:"
Write-Host "  $installer"
Write-Host "Sandbox output will be written to:"
Write-Host "  $stageRoot"
Start-Process WindowsSandbox.exe -ArgumentList "`"$wsbPath`""
