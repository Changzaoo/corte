# ==========================================================================
#  Corte - inicia o backend + web NO SEU PC e abre no navegador.
#  Cada corte roda 100% na sua maquina (download yt-dlp + render ffmpeg).
# ==========================================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Sobe server (4000) + web (5173/5174) em background.
$log = Join-Path $env:TEMP "corte-dev.log"
Write-Host "Iniciando Corte (log: $log)..." -ForegroundColor Cyan
$p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev" -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru
$p.Id | Out-File (Join-Path $env:TEMP "corte-dev.pid") -Encoding ascii

# Espera o Vite anunciar a porta e abre o navegador.
$deadline = (Get-Date).AddSeconds(90); $url = $null
while ((Get-Date) -lt $deadline -and -not $url) {
  Start-Sleep -Milliseconds 800
  if (Test-Path $log) {
    # tolera codigos de cor ANSI entre "localhost:" e a porta (ex.: localhost:<ESC>[1m5175)
    $m = Select-String -Path $log -Pattern 'localhost:[^0-9]*([0-9]{4,5})' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $url = "http://localhost:" + $m.Matches[0].Groups[1].Value + "/" }
  }
}
if ($url) { Write-Host "Corte no ar: $url" -ForegroundColor Green; Start-Process $url }
else { Write-Host "Nao detectei a porta a tempo - confira $log" -ForegroundColor Yellow }
Write-Host "Para parar:  .\scripts\stop-corte.ps1" -ForegroundColor DarkGray
