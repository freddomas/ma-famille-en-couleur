param(
  [int]$Port = 9223,
  [int]$AppPort = 8080
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path -LiteralPath $chrome -PathType Leaf)) {
  throw "Google Chrome est introuvable : $chrome"
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

$arguments = @(
  "--headless=new"
  "--disable-gpu"
  "--disable-crash-reporter"
  "--disable-extensions"
  "--disable-background-networking"
  "--no-first-run"
  "--no-default-browser-check"
  "--remote-debugging-address=127.0.0.1"
  "--remote-debugging-port=$Port"
  "--user-data-dir=`"$profile`""
  "about:blank"
) -join " "

$chromeProcess = Start-Process `
  -FilePath $chrome `
  -ArgumentList $arguments `
  -RedirectStandardOutput $chromeStdout `
  -RedirectStandardError $chromeStderr `
  -WindowStyle Hidden `
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
} finally {
  if (-not $chromeProcess.HasExited) {
    Stop-Process -Id $chromeProcess.Id -Force
  }
  if (-not $nextProcess.HasExited) {
    Stop-Process -Id $nextProcess.Id -Force
  }
}
