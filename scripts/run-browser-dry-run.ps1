param(
  [int]$Port = 9223
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path -LiteralPath $chrome -PathType Leaf)) {
  throw "Google Chrome est introuvable : $chrome"
}

$profile = Join-Path $root "tmp\chrome-dry-run-$Port"
$resolvedRoot = [System.IO.Path]::GetFullPath($root)
$resolvedProfile = [System.IO.Path]::GetFullPath($profile)
if (-not $resolvedProfile.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Le profil Chrome doit rester dans le dépôt."
}
New-Item -ItemType Directory -Force -Path $profile | Out-Null

$arguments = @(
  "--headless=new"
  "--disable-gpu"
  "--disable-crash-reporter"
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
    throw "Chrome DevTools n'a pas démarré sur le port $Port."
  }
  & node (Join-Path $PSScriptRoot "browser-dry-run.cjs") "http://127.0.0.1:$Port"
  if ($LASTEXITCODE -ne 0) {
    throw "Le DRY_RUN navigateur a échoué avec le code $LASTEXITCODE."
  }
} finally {
  if (-not $chromeProcess.HasExited) {
    Stop-Process -Id $chromeProcess.Id -Force
  }
}
