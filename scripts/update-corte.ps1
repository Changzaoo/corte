# ==========================================================================
#  update-corte.ps1 - atualiza o cortes.digital instalado no PC.
#  Baixa o codigo mais novo do GitHub (main), para o backend local, copia os
#  arquivos por cima (preservando .env, bin/ e dados), reinstala/rebuilda e
#  religa. Disparado pelo proprio backend (POST /api/system/update) ou manual.
#  Uso: update-corte.ps1 -AppDir "<pasta do app>" [-ServerPid <pid>]
#  ATENCAO: manter este arquivo 100% ASCII (PS 5.1 le sem BOM como ANSI).
# ==========================================================================
param(
  [Parameter(Mandatory=$true)][string]$AppDir,
  [int]$ServerPid = 0
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoZip = 'https://codeload.github.com/Changzaoo/corte/zip/refs/heads/main'
$ShaApi  = 'https://api.github.com/repos/Changzaoo/corte/commits?path=apps%2Fserver&per_page=1&sha=main'
$LogFile = Join-Path $AppDir 'update.log'

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Refresh-Path {
  $m = [Environment]::GetEnvironmentVariable('Path','Machine')
  $u = [Environment]::GetEnvironmentVariable('Path','User')
  $env:Path = "$m;$u"
}

$tmp = $null
try {
  Log "== atualizacao iniciada =="

  # 1) sha mais novo (para carimbar a versao). Falha da API nao impede o update.
  $sha = $null
  try {
    $commits = Invoke-RestMethod -Uri $ShaApi -TimeoutSec 30 -Headers @{ 'User-Agent' = 'cortes-digital-updater' }
    if ($commits -and $commits[0].sha) { $sha = $commits[0].sha }
  } catch { Log "aviso: nao consegui ler o sha da API do GitHub: $($_.Exception.Message)" }

  # 2) baixa e extrai o zip ANTES de parar o servidor (minimiza o tempo fora do ar)
  $tmp = Join-Path $env:TEMP ("corte-update-" + (Get-Date -Format 'yyyyMMddHHmmss'))
  New-Item -ItemType Directory -Force $tmp | Out-Null
  $zip = Join-Path $tmp 'main.zip'
  Log "baixando $RepoZip"
  Invoke-WebRequest -Uri $RepoZip -OutFile $zip -UseBasicParsing -TimeoutSec 300
  Log "extraindo"
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $src = Join-Path $tmp 'corte-main'
  if (-not (Test-Path (Join-Path $src 'package.json'))) { throw "zip extraido nao tem package.json em $src" }

  # 3) sinaliza o update ANTES de derrubar: o watchdog ve o update.lock e para
  #    de religar o backend enquanto trocamos os arquivos
  $lockFile = Join-Path $AppDir 'update.lock'
  'updating' | Set-Content -Path $lockFile -Encoding ascii

  # para o watchdog e o backend (o pid vem do proprio servidor que disparou o
  # update; por garantia, mata tambem qualquer node rodando o dist deste AppDir)
  try {
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | ForEach-Object {
      if ($_.CommandLine -and $_.CommandLine.ToLower().Contains('watchdog.ps1')) {
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Log "watchdog (pid $($_.ProcessId)) parado" } catch {}
      }
    }
  } catch { Log "aviso: varredura de watchdogs falhou: $($_.Exception.Message)" }
  if ($ServerPid -gt 0) {
    try { Stop-Process -Id $ServerPid -Force -ErrorAction Stop; Log "servidor (pid $ServerPid) parado" } catch { Log "pid $ServerPid ja estava parado" }
  }
  try {
    $needle = (Join-Path $AppDir 'apps\server\dist').ToLower()
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
      if ($_.CommandLine -and $_.CommandLine.ToLower().Contains($needle)) {
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Log "node extra (pid $($_.ProcessId)) parado" } catch {}
      }
    }
  } catch { Log "aviso: varredura de processos falhou: $($_.Exception.Message)" }
  Start-Sleep -Seconds 1

  # 4) copia por cima. Sem /PURGE: nada local e apagado - .env, apps\server\bin,
  #    .data, node_modules e dist ficam intactos (dist sera recriado no build).
  Log "copiando arquivos novos"
  robocopy $src $AppDir /E /NFL /NDL /NJH /NJS /XD node_modules .git | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy falhou (codigo $LASTEXITCODE)" }

  # 5) dependencias + build do servidor
  Refresh-Path
  Push-Location $AppDir
  try {
    Log "npm install"
    & npm install --no-audit --no-fund 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm install falhou (codigo $LASTEXITCODE)" }
    Log "build do servidor"
    & npm run build:server 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "build falhou (codigo $LASTEXITCODE)" }
  } finally { Pop-Location }

  # 6) carimba a versao instalada (o backend novo responde esse sha em /api/system/version)
  if ($sha) {
    $verFile = Join-Path $AppDir 'version.json'
    @{ sha = $sha; updatedAt = (Get-Date -Format o) } | ConvertTo-Json -Compress | Set-Content -Path $verFile -Encoding ascii
    Log "versao carimbada: $sha"
  }

  # 7) libera o watchdog e religa o backend (mesmo vbs do instalador / autostart)
  Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
  $vbs = Join-Path $AppDir 'corte-run.vbs'
  if (Test-Path $vbs) { & wscript.exe $vbs; Log "backend religado" }
  else { Log "aviso: corte-run.vbs nao encontrado - religue manualmente" }

  Log "== atualizacao concluida =="
} catch {
  Log "ERRO: $($_.Exception.Message)"
  # tenta religar mesmo apos falha, para nao deixar o usuario sem backend
  Remove-Item (Join-Path $AppDir 'update.lock') -Force -ErrorAction SilentlyContinue
  $vbs = Join-Path $AppDir 'corte-run.vbs'
  if (Test-Path $vbs) { try { & wscript.exe $vbs; Log "backend religado apos erro" } catch {} }
  exit 1
} finally {
  if ($tmp -and (Test-Path $tmp)) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}
