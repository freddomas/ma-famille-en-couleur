param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$catalogueData = Get-Content -Raw -Encoding UTF8 -LiteralPath "data/catalogues.json" | ConvertFrom-Json
$spriteByType = @{
    animal = "assets/coloring/animals-toddlers.png"
    vehicle = "assets/coloring/vehicles-toddlers.png"
    number = "assets/coloring/numbers-toddlers.png"
    shape = "assets/coloring/shapes-toddlers.png"
    fruit = "assets/coloring/fruits-toddlers.png"
    vegetable = "assets/coloring/vegetables-toddlers.png"
    home = "assets/coloring/home-toddlers.png"
    building = "assets/coloring/buildings-toddlers.png"
    nature = "assets/coloring/nature-toddlers.png"
    people = "assets/coloring/people-toddlers.png"
}

foreach ($catalogue in $catalogueData.catalogues) {
    if (-not $spriteByType.ContainsKey($catalogue.type)) {
        throw "Aucune planche GOLD MASTER pour le type '$($catalogue.type)'."
    }

    $sourcePath = (Resolve-Path -LiteralPath $spriteByType[$catalogue.type]).Path
    $outputDirectory = Join-Path "assets/coloring/items" $catalogue.id
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

    $source = [System.Drawing.Bitmap]::FromFile($sourcePath)
    try {
        if (($source.Width % 2) -ne 0 -or ($source.Height % 2) -ne 0) {
            throw "La planche '$sourcePath' n'a pas des dimensions paires."
        }

        $cellWidth = [int]($source.Width / 2)
        $cellHeight = [int]($source.Height / 2)

        for ($index = 0; $index -lt 4; $index++) {
            $destination = Join-Path $outputDirectory ("{0:D2}.png" -f ($index + 1))
            if ((Test-Path -LiteralPath $destination) -and -not $Force) {
                throw "Le fichier '$destination' existe déjà. Utilisez -Force uniquement pour reconstruire les extractions GOLD MASTER."
            }

            $x = ($index % 2) * $cellWidth
            $y = [math]::Floor($index / 2) * $cellHeight
            $rectangle = [System.Drawing.Rectangle]::new($x, $y, $cellWidth, $cellHeight)
            $crop = $source.Clone($rectangle, $source.PixelFormat)
            try {
                $crop.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
            }
            finally {
                $crop.Dispose()
            }

            Write-Output "Extrait : $destination"
        }
    }
    finally {
        $source.Dispose()
    }
}
