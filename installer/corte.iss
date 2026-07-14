; ============================================================================
;  Corte - Instalador (Inno Setup)
;  Janela com boas-vindas, termos de uso e barra de progresso por etapa.
;  Instala Node/yt-dlp/ffmpeg, prepara o app e sobe o backend local.
; ============================================================================
#define AppName "cortes.digital"
#define AppVer "1.0.0"

[Setup]
AppId={{9E5C8B21-CORTE-4F2A-9A11-C0RTE0000001}
AppName={#AppName}
AppVersion={#AppVer}
AppPublisher=cortes.digital
DefaultDirName={localappdata}\cortes.digital
DisableProgramGroupPage=yes
DisableDirPage=yes
LicenseFile=terms.txt
OutputDir=.
OutputBaseFilename=cortes-digital-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; visual todo preto (cor de fundo do icone) com a logo azul
SetupIconFile=app.ico
WizardImageFile=wizard.bmp
WizardSmallImageFile=wizard-small.bmp
WizardImageStretch=yes
WizardImageAlphaFormat=none
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\apps\web\public\favicon.ico
VersionInfoVersion={#AppVer}
VersionInfoCompany=cortes.digital
VersionInfoDescription=Instalador do cortes.digital
VersionInfoProductName={#AppName}

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
brazilianportuguese.WelcomeLabel2=Este assistente vai instalar o [name] no seu computador.%n%nO cortes.digital baixa e edita seus videos localmente, na sua propria maquina. Vamos instalar tudo que ele precisa (Node.js, yt-dlp e ffmpeg) e deixar pronto para uso.

[Files]
; App (repo) sem node_modules, git, builds, dados e segredos (.env)
Source: "..\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion; \
  Excludes: "*\node_modules\*,node_modules\*,*\.git\*,.git\*,*\dist\*,dist\*,*\.data\*,.data\*,*.env,installer\*,*.exe,*.log"
; script de instalacao (etapas)
Source: "install.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Code]
var
  ProgressPage: TOutputProgressWizardPage;

procedure InitializeWizard;
begin
  ProgressPage := CreateOutputProgressPage(
    'Instalando o Corte',
    'Aguarde enquanto preparamos tudo no seu computador.');
end;

{ Para o backend que ja estiver rodando ANTES de copiar os arquivos.
  Sem isso, o node antigo segura a porta 4000, o novo morre ao subir e o
  usuario fica preso na versao velha mesmo apos reinstalar. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
  Kill: String;
begin
  Result := '';
  Kill := 'Get-CimInstance Win32_Process -Filter "Name=''node.exe''" | ' +
          'Where-Object { $_.CommandLine -like ''*cortes.digital*'' } | ' +
          'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; ' +
          'Start-Sleep -Seconds 1';
  SaveStringToFile(ExpandConstant('{tmp}\kill-corte.ps1'), Kill, False);
  Exec('powershell.exe',
    '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
    ExpandConstant('{tmp}\kill-corte.ps1') + '"',
    '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

function RunStep(Step, StatusText: String; FromP, ToP: Integer): Boolean;
var
  Code: Integer;
  Params: String;
begin
  ProgressPage.SetText(StatusText, '');
  ProgressPage.SetProgress(FromP, 100);
  Params := '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
    ExpandConstant('{app}\install.ps1') + '" -AppDir "' + ExpandConstant('{app}') +
    '" -Step ' + Step;
  Result := Exec('powershell.exe', Params, '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
  ProgressPage.SetProgress(ToP, 100);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    ProgressPage.Show;
    try
      if not RunStep('deps', 'Instalando Node.js, yt-dlp e ffmpeg (pode demorar alguns minutos)...', 5, 45) then
        MsgBox('Nao foi possivel instalar todas as dependencias automaticamente. Se ja tiver Node/yt-dlp/ffmpeg, o Corte deve funcionar mesmo assim.', mbInformation, MB_OK);
      if not RunStep('build', 'Preparando o Corte e baixando pacotes...', 45, 85) then
        MsgBox('Falha ao preparar o Corte. Verifique sua conexao e rode o instalador novamente.', mbError, MB_OK);
      RunStep('start', 'Iniciando o Corte no seu PC...', 85, 100);
    finally
      ProgressPage.Hide;
    end;
  end;
end;

[Run]
; abre a pasta do app ao final (opcional)
Filename: "{cmd}"; Parameters: "/c exit"; Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
Type: files; Name: "{userstartup}\Corte.vbs"
