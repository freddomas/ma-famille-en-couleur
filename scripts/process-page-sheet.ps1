param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,

    [Parameter(Mandatory = $true)]
    [string]$CatalogueId,

    [Parameter(Mandatory = $true)]
    [ValidateRange(2, 10)]
    [int]$Page,

    [int]$Attempt = 1,

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$data = Get-Content -Raw -Encoding UTF8 -LiteralPath "public/data/catalogues.json" | ConvertFrom-Json
$catalogue = $data.catalogues | Where-Object { $_.id -eq $CatalogueId }
if (-not $catalogue) {
    throw "Catalogue inconnu : '$CatalogueId'."
}

$source = (Resolve-Path -LiteralPath $SourcePath).Path
$sourceDirectory = Join-Path "qa/sources" $CatalogueId
$contactDirectory = Join-Path "qa/contact-sheets" $CatalogueId
$itemDirectory = Join-Path "public/assets/coloring/items" $CatalogueId
New-Item -ItemType Directory -Force -Path $sourceDirectory, $contactDirectory, $itemDirectory | Out-Null

$sourceEvidence = Join-Path $sourceDirectory ("page-{0:D2}-attempt-{1:D2}.png" -f $Page, $Attempt)
if ((Test-Path -LiteralPath $sourceEvidence) -and -not $Force) {
    throw "La preuve source '$sourceEvidence' existe déjà."
}
Copy-Item -LiteralPath $source -Destination $sourceEvidence -Force:$Force

$bitmap = [System.Drawing.Bitmap]::FromFile($source)
try {
    if (($bitmap.Width % 2) -ne 0 -or ($bitmap.Height % 2) -ne 0) {
        throw "La planche '$source' doit avoir des dimensions paires."
    }

    $cellWidth = [int]($bitmap.Width / 2)
    $cellHeight = [int]($bitmap.Height / 2)
    $firstIndex = ($Page - 1) * 4
    $paths = @()

    for ($position = 0; $position -lt 4; $position++) {
        $itemNumber = $firstIndex + $position + 1
        $destination = Join-Path $itemDirectory ("{0:D2}.png" -f $itemNumber)
        if ((Test-Path -LiteralPath $destination) -and -not $Force) {
            throw "L'actif '$destination' existe déjà."
        }

        $x = ($position % 2) * $cellWidth
        $y = [math]::Floor($position / 2) * $cellHeight
        $rectangle = [System.Drawing.Rectangle]::new($x, $y, $cellWidth, $cellHeight)
        $crop = $bitmap.Clone($rectangle, $bitmap.PixelFormat)
        try {
            $crop.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $crop.Dispose()
        }
        $paths += $destination
    }
}
finally {
    $bitmap.Dispose()
}

& "$PSScriptRoot/prepare-coloring-assets.ps1" -InputPath $paths

$titles = @($catalogue.items[(($Page - 1) * 4)..(($Page * 4) - 1)])
$contactPath = Join-Path $contactDirectory ("page-{0:D2}.png" -f $Page)
& "$PSScriptRoot/build-contact-sheet.ps1" `
    -InputPath $paths `
    -Title $titles `
    -OutputPath $contactPath `
    -Heading ("{0} - page {1}" -f $catalogue.title, $Page)

node "$PSScriptRoot/build-manifest.mjs"
if ($LASTEXITCODE -ne 0) {
    throw "La reconstruction du manifeste a échoué."
}

Write-Output "Lot traité : $CatalogueId page $Page"
Write-Output "Actifs : $($paths -join ', ')"
Write-Output "Preuve : $contactPath"
