@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Spese di casa - spegnimento

set "trovato="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo  Server attivo trovato, PID %%p. Lo chiudo...
    taskkill /F /PID %%p >nul 2>&1
    set "trovato=1"
)

if defined trovato (
    "%SystemRoot%\System32\timeout.exe" /t 1 /nobreak >nul
    taskkill /F /FI "WINDOWTITLE eq Spese di casa - server*" >nul 2>&1
    echo.
    echo  Server spento. I dati sono al sicuro in spese.db e in backups.
) else (
    echo  Nessun server in esecuzione sulla porta 3000.
)

echo.
"%SystemRoot%\System32\timeout.exe" /t 3 /nobreak >nul
