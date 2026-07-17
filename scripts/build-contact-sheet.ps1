param(
    [Parameter(Mandatory = $true)]
    [string[]]$InputPath,

    [Parameter(Mandatory = $true)]
    [string[]]$Title,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [string]$Heading = "Contrôle visuel"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($InputPath.Count -ne 4 -or $Title.Count -ne 4) {
    throw "La planche-contact d'une page exige exactement 4 images et 4 titres."
}

Add-Type -AssemblyName System.Drawing

$canvasWidth = 1600
$canvasHeight = 1740
$margin = 50
$gutter = 36
$headingHeight = 90
$captionHeight = 70
$cellWidth = [int](($canvasWidth - (2 * $margin) - $gutter) / 2)
$cellHeight = [int](($canvasHeight - $headingHeight - (2 * $margin) - $gutter) / 2)
$imageHeight = $cellHeight - $captionHeight

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

$canvas = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$headingFont = New-Object System.Drawing.Font("Arial", 24, [System.Drawing.FontStyle]::Bold)
$captionFont = New-Object System.Drawing.Font("Arial", 18, [System.Drawing.FontStyle]::Bold)
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(215, 215, 215), 2)

try {
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawString($Heading, $headingFont, [System.Drawing.Brushes]::Black, $margin, 28)

    for ($index = 0; $index -lt 4; $index++) {
        [int]$column = $index % 2
        [int]$row = [math]::Floor($index / 2)
        [int]$x = $margin + ($column * ($cellWidth + $gutter))
        [int]$y = $headingHeight + $margin + ($row * ($cellHeight + $gutter))
        $cellRectangle = [System.Drawing.Rectangle]::new($x, $y, $cellWidth, $cellHeight)
        $graphics.DrawRectangle($borderPen, $cellRectangle)

        $image = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $InputPath[$index]).Path)
        try {
            $scale = [math]::Min($cellWidth / $image.Width, $imageHeight / $image.Height)
            $drawWidth = [int]($image.Width * $scale)
            $drawHeight = [int]($image.Height * $scale)
            $drawX = $x + [int](($cellWidth - $drawWidth) / 2)
            $drawY = $y + [int](($imageHeight - $drawHeight) / 2)
            $graphics.DrawImage($image, $drawX, $drawY, $drawWidth, $drawHeight)
        }
        finally {
            $image.Dispose()
        }

        $captionRectangle = [System.Drawing.RectangleF]::new(
            [single]($x + 12),
            [single]($y + $imageHeight + 8),
            [single]($cellWidth - 24),
            [single]($captionHeight - 12)
        )
        $format = New-Object System.Drawing.StringFormat
        try {
            $format.Alignment = [System.Drawing.StringAlignment]::Center
            $format.LineAlignment = [System.Drawing.StringAlignment]::Center
            $graphics.DrawString($Title[$index], $captionFont, [System.Drawing.Brushes]::Black, $captionRectangle, $format)
        }
        finally {
            $format.Dispose()
        }
    }

    $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "Planche-contact : $OutputPath"
}
finally {
    $borderPen.Dispose()
    $captionFont.Dispose()
    $headingFont.Dispose()
    $graphics.Dispose()
    $canvas.Dispose()
}
