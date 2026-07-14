# ==========================================================================
#  install.ps1 - executado pelo instalador do Corte, em etapas.
#  Uso: install.ps1 -AppDir "<pasta>" -Step deps|build|start
# ==========================================================================
param(
  [Parameter(Mandatory=$true)][string]$AppDir,
  [Parameter(Mandatory=$true)][ValidateSet('deps','build','start')][string]$Step
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Refresh-Path {
  $m = [Environment]::GetEnvironmentVariable('Path','Machine')
  $u = [Environment]::GetEnvironmentVariable('Path','User')
  $env:Path = "$m;$u"
}
function Ensure($cmd, $wingetId) {
  Refresh-Path
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { return }
  winget install -e --id $wingetId --accept-source-agreements --accept-package-agreements --silent
  Refresh-Path
}
function Detect-Browser {
  if (Test-Path "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe") { return 'brave' }
  if (Test-Path "$env:ProgramFiles\Google\Chrome\Application\chrome.exe") { return 'chrome' }
  if (Test-Path "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") { return 'chrome' }
  if (Test-Path "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") { return 'edge' }
  return ''
}

switch ($Step) {
  'deps' {
    Ensure node   'OpenJS.NodeJS.LTS'
    Ensure yt-dlp 'yt-dlp.yt-dlp'
    Ensure ffmpeg 'Gyan.FFmpeg'
    # gallery-dl (Instagram) — binario standalone (com retry); fallback via pip
    $bin = Join-Path $AppDir 'apps\server\bin'
    New-Item -ItemType Directory -Force $bin | Out-Null
    $gdl = Join-Path $bin 'gallery-dl.exe'
    for ($i = 0; $i -lt 3 -and -not (Test-Path $gdl); $i++) {
      try { Invoke-WebRequest 'https://github.com/mikf/gallery-dl/releases/latest/download/gallery-dl.exe' -OutFile $gdl -UseBasicParsing -TimeoutSec 120 } catch { Start-Sleep 2 }
    }
    if (-not (Test-Path $gdl) -and (Get-Command python -ErrorAction SilentlyContinue)) {
      Write-Host "gallery-dl: instalando via pip..." -ForegroundColor Yellow
      python -m pip install -U gallery-dl | Out-Null
    }
  }
  'build' {
    Refresh-Path
    # .env local (modo local, sem segredos) + cookies do navegador p/ Instagram
    $browser = Detect-Browser
    $envLines = @('PORT=4000','NODE_ENV=production','LOCAL_MODE=1','CORS_ORIGINS=*')
    if ($browser) { $envLines += "YTDLP_COOKIES_FROM_BROWSER=$browser" }
    # se o gallery-dl.exe standalone nao veio, usa o do pip (Instagram)
    if (-not (Test-Path (Join-Path $AppDir 'apps\server\bin\gallery-dl.exe'))) {
      $gp = (python -c "import shutil;print(shutil.which('gallery-dl') or '')" 2>$null)
      if ($gp) { $envLines += "GALLERYDL_PATH=$($gp.Trim())" }
    }
    $envLines | Set-Content -Path (Join-Path $AppDir 'apps\server\.env') -Encoding ascii
    Push-Location $AppDir
    & npm install --no-audit --no-fund
    & npm run build:server
    Pop-Location
  }
  'start' {
    # garante que nenhum backend antigo continue segurando a porta 4000
    try {
      Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
        if ($_.CommandLine -and $_.CommandLine.ToLower().Contains($AppDir.ToLower())) {
          try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
        }
      }
      Start-Sleep -Seconds 1
    } catch {}
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { Refresh-Path; $node = (Get-Command node).Source }
    $serverJs = Join-Path $AppDir 'apps\server\dist\src\index.js'
    $vbs = Join-Path $AppDir 'corte-run.vbs'
    $q = [char]34; $dq = "$q$q"
    $runArg = "$dq$node$dq $dq$serverJs$dq"
    @(
      'Set sh = CreateObject("WScript.Shell")'
      "sh.CurrentDirectory = $q$AppDir$q"
      "sh.Run $q$runArg$q, 0, False"
    ) | Set-Content -Path $vbs -Encoding ascii
    # autostart no login do Windows
    $startup = [Environment]::GetFolderPath('Startup')
    Copy-Item $vbs (Join-Path $startup 'Corte.vbs') -Force
    # inicia agora
    & wscript.exe $vbs
  }
}
