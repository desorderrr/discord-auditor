@echo off
rem Arranque visivel — para testar. Fecha a janela para parar o bot.
cd /d "%~dp0"

if not exist "logs" mkdir "logs"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  X Node.js nao encontrado no PATH.
  echo    Instala o Node 20 ou superior: https://nodejs.org
  echo.
  pause
  exit /b 1
)

node src\index.js
pause
