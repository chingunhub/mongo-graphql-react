# Creates assets\forge.ico and a "Forge Academy" shortcut on the desktop.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force $assets | Out-Null
$icoPath = Join-Path $assets 'forge.ico'

# --- draw the icon (same mark as the app's favicon) and wrap the PNG in an .ico container
Add-Type -AssemblyName System.Drawing
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
$s = $size / 64.0
function Brush($hex) { New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex)) }
function RoundRect($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, $r * 2, $r * 2, 180, 90); $p.AddArc($x + $w - $r * 2, $y, $r * 2, $r * 2, 270, 90)
  $p.AddArc($x + $w - $r * 2, $y + $h - $r * 2, $r * 2, $r * 2, 0, 90); $p.AddArc($x, $y + $h - $r * 2, $r * 2, $r * 2, 90, 90)
  $p.CloseFigure(); return $p
}
$g.FillPath((Brush '#1b1410'), (RoundRect 0 0 $size $size (14 * $s)))
# anvil
$anvil = [System.Drawing.PointF[]]@(
  (New-Object System.Drawing.PointF (14 * $s), (38 * $s)), (New-Object System.Drawing.PointF (50 * $s), (38 * $s)),
  (New-Object System.Drawing.PointF (44 * $s), (46 * $s)), (New-Object System.Drawing.PointF (20 * $s), (46 * $s)))
$g.FillPolygon((Brush '#f97316'), $anvil)
$g.FillRectangle((Brush '#fb923c'), (20 * $s), (22 * $s), (24 * $s), (10 * $s))
$g.FillRectangle((Brush '#fdba74'), (28 * $s), (14 * $s), (8 * $s), (8 * $s))
# the three layers
$g.FillEllipse((Brush '#13aa52'), (15 * $s), (49 * $s), (6 * $s), (6 * $s))
$g.FillEllipse((Brush '#e535ab'), (29 * $s), (49 * $s), (6 * $s), (6 * $s))
$g.FillEllipse((Brush '#38bdf8'), (43 * $s), (49 * $s), (6 * $s), (6 * $s))
$g.Dispose()
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$bmp.Dispose()

$fs = [System.IO.File]::Create($icoPath)
$w = New-Object System.IO.BinaryWriter $fs
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)          # ICONDIR: reserved, type=icon, count=1
$w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0) # 256x256 (0 means 256), no palette
$w.Write([UInt16]1); $w.Write([UInt16]32)                                  # planes, bits per pixel
$w.Write([UInt32]$png.Length); $w.Write([UInt32]22)                       # size, offset
$w.Write($png)
$w.Close()

# --- the shortcut
$desktop = if ($env:FORGE_DESKTOP) { $env:FORGE_DESKTOP } else { [Environment]::GetFolderPath('Desktop') }
$lnkPath = Join-Path $desktop 'Forge Academy.lnk'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$lnk.Arguments = '"' + (Join-Path $root 'scripts\launch.vbs') + '"'
$lnk.WorkingDirectory = $root
$lnk.IconLocation = "$icoPath,0"
$lnk.Description = 'Forge Academy — Mongoose, GraphQL/Apollo and React, hands-on'
$lnk.Save()

Write-Output "Created $lnkPath"
