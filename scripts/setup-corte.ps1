# ==========================================================================
#  Corte - setup local (roda o backend/render NO SEU PC)
#  Instala tudo que a aplicacao precisa: yt-dlp, ffmpeg e dependencias npm.
#  Uso:  botao direito > "Executar com PowerShell"  (ou)  .\scripts\setup-corte.ps1
# ==========================================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Write-Host "== Corte setup ==  ($root)" -ForegroundColor Cyan

function Have($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

# 1) Node / npm
if (-not (Have node)) {
  Write-Host "Node.js nao encontrado - instalando via winget..." -ForegroundColor Yellow
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
}
Write-Host ("Node: " + (node --version)) -ForegroundColor Green

# 2) yt-dlp (download de videos)
$ytdlp = $null
if (Have python) {
  Write-Host "Instalando/atualizando yt-dlp via pip..." -ForegroundColor Yellow
  python -m pip install -U yt-dlp | Out-Null
  $ytdlp = (python -c "import shutil;print(shutil.which('yt-dlp') or '')").Trim()
  if (-not $ytdlp) {
    $cand = Join-Path (Split-Path (python -c "import sys;print(sys.executable)")) "Scripts\yt-dlp.exe"
    if (Test-Path $cand) { $ytdlp = $cand }
  }
} elseif (Have winget) {
  Write-Host "Instalando yt-dlp via winget..." -ForegroundColor Yellow
  winget install -e --id yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements
  $ytdlp = (Get-Command yt-dlp -ErrorAction SilentlyContinue).Source
}
if ($ytdlp) { Write-Host ("yt-dlp: " + $ytdlp) -ForegroundColor Green }
else { Write-Host "AVISO: nao consegui localizar o yt-dlp automaticamente." -ForegroundColor Red }

# 3) ffmpeg (renderizacao)
$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) {
  Write-Host "Instalando ffmpeg via winget..." -ForegroundColor Yellow
  winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
  $ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
}
if ($ffmpeg) { Write-Host ("ffmpeg: " + $ffmpeg) -ForegroundColor Green }
else { Write-Host "ffmpeg: estara no PATH apos reiniciar o terminal" -ForegroundColor Green }

# 4) dependencias npm
Write-Host "Instalando dependencias npm (pode demorar)..." -ForegroundColor Yellow
Push-Location $root
npm install
Pop-Location

# 5) .env do servidor: grava YTDLP_PATH se descoberto
$envPath = Join-Path $root "apps\server\.env"
if ((Test-Path $envPath) -and $ytdlp) {
  $lines = Get-Content $envPath
  if (-not ($lines -match '^\s*YTDLP_PATH=')) {
    Add-Content $envPath "`nYTDLP_PATH=$ytdlp"
    Write-Host "YTDLP_PATH gravado no .env" -ForegroundColor Green
  }
}

Write-Host "`nOK! Setup concluido. Para iniciar:  .\scripts\start-corte.ps1" -ForegroundColor Cyan
Write-Host "Instagram/TikTok logados: veja YTDLP_COOKIES no apps\server\.env" -ForegroundColor DarkGray
