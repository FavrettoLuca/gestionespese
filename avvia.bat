@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Spese di casa - avvio

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Node.js non e installato, oppure non e nel PATH.
    echo  Installalo da https://nodejs.org e riprova.
    echo  In alternativa, apri un prompt nella cartella del progetto e scrivi:
    echo     "C:\Program Files\nodejs\node.exe" server.js
    echo.
    pause
    exit /b 1
)

echo Verifico la porta 3000...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo  C'e ancora un server attivo, PID %%p. Lo chiudo...
    taskkill /F /PID %%p >nul 2>&1
    "%SystemRoot%\System32\timeout.exe" /t 1 /nobreak >nul
)

echo Avvio del server...
start "Spese di casa - server" cmd /k node server.js

echo Attendo che sia pronto...
"%SystemRoot%\System32\timeout.exe" /t 2 /nobreak >nul

start "" "http://localhost:3000"

echo.
echo  Tutto fatto.
echo  - Il server gira nella finestra nera "Spese di casa - server":
echo    chiudendo quella finestra il server si spegne.
echo  - Il browser e aperto su http://localhost:3000
echo  - Per spegnerlo in un colpo solo usa chiudi.bat
echo.
"%SystemRoot%\System32\timeout.exe" /t 4 /nobreak >nul
