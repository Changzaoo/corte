# ==========================================================================
#  sign.ps1 - assina digitalmente o instalador do Corte.
#
#  Sem argumentos: cria/usa um certificado AUTOASSINADO "Corte" e o marca como
#  confiavel PARA ESTE USUARIO (some o "Editor desconhecido" nesta maquina).
#
#  Com um certificado real (recomendado para distribuir):
#     .\sign.ps1 -ExePath ..\apps\web\public\Corte-Setup.exe -PfxPath cert.pfx -PfxPassword "senha"
#  Aí NENHUMA maquina reclama (ideal: certificado EV ou Azure Trusted Signing).
# ==========================================================================
param(
  [string]$ExePath = "$PSScriptRoot\..\apps\web\public\Corte-Setup.exe",
  [string]$PfxPath = "",
  [string]$PfxPassword = ""
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ExePath)) { throw "Executavel nao encontrado: $ExePath" }

if ($PfxPath) {
  # ---- certificado real (comprado) ----
  $sec = if ($PfxPassword) { ConvertTo-SecureString $PfxPassword -AsPlainText -Force } else { $null }
  $cert = if ($sec) { Get-PfxCertificate -FilePath $PfxPath -Password $sec } else { Get-PfxCertificate -FilePath $PfxPath }
  Write-Host "Usando certificado do arquivo: $($cert.Subject)" -ForegroundColor Cyan
} else {
  # ---- autoassinado, confiavel apenas nesta maquina ----
  $subject = 'CN=Corte, O=Corte'
  $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $subject -and $_.HasPrivateKey } | Select-Object -First 1
  if (-not $cert) {
    Write-Host "Criando certificado autoassinado 'Corte'..." -ForegroundColor Yellow
    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $subject `
      -CertStoreLocation Cert:\CurrentUser\My -KeyExportPolicy Exportable `
      -KeyUsage DigitalSignature -FriendlyName 'Corte Code Signing' -NotAfter (Get-Date).AddYears(5)
  }
  # confia no certificado para o usuario atual (sem admin)
  $cer = Join-Path $env:TEMP 'corte-codesign.cer'
  Export-Certificate -Cert $cert -FilePath $cer | Out-Null
  Import-Certificate -FilePath $cer -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
  Import-Certificate -FilePath $cer -CertStoreLocation Cert:\CurrentUser\TrustedPublisher | Out-Null
  Remove-Item $cer -ErrorAction SilentlyContinue
  Write-Host "Certificado 'Corte' confiavel para este usuario." -ForegroundColor Green
}

# assina com carimbo de tempo (a assinatura continua valida apos o cert expirar)
$ts = 'http://timestamp.digicert.com'
$sig = Set-AuthenticodeSignature -FilePath $ExePath -Certificate $cert -TimestampServer $ts -HashAlgorithm SHA256
Write-Host ("Assinatura: " + $sig.Status + " | " + $sig.SignerCertificate.Subject) -ForegroundColor Cyan
if ($sig.Status -ne 'Valid') { throw "Falha ao assinar: $($sig.StatusMessage)" }
Write-Host "OK - $ExePath assinado." -ForegroundColor Green
