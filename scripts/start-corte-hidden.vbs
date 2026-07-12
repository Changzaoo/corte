' Inicia o Corte SEM janela de console (duplo-clique).
' Chama o start-corte.ps1 escondido; a aplicacao abre sozinha no navegador.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = scriptDir & "\start-corte.ps1"
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
