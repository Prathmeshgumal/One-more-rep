# Builds every launcher icon from assets/logo.png.
#
#   pwsh -File scripts/build-icons.ps1
#
# Windows-only, because it uses System.Drawing rather than adding an image
# dependency to a project that needs one for exactly this and nothing else.
# The source lives in the repo, so a regenerated icon is always the same icon.
#
# Three things come out of it:
#
#   ic_launcher.png            the square legacy icon, every density
#   ic_launcher_round.png      the same, circularly masked, for round launchers
#   ic_launcher_foreground.png the mark alone on transparency, for the adaptive
#                              icon Android 8+ actually uses
#
# The adaptive foreground is the logo lifted off its background by brightness:
# the artwork is white on near-black, so anything bright is the mark and
# anything dark is backdrop. It is scaled into the middle 60% because Android
# masks an adaptive icon to whatever shape the launcher likes, and anything
# outside that safe zone can be cropped away.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'assets\logo.png'
$res = Join-Path $root 'android\app\src\main\res'

if (-not (Test-Path $source)) { throw "No logo at $source" }

# Legacy launcher sizes, and the adaptive foreground which is 108dp where the
# legacy icon is 48dp -- so 2.25x each.
$DENSITIES = @(
  @{ name = 'mdpi';    legacy = 48;  adaptive = 108 },
  @{ name = 'hdpi';    legacy = 72;  adaptive = 162 },
  @{ name = 'xhdpi';   legacy = 96;  adaptive = 216 },
  @{ name = 'xxhdpi';  legacy = 144; adaptive = 324 },
  @{ name = 'xxxhdpi'; legacy = 192; adaptive = 432 }
)

$original = [System.Drawing.Image]::FromFile($source)

# The artwork need not be square -- the one this was built for is 300x354.
# Padded rather than cropped, because cropping a logo to fit a box is how a
# wordmark loses its last letter. The padding colour is sampled from the
# corners rather than assumed, so it disappears into the artwork's own ground.
$side = [Math]::Max($original.Width, $original.Height)
$logo = New-Object System.Drawing.Bitmap($side, $side)
$lg = [System.Drawing.Graphics]::FromImage($logo)
$probe = New-Object System.Drawing.Bitmap($original)
$r = 0; $g2 = 0; $b2 = 0
foreach ($pt in @(@(3, 3), @(($probe.Width - 4), 3), @(3, ($probe.Height - 4)),
                  @(($probe.Width - 4), ($probe.Height - 4)))) {
  $c = $probe.GetPixel($pt[0], $pt[1])
  $r += $c.R; $g2 += $c.G; $b2 += $c.B
}
$ground = [System.Drawing.Color]::FromArgb([int]($r / 4), [int]($g2 / 4), [int]($b2 / 4))
"padding ground: #{0:X2}{1:X2}{2:X2}" -f $ground.R, $ground.G, $ground.B
$probe.Dispose()
$lg.Clear($ground)
$lg.InterpolationMode = 'HighQualityBicubic'
$lg.DrawImage($original, [int](($side - $original.Width) / 2),
                         [int](($side - $original.Height) / 2),
                         $original.Width, $original.Height)
$lg.Dispose()
$original.Dispose()

function Save-Square([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($logo, 0, 0, $size, $size)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function Save-Round([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'
  $path2 = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path2.AddEllipse(0, 0, $size, $size)
  $g.SetClip($path2)
  $g.DrawImage($logo, 0, 0, $size, $size)
  $path2.Dispose()
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# The mark on transparency, scaled into the adaptive safe zone.
function Save-Foreground([int]$size, [string]$path) {
  $inner = [int]($size * 0.60)
  $offset = [int](($size - $inner) / 2)

  # Redraw the logo small, then keep only what is bright.
  $small = New-Object System.Drawing.Bitmap($inner, $inner)
  $sg = [System.Drawing.Graphics]::FromImage($small)
  $sg.InterpolationMode = 'HighQualityBicubic'
  $sg.SmoothingMode = 'AntiAlias'
  $sg.PixelOffsetMode = 'HighQuality'
  $sg.DrawImage($logo, 0, 0, $inner, $inner)
  $sg.Dispose()

  $out = New-Object System.Drawing.Bitmap($size, $size)
  for ($y = 0; $y -lt $inner; $y++) {
    for ($x = 0; $x -lt $inner; $x++) {
      $p = $small.GetPixel($x, $y)
      # Perceived brightness. The backdrop sits near 0x25; the artwork is white.
      $b = (0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B)
      if ($b -gt 60) {
        # Ramp the alpha rather than thresholding it, so edges stay smooth
        # instead of turning into stairs at 48px.
        $a = [Math]::Min(255, [int](($b - 60) * 255 / 150))
        $out.SetPixel($x + $offset, $y + $offset,
          [System.Drawing.Color]::FromArgb($a, 255, 255, 255))
      }
    }
  }
  $small.Dispose()
  $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
}

foreach ($d in $DENSITIES) {
  $mipmap = Join-Path $res "mipmap-$($d.name)"
  $drawable = Join-Path $res "drawable-$($d.name)"
  New-Item -ItemType Directory -Force -Path $mipmap, $drawable | Out-Null

  Save-Square $d.legacy (Join-Path $mipmap 'ic_launcher.png')
  Save-Round  $d.legacy (Join-Path $mipmap 'ic_launcher_round.png')
  Save-Foreground $d.adaptive (Join-Path $drawable 'ic_launcher_foreground.png')
  "{0,-8} legacy {1}px, adaptive {2}px" -f $d.name, $d.legacy, $d.adaptive
}

$logo.Dispose()
"done — remember values/colors.xml holds the adaptive background separately"
