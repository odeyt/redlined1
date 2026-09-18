# Converts the marketing capture to an upload-ready MP4.
#
#   npm run capture:marketing:convert
#
# Separate from the capture on purpose: a missing ffmpeg must never fail a
# recording that already succeeded. When ffmpeg is absent this prints the exact
# command to run elsewhere and exits 0.

$ErrorActionPreference = 'Stop'
$in  = 'marketing-output\redlined1-first-workflow.webm'
$out = 'marketing-output\redlined1-first-workflow.mp4'
$args = @('-y', '-i', $in, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', $out)

if (-not (Test-Path -LiteralPath $in)) {
  Write-Output "No capture found at $in. Run: npm run capture:marketing"
  exit 1
}
if (-not (Get-Item -LiteralPath $in).Length) {
  Write-Output "$in is empty; the capture did not finish. Not converting."
  exit 1
}

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpeg) {
  Write-Output 'ffmpeg is not installed, so nothing was converted. Run this where it is available:'
  Write-Output ('  ffmpeg ' + ($args -join ' '))
  exit 0
}

& $ffmpeg.Source @args
if ($LASTEXITCODE -ne 0) { Write-Output "ffmpeg failed with exit code $LASTEXITCODE"; exit $LASTEXITCODE }

$ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
if ($ffprobe) {
  & $ffprobe.Source -v error -select_streams v:0 -show_entries stream=codec_name,width,height,pix_fmt -show_entries format=duration -of default=noprint_wrappers=1 $out
  $audio = & $ffprobe.Source -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 $out
  if ($audio) { Write-Output 'WARNING: output contains an audio stream' } else { Write-Output 'audio streams: none' }
} else {
  Write-Output 'ffprobe not found; dimensions, codec and duration not verified.'
}
Write-Output "Wrote $out ($((Get-Item -LiteralPath $out).Length) bytes)"
