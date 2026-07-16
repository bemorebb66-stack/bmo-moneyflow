param(
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\og-bvt-money-flow.png")
)

Add-Type -AssemblyName System.Drawing

function New-ColorBrush([string]$Hex) {
  return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($Hex))
}

function New-RoundedPath([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Fill-RoundedRect($Graphics, $Brush, [float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius) {
  $path = New-RoundedPath $X $Y $Width $Height $Radius
  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
}

$width = 1200
$height = 630
$bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#F7F9FD"))

$brand = New-ColorBrush "#2F6BFF"
$ink = New-ColorBrush "#0F1F36"
$muted = New-ColorBrush "#5D6B7D"
$white = New-ColorBrush "#FFFFFF"
$softBlue = New-ColorBrush "#EAF1FF"
$border = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#D9E2EF"), 2)
$gridPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#DCE5F1"), 1)
$gridPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
$bluePen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#2F6BFF"), 5)
$tealPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#00A6A6"), 5)
$greenPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#00A85A"), 5)
$iconPen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 4)
$iconPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$iconPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$iconPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

$fontBrand = [System.Drawing.Font]::new("Segoe UI", 21, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fontEyebrow = [System.Drawing.Font]::new("Segoe UI", 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fontTitle = [System.Drawing.Font]::new("Malgun Gothic", 48, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fontTitleLarge = [System.Drawing.Font]::new("Malgun Gothic", 62, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fontSubtitle = [System.Drawing.Font]::new("Malgun Gothic", 23, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fontPill = [System.Drawing.Font]::new("Malgun Gothic", 17, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fontSmall = [System.Drawing.Font]::new("Malgun Gothic", 16, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fontChart = [System.Drawing.Font]::new("Malgun Gothic", 21, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

$graphics.FillRectangle($brand, 0, 0, $width, 10)

Fill-RoundedRect $graphics $brand 72 58 54 54 12
$graphics.DrawLines($iconPen, [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(86, 96),
  [System.Drawing.PointF]::new(97, 84),
  [System.Drawing.PointF]::new(105, 91),
  [System.Drawing.PointF]::new(115, 76)
))
$graphics.DrawLine($iconPen, 106, 76, 115, 76)
$graphics.DrawLine($iconPen, 115, 76, 115, 85)
$graphics.DrawString("BVT MONEY FLOW", $fontBrand, $ink, 143, 68)
$graphics.DrawString("US MARKET DATA", $fontEyebrow, $brand, 143, 94)

$graphics.DrawString("미국 주식 거래대금으로 보는", $fontTitle, $ink, 72, 163)
$graphics.DrawString("오늘의 시장 흐름", $fontTitleLarge, $ink, 67, 225)
$graphics.DrawString("섹터 · 산업 · 종목별 관심 이동을 30초 안에 확인하세요.", $fontSubtitle, $muted, 72, 318)

$pillLabels = @("시장 흐름", "종목 스캐너", "내부자 거래", "IPO 락업")
$pillWidths = @(108, 132, 126, 105)
$pillX = 72
for ($i = 0; $i -lt $pillLabels.Count; $i++) {
  Fill-RoundedRect $graphics $softBlue $pillX 380 $pillWidths[$i] 42 21
  $labelSize = $graphics.MeasureString($pillLabels[$i], $fontPill)
  $graphics.DrawString($pillLabels[$i], $fontPill, $brand, $pillX + (($pillWidths[$i] - $labelSize.Width) / 2), 389)
  $pillX += $pillWidths[$i] + 10
}

$panelPath = New-RoundedPath 725 72 403 410 18
$graphics.FillPath($white, $panelPath)
$graphics.DrawPath($border, $panelPath)
$panelPath.Dispose()
$graphics.DrawString("GROUP COMPARISON", $fontEyebrow, $brand, 758, 105)
$graphics.DrawString("거래대금 상대 흐름", $fontChart, $ink, 758, 137)

for ($i = 0; $i -lt 4; $i++) {
  $y = 210 + ($i * 58)
  $graphics.DrawLine($gridPen, 758, $y, 1094, $y)
}

$graphics.DrawBezier($bluePen, 758, 334, 825, 318, 870, 196, 928, 238)
$graphics.DrawBezier($bluePen, 928, 238, 974, 268, 1015, 165, 1094, 188)
$graphics.DrawBezier($tealPen, 758, 306, 820, 345, 875, 273, 928, 303)
$graphics.DrawBezier($tealPen, 928, 303, 995, 342, 1030, 246, 1094, 278)
$graphics.DrawBezier($greenPen, 758, 358, 820, 310, 866, 365, 928, 326)
$graphics.DrawBezier($greenPen, 928, 326, 980, 292, 1035, 356, 1094, 321)

$graphics.FillEllipse($brand, 1088, 182, 12, 12)
$graphics.FillEllipse((New-ColorBrush "#00A6A6"), 1088, 272, 12, 12)
$graphics.FillEllipse((New-ColorBrush "#00A85A"), 1088, 315, 12, 12)

$graphics.DrawString("장 마감 기준 · 매일 자동 갱신", $fontSmall, $muted, 72, 523)
$graphics.DrawString("bvtmoneyflow.xyz", $fontBrand, $brand, 72, 554)
$graphics.DrawString("거래대금 · 내부자 거래 · IPO 락업", $fontSmall, $muted, 807, 560)

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}
$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$fontBrand, $fontEyebrow, $fontTitle, $fontTitleLarge, $fontSubtitle, $fontPill, $fontSmall, $fontChart | ForEach-Object { $_.Dispose() }
$brand, $ink, $muted, $white, $softBlue | ForEach-Object { $_.Dispose() }
$border, $gridPen, $bluePen, $tealPen, $greenPen, $iconPen | ForEach-Object { $_.Dispose() }
$graphics.Dispose()
$bitmap.Dispose()
