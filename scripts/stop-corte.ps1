# Para o Corte (encerra o processo dev iniciado pelo start-corte).
$pidFile = Join-Path $env:TEMP "corte-dev.pid"
if (Test-Path $pidFile) {
  $procId = (Get-Content $pidFile | Select-Object -First 1).Trim()
  if ($procId) {
    taskkill /PID $procId /T /F 2>$null | Out-Null
    Write-Host "Corte parado (PID $procId)." -ForegroundColor Green
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
} else {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'corte|concurrently|vite|tsx' } |
    ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>$null | Out-Null }
  Write-Host "Sem PID salvo - tentei encerrar os node do projeto." -ForegroundColor Yellow
}
