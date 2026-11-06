Set WshShell = CreateObject("WScript.Shell")
Dim projectPath
projectPath = "C:\Users\Surface_Dpc\.gemini\antigravity\scratch\telegram-master-bot"

' Iniciar PM2 com o bot
WshShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -Command ""Set-Location '" & projectPath & "'; pm2 start ecosystem.config.cjs; pm2 save --force""", 0, True

WshShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -Command ""Start-Sleep -Seconds 5; pm2 resurrect""", 0, False

