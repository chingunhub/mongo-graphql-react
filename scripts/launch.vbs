' Starts launch.ps1 without flashing a console window.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "\launch.ps1"""
CreateObject("WScript.Shell").Run cmd, 0, False
