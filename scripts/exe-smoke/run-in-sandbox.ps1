$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $root "logs"
$installDir = "C:\AllInOneMcpExeTest"
$resultPath = Join-Path $root "result.json"
$transcriptPath = Join-Path $logDir "sandbox-transcript.log"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Start-Transcript -Path $transcriptPath -Force | Out-Null

function Write-Result {
  param(
    [string]$Status,
    [string]$Message,
    [hashtable]$Extra = @{}
  )

  $payload = @{
    status = $Status
    message = $Message
    timestamp = (Get-Date).ToString("o")
  }

  foreach ($key in $Extra.Keys) {
    $payload[$key] = $Extra[$key]
  }

  $payload | ConvertTo-Json -Depth 6 | Set-Content -Path $resultPath -Encoding UTF8
}

function Copy-Runtime-Logs {
  $runtimeLogs = Get-ChildItem $env:LOCALAPPDATA -Recurse -Filter "runtime.stderr.log" -ErrorAction SilentlyContinue |
    Select-Object -First 5

  foreach ($stderr in $runtimeLogs) {
    $runtimeLogDir = Split-Path -Parent $stderr.FullName
    $dest = Join-Path $logDir ("runtime-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Copy-Item (Join-Path $runtimeLogDir "*") $dest -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Add-FixtureMcp {
  param(
    [string]$InstallDir,
    [string]$FixturePath
  )

  $node = Get-ChildItem $InstallDir -Recurse -Filter "node.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $node) {
    throw "Bundled node.exe was not found in the installed app. Cannot start stdio fixture MCP."
  }

  $id = "package-smoke-{0}" -f ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
  $body = @{
    id = $id
    name = "Package Smoke Fixture"
    enabled = $true
    autoStart = $true
    toolPrefix = $id
    startupTimeoutMs = 5000
    transport = "stdio"
    command = $node.FullName
    args = @($FixturePath)
    env = @()
  } | ConvertTo-Json -Depth 6

  $created = Invoke-RestMethod "http://127.0.0.1:4100/api/mcps" -Method Post -ContentType "application/json" -Body $body
  $mcps = Invoke-RestMethod "http://127.0.0.1:4100/api/mcps"

  if (-not ($mcps | Where-Object { $_.id -eq $id })) {
    throw "Fixture MCP $id was not present in /api/mcps response."
  }

  return @{
    id = $id
    created = $created
    command = $node.FullName
  }
}

try {
  $installer = Get-ChildItem $root -Filter "*setup.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $installer) {
    throw "No setup exe found in mapped sandbox folder $root."
  }

  Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null

  Write-Host "Installing $($installer.FullName) into $installDir"
  $install = Start-Process $installer.FullName -ArgumentList @("/S", "/D=$installDir") -Wait -PassThru
  if ($install.ExitCode -ne 0) {
    throw "Installer exited with code $($install.ExitCode)."
  }

  $appExe = Get-ChildItem $installDir -Recurse -Filter "*.exe" |
    Where-Object { $_.Name -notmatch "uninstall|node" } |
    Sort-Object Length -Descending |
    Select-Object -First 1

  if (-not $appExe) {
    throw "Installed app exe was not found under $installDir."
  }

  Write-Host "Launching $($appExe.FullName)"
  $app = Start-Process $appExe.FullName -PassThru

  $health = $null
  $deadline = (Get-Date).AddSeconds(25)
  do {
    try {
      $health = Invoke-RestMethod "http://127.0.0.1:4100/healthz" -TimeoutSec 1
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)

  Copy-Runtime-Logs

  if (-not $health) {
    throw "Packaged exe did not expose http://127.0.0.1:4100/healthz within 25 seconds."
  }

  $mcp = Add-FixtureMcp -InstallDir $installDir -FixturePath (Join-Path $root "stdio-tool-server.mjs")

  Write-Result "passed" "Packaged exe launched, runtime health responded, and fixture MCP was added." @{
    installer = $installer.FullName
    appExe = $appExe.FullName
    health = $health
    mcp = $mcp
    processId = $app.Id
  }

  Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
  Write-Host "PASS: packaged exe launched, runtime responded, and fixture MCP was added."
} catch {
  Copy-Runtime-Logs
  Write-Result "failed" $_.Exception.Message
  Write-Error $_
  exit 1
} finally {
  Stop-Transcript | Out-Null
}
