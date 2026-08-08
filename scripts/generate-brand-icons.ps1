param(
  [string]$RootPath = (Join-Path $PSScriptRoot "..")
)

Add-Type -AssemblyName System.Drawing

function New-BrandBitmap([int]$Size) {
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#006E66"))

  $scale = $Size / 72.0
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 3.6)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $matrix = [System.Drawing.Drawing2D.Matrix]::new()
  $matrix.Translate(12 * $scale, 20 * $scale)
  $matrix.Scale($scale, $scale)
  $graphics.Transform = $matrix

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.StartFigure()
  $path.AddLine(3, 6, 15, 6)
  $path.AddBezier(15, 6, 20, 6, 22, 12, 17, 14)
  $path.AddLine(17, 14, 6, 14)
  $path.StartFigure()
  $path.AddLines([System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(4, 17),
    [System.Drawing.PointF]::new(14, 27),
    [System.Drawing.PointF]::new(24, 12),
    [System.Drawing.PointF]::new(32, 22)
  ))
  $path.StartFigure()
  $path.AddLines([System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(22, 7),
    [System.Drawing.PointF]::new(44, 7),
    [System.Drawing.PointF]::new(31, 27),
    [System.Drawing.PointF]::new(20, 16)
  ))
  $graphics.DrawPath($pen, $path)

  $path.Dispose()
  $matrix.Dispose()
  $pen.Dispose()
  $graphics.Dispose()
  return $bitmap
}

$applePath = Join-Path $RootPath "apple-touch-icon.png"
$apple = New-BrandBitmap 180
$apple.Save($applePath, [System.Drawing.Imaging.ImageFormat]::Png)
$apple.Dispose()

$favicon = New-BrandBitmap 64
$stream = [System.IO.MemoryStream]::new()
$favicon.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
$favicon.Dispose()
$png = $stream.ToArray()
$stream.Dispose()

$icoPath = Join-Path $RootPath "favicon.ico"
$file = [System.IO.File]::Create($icoPath)
$writer = [System.IO.BinaryWriter]::new($file)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]64)
$writer.Write([byte]64)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$png.Length)
$writer.Write([uint32]22)
$writer.Write($png)
$writer.Dispose()
$file.Dispose()
