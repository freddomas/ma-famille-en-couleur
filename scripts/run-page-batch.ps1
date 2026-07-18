param(
    [Parameter(Mandatory = $true)]
    [string]$CatalogueId,

    [Parameter(Mandatory = $true)]
    [ValidateRange(2, 10)]
    [int]$Page,

    [switch]$DryRun,

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$imageGenerator = "C:\Users\frede\.codex\skills\.system\imagegen\scripts\image_gen.py"
if (-not (Test-Path -LiteralPath $imageGenerator)) {
    throw "CLI imagegen introuvable : $imageGenerator"
}

$batchJson = node "$PSScriptRoot/create-page-batch.mjs" $CatalogueId $Page
if ($LASTEXITCODE -ne 0) {
    throw "La création du lot JSONL a échoué."
}

$batch = $batchJson | ConvertFrom-Json
$arguments = @(
    $imageGenerator,
    "generate-batch",
    "--input", $batch.inputPath,
    "--out-dir", $batch.outputDirectory,
    "--concurrency", "4",
    "--max-attempts", "2",
    "--fail-fast",
    "--no-augment"
)

if ($DryRun) {
    $arguments += "--dry-run"
}

if ($Force) {
    $arguments += "--force"
}

python @arguments
if ($LASTEXITCODE -ne 0) {
    throw "Le lot imagegen a échoué pour $CatalogueId page $Page."
}

if (-not $DryRun) {
    $paths = 1..4 | ForEach-Object {
        $itemNumber = (($Page - 1) * 4) + $_
        Join-Path $batch.outputDirectory ("{0:D2}.png" -f $itemNumber)
    }

    foreach ($path in $paths) {
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Sortie absente : $path"
        }
    }

    & "$PSScriptRoot/prepare-coloring-assets.ps1" -InputPath $paths

    $data = Get-Content -Raw -Encoding UTF8 -LiteralPath "public/data/catalogues.json" | ConvertFrom-Json
    $catalogue = $data.catalogues | Where-Object { $_.id -eq $CatalogueId }
    $titles = @($catalogue.items[(($Page - 1) * 4)..(($Page * 4) - 1)])
    $contactPath = Join-Path "qa/contact-sheets/$CatalogueId" ("page-{0:D2}-candidate.png" -f $Page)

    & "$PSScriptRoot/build-contact-sheet.ps1" `
        -InputPath $paths `
        -Title $titles `
        -OutputPath $contactPath `
        -Heading ("{0} - page {1} - candidat CLI" -f $catalogue.title, $Page)

    Write-Output "Lot candidat prêt pour validation : $contactPath"
}
