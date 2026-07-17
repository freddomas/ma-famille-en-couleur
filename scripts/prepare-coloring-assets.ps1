param(
    [Parameter(Mandatory = $true)]
    [string[]]$InputPath,

    [int]$WhiteThreshold = 245
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

if (-not ("ColoringAssetNormalizer" -as [type])) {
    $previousLib = $env:LIB
    try {
        $env:LIB = ""
        Add-Type -ReferencedAssemblies "System.Drawing" -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class ColoringAssetNormalizer
{
    public static void Normalize(string inputPath, int whiteThreshold)
    {
        string directory = Path.GetDirectoryName(inputPath);
        string temporaryPath = Path.Combine(directory, Path.GetFileNameWithoutExtension(inputPath) + ".normalized.png");

        if (File.Exists(temporaryPath))
        {
            File.Delete(temporaryPath);
        }

        using (var source = new Bitmap(inputPath))
        using (var output = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(output))
            {
                graphics.Clear(Color.White);
                graphics.DrawImageUnscaled(source, 0, 0);
            }

            var rectangle = new Rectangle(0, 0, output.Width, output.Height);
            var data = output.LockBits(rectangle, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            try
            {
                int byteCount = Math.Abs(data.Stride) * output.Height;
                var pixels = new byte[byteCount];
                Marshal.Copy(data.Scan0, pixels, 0, byteCount);

                for (int y = 0; y < output.Height; y++)
                {
                    int row = y * Math.Abs(data.Stride);
                    for (int x = 0; x < output.Width; x++)
                    {
                        int offset = row + (x * 4);
                        int blue = pixels[offset];
                        int green = pixels[offset + 1];
                        int red = pixels[offset + 2];
                        int gray = (int)Math.Round((red + green + blue) / 3.0);

                        if (gray >= whiteThreshold)
                        {
                            gray = 255;
                        }

                        byte value = (byte)Math.Max(0, Math.Min(255, gray));
                        pixels[offset] = value;
                        pixels[offset + 1] = value;
                        pixels[offset + 2] = value;
                        pixels[offset + 3] = 255;
                    }
                }

                Marshal.Copy(pixels, 0, data.Scan0, byteCount);
            }
            finally
            {
                output.UnlockBits(data);
            }

            output.Save(temporaryPath, ImageFormat.Png);
        }

        File.Delete(inputPath);
        File.Move(temporaryPath, inputPath);
    }
}
"@
    }
    finally {
        $env:LIB = $previousLib
    }
}

foreach ($path in $InputPath) {
    $resolved = (Resolve-Path -LiteralPath $path).Path
    [ColoringAssetNormalizer]::Normalize($resolved, $WhiteThreshold)
    Write-Output "Normalisé : $resolved"
}
