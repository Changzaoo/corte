# ==========================================================================
#  watchdog.ps1 - mantem o backend do cortes.digital VIVO no PC do usuario.
#  Roda o node e, se ele cair (crash, falta de memoria, etc.), religa sozinho
#  com backoff. Para de religar durante uma atualizacao (update.lock) e nunca
#  roda duplicado (mutex global).
#  Uso: watchdog.ps1 -AppDir "<pasta do app>"
#  ATENCAO: manter este arquivo 100% ASCII (PS 5.1 le sem BOM como ANSI).
# ==========================================================================
param([Parameter(Mandatory=$true)][string]$AppDir)
$ErrorActionPreference = 'Continue'

$LogFile = Join-Path $AppDir 'watchdog.log'
$Lock    = Join-Path $AppDir 'update.lock'

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $LogFile -Value $line -Encoding utf8
  # log com teto de ~200KB para nao crescer para sempre
  try {
    if ((Get-Item $LogFile).Length -gt 200KB) {
      Get-Content $LogFile -Tail 500 | Set-Content "$LogFile.tmp" -Encoding utf8
      Move-Item "$LogFile.tmp" $LogFile -Force
    }
  } catch {}
}

# nunca dois watchdogs ao mesmo tempo (instalar/atualizar/logar de novo)
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Global\cortes-digital-watchdog', [ref]$created)
if (-not $created) { exit 0 }

function Find-Node {
  $m = [Environment]::GetEnvironmentVariable('Path','Machine')
  $u = [Environment]::GetEnvironmentVariable('Path','User')
  $env:Path = "$m;$u"
  $c = Get-Command node -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return $null
}

$serverJs = Join-Path $AppDir 'apps\server\dist\src\index.js'
$Req   = Join-Path $AppDir 'update.req'      # pedido de update gravado pelo backend
$Alive = Join-Path $AppDir 'watchdog.alive'  # heartbeat (o backend sabe que temos watchdog)
$fails = 0
Log "== watchdog iniciado =="

# O update e disparado POR ARQUIVO (update.req): o backend nao pode spawnar
# powershell direto (o Defender bloqueia node->powershell oculto como
# comportamento suspeito). powershell->powershell nao tem esse problema.
function Start-UpdateIfRequested {
  if (-not (Test-Path $Req)) { return $false }
  Remove-Item $Req -Force -ErrorAction SilentlyContinue
  $upd = Join-Path $AppDir 'scripts\update-corte.ps1'
  if (-not (Test-Path $upd)) { Log 'update.req ignorado: updater nao encontrado'; return $false }
  Log 'update.req detectado - iniciando a atualizacao'
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList (
    '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$upd`"",'-AppDir',"`"$AppDir`"")
  return $true
}

while ($true) {
  if (Test-Path $Lock) { Log 'update.lock presente - encerrando (o updater religa)'; break }
  $node = Find-Node
  if (-not $node) { Log 'node nao encontrado no PATH - tentando de novo em 30s'; Start-Sleep -Seconds 30; continue }
  if (-not (Test-Path $serverJs)) { Log "dist nao existe ($serverJs) - tentando em 30s"; Start-Sleep -Seconds 30; continue }

  $started = Get-Date
  $p = $null
  try {
    $p = Start-Process -FilePath $node -ArgumentList "`"$serverJs`"" -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru
    Log "backend iniciado (pid $($p.Id))"
    # espera em fatias de 10s: heartbeat + checagem do pedido de update
    while (-not $p.HasExited) {
      Get-Date -Format o | Set-Content -Path $Alive -Encoding ascii
      if (Start-UpdateIfRequested) {
        # espera o updater assumir (criar o lock) antes de sair do loop -
        # sem isso o watchdog religaria um segundo node no meio do update
        for ($i = 0; $i -lt 30 -and -not (Test-Path $Lock); $i++) { Start-Sleep -Seconds 1 }
        if (Test-Path $Lock) { break }
        Log 'updater nao assumiu em 30s - seguindo normalmente'
      }
      Wait-Process -Id $p.Id -Timeout 10 -ErrorAction SilentlyContinue
    }
  } catch {
    Log "falha ao iniciar o backend: $($_.Exception.Message)"
  }

  if (Test-Path $Lock) { Log 'update.lock presente - encerrando (o updater religa)'; break }
  if ($p -and $p.HasExited) {
    # backoff: viveu mais de 5 min = saude ok, zera; senao cresce ate 60s
    if (((Get-Date) - $started).TotalMinutes -gt 5) { $fails = 0 } else { $fails++ }
    $delay = [Math]::Min(60, 3 * [Math]::Max(1, $fails))
    Log "backend saiu - religando em ${delay}s (falhas seguidas: $fails)"
    Start-Sleep -Seconds $delay
  }
}
Remove-Item $Alive -Force -ErrorAction SilentlyContinue

$mutex.ReleaseMutex() | Out-Null
Log "== watchdog encerrado =="
