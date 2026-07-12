# ==========================================================================
#  Instalador do Corte - instala tudo e roda o backend NO SEU PC.
#  Instala Node, yt-dlp e ffmpeg (via winget), baixa o app, sobe o servidor
#  local (porta 4000) e registra para iniciar junto com o Windows.
# ==========================================================================
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Write-Host "==== Instalador do Corte ====" -ForegroundColor Cyan

function Refresh-Path {
  $m = [Environment]::GetEnvironmentVariable('Path','Machine')
  $u = [Environment]::GetEnvironmentVariable('Path','User')
  $env:Path = "$m;$u"
}
function Ensure($cmd, $wingetId) {
  Refresh-Path
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { Write-Host "OK   $cmd" -ForegroundColor Green; return }
  Write-Host "Instalando $wingetId ..." -ForegroundColor Yellow
  winget install -e --id $wingetId --accept-source-agreements --accept-package-agreements --silent
  Refresh-Path
}

# 1) dependencias
Ensure node   'OpenJS.NodeJS.LTS'
Ensure yt-dlp 'yt-dlp.yt-dlp'
Ensure ffmpeg 'Gyan.FFmpeg'

# 2) baixa o app
$dir = Join-Path $env:LOCALAPPDATA 'Corte'
New-Item -ItemType Directory -Force $dir | Out-Null
$zip = Join-Path $env:TEMP 'corte-main.zip'
Write-Host "Baixando o Corte..." -ForegroundColor Yellow
Invoke-WebRequest 'https://github.com/Changzaoo/corte/archive/refs/heads/main.zip' -OutFile $zip
Expand-Archive $zip -DestinationPath $dir -Force
$app = Join-Path $dir 'corte-main'

# 3) .env local (modo local, sem segredos)
$envServer = Join-Path $app 'apps\server\.env'
"PORT=4000`r`nNODE_ENV=production`r`nLOCAL_MODE=1`r`nCORS_ORIGINS=*" | Set-Content -Path $envServer -Encoding ascii

# 4) dependencias npm + build
Write-Host "Instalando dependencias (pode demorar alguns minutos)..." -ForegroundColor Yellow
Push-Location $app
Refresh-Path
& npm install
& npm run build:server
Pop-Location

# 5) launcher escondido + autostart no login
$node = (Get-Command node).Source
$serverJs = Join-Path $app 'apps\server\dist\src\index.js'
$vbs = Join-Path $dir 'corte-run.vbs'
$q = [char]34            # aspas
$dq = "$q$q"            # "" = aspas literal dentro de string VBS
$runArg = "$dq$node$dq $dq$serverJs$dq"
@(
  'Set sh = CreateObject("WScript.Shell")'
  "sh.CurrentDirectory = $q$app$q"
  "sh.Run $q$runArg$q, 0, False"
) | Set-Content -Path $vbs -Encoding ascii

$startup = [Environment]::GetFolderPath('Startup')
Copy-Item $vbs (Join-Path $startup 'Corte.vbs') -Force

# 6) inicia agora
& wscript.exe $vbs

Write-Host "`nPRONTO! O Corte esta rodando no seu PC (porta 4000)." -ForegroundColor Green
Write-Host "Volte no site e clique em 'Ja instalei - testar'." -ForegroundColor Cyan
Start-Sleep 5
