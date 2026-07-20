param(
    [int]$Port = 9223,
    [int]$AppPort = 8080,
    [string]$ChromePath = $env:AGENT_BROWSER_EXECUTABLE_PATH,
    [switch]$Headed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$chromeCandidates = @()
if ($ChromePath) {
    $chromeCandidates += $ChromePath
}

$chromeCandidates += @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe")
)

# Le Chrome système est préféré : sur Windows, le sandbox peut refuser
# l'exécutable téléchargé sous le profil utilisateur de l'agent. La copie
# agent-browser reste un repli portable lorsque Chrome n'est pas installé.
$agentBrowserCommand = Get-Command "agent-browser" -ErrorAction SilentlyContinue
if ($agentBrowserCommand) {
    $npmBin = Split-Path -Parent $agentBrowserCommand.Source
    $profileRoot = Split-Path -Parent (
        Split-Path -Parent (
            Split-Path -Parent $npmBin
        )
    )
    $agentBrowserBrowsers = Join-Path $profileRoot ".agent-browser\browsers"
    if (Test-Path -LiteralPath $agentBrowserBrowsers -PathType Container) {
        $chromeCandidates += Get-ChildItem `
            -LiteralPath $agentBrowserBrowsers `
            -Directory `
            -Filter "chrome-*" |
            Sort-Object LastWriteTime -Descending |
            ForEach-Object { Join-Path $_.FullName "chrome.exe" }
    }
}

$chrome = $chromeCandidates |
    Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
    Select-Object -First 1

if (-not $chrome) {
    throw "Chrome est introuvable. Exécutez 'agent-browser install' ou fournissez -ChromePath."
}

$runId = [System.Guid]::NewGuid().ToString("N")
$profile = Join-Path $root "tmp\chrome-dry-run-$Port-$runId"
$nextStdout = Join-Path $root "tmp\next-dry-run.stdout.log"
$nextStderr = Join-Path $root "tmp\next-dry-run.stderr.log"
$chromeStdout = Join-Path $root "tmp\chrome-dry-run.stdout.log"
$chromeStderr = Join-Path $root "tmp\chrome-dry-run.stderr.log"
$resolvedRoot = [System.IO.Path]::GetFullPath($root)
$resolvedProfile = [System.IO.Path]::GetFullPath($profile)
if (-not $resolvedProfile.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Le profil Chrome doit rester dans le dépôt."
}
New-Item -ItemType Directory -Force -Path $profile | Out-Null

$nextProcess = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList @("node_modules/next/dist/bin/next", "start", "-p", $AppPort) `
  -WorkingDirectory $root `
  -RedirectStandardOutput $nextStdout `
  -RedirectStandardError $nextStderr `
  -WindowStyle Hidden `
  -PassThru

$appReady = $false
foreach ($attempt in 1..80) {
  try {
    $response = Invoke-WebRequest `
      -Uri "http://127.0.0.1:$AppPort/" `
      -UseBasicParsing `
      -TimeoutSec 1
    if ($response.StatusCode -eq 200) {
      $appReady = $true
      break
    }
  } catch {
    Start-Sleep -Milliseconds 250
  }
}
if (-not $appReady) {
  if (-not $nextProcess.HasExited) {
    Stop-Process -Id $nextProcess.Id -Force
  }
  throw "Next.js n'a pas démarré sur le port $AppPort."
}

$chromeArguments = @(
    "--disable-gpu"
    "--disable-gpu-sandbox"
    "--disable-crash-reporter"
  "--disable-extensions"
  "--disable-background-networking"
  "--no-first-run"
  "--no-default-browser-check"
      "--remote-debugging-address=127.0.0.1"
      "--remote-debugging-port=$Port"
      "--remote-allow-origins=*"
      "--user-data-dir=`"$profile`""
      "http://127.0.0.1:$AppPort/"
)
if (-not $Headed) {
    $chromeArguments = @("--headless=new") + $chromeArguments
}
$arguments = $chromeArguments -join " "
$chromeWindowStyle = if ($Headed) { "Normal" } else { "Hidden" }
$previousPlaywrightHeaded = $env:PLAYWRIGHT_HEADED
if ($Headed) {
    $env:PLAYWRIGHT_HEADED = "1"
} else {
    Remove-Item Env:PLAYWRIGHT_HEADED -ErrorAction SilentlyContinue
}

$chromeProcess = Start-Process `
  -FilePath $chrome `
  -ArgumentList $arguments `
  -RedirectStandardOutput $chromeStdout `
  -RedirectStandardError $chromeStderr `
  -WindowStyle $chromeWindowStyle `
  -PassThru

try {
  $ready = $false
  foreach ($attempt in 1..40) {
    try {
      $response = Invoke-WebRequest `
        -Uri "http://127.0.0.1:$Port/json/version" `
        -UseBasicParsing `
        -TimeoutSec 1
      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $ready) {
    $chromeDetails = if (Test-Path -LiteralPath $chromeStderr) {
      (Get-Content -LiteralPath $chromeStderr -Raw).Trim()
    } else {
      "Aucun journal Chrome disponible."
    }
    throw "Chrome DevTools indisponible sur le port $Port. $chromeDetails"
  }
  & node `
    (Join-Path $PSScriptRoot "browser-dry-run.cjs") `
    "http://127.0.0.1:$Port" `
    "http://127.0.0.1:$AppPort/"
    if ($LASTEXITCODE -ne 0) {
      throw "Le DRY_RUN navigateur a échoué avec le code $LASTEXITCODE."
    }

    & node `
      (Join-Path $PSScriptRoot "coloring-browser-qa.cjs") `
      "http://127.0.0.1:$Port" `
      "http://127.0.0.1:$AppPort/"
    if ($LASTEXITCODE -ne 0) {
      throw "La QA géométrique multi-format a échoué avec le code $LASTEXITCODE."
    }
  } finally {
    if (-not $chromeProcess.HasExited) {
        Stop-Process -Id $chromeProcess.Id -Force
    }
    if (-not $nextProcess.HasExited) {
        Stop-Process -Id $nextProcess.Id -Force
    }
    if (Test-Path -LiteralPath $profile -PathType Container) {
        Remove-Item -LiteralPath $profile -Recurse -Force
    }
    if ($null -eq $previousPlaywrightHeaded) {
        Remove-Item Env:PLAYWRIGHT_HEADED -ErrorAction SilentlyContinue
    } else {
        $env:PLAYWRIGHT_HEADED = $previousPlaywrightHeaded
    }
}
