# start-telegram-bot.ps1 — Script de arranque permanente do Telegram Master Bot
# Coloca este script no Startup do Windows para arranque automático

$projectPath = "C:\Users\Surface_Dpc\Desktop\projectos\telegram-master-bot"
$logFile = "$projectPath\logs\startup.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts $msg" | Tee-Object -FilePath $logFile -Append
}

Log "=== Iniciar Telegram Master Bot ==="
Set-Location $projectPath

# Garantir que a diretoria de logs existe
New-Item -ItemType Directory -Force -Path "$projectPath\logs" | Out-Null

# Verificar se o bot já está a correr (evitar duplicados)
$running = pm2 list 2>&1 | Select-String "telegram-master-bot.*online"
if ($running) {
    Log "Bot já está online. A reiniciar para garantir versão mais recente..."
    pm2 restart telegram-master-bot 2>&1 | Out-Null
} else {
    Log "A iniciar o bot..."
    pm2 start ecosystem.config.cjs 2>&1
}

Start-Sleep -Seconds 3
pm2 save --force 2>&1 | Out-Null

$status = pm2 list 2>&1 | Select-String "telegram-master-bot"
if ($status -match "online") {
    Log "✅ Bot iniciado com sucesso!"
} else {
    Log "❌ Falha ao iniciar o bot. Verifica os logs com: pm2 logs telegram-master-bot"
}

