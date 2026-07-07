@echo off
title ShikshakAI OCR Backend Server
color 0A
chcp 65001 >nul 2>&1

echo ============================================================
echo  ShikshakAI OCR Backend ^| Python Server
echo ============================================================
echo.

:: Set working directory to this script's location
cd /d "%~dp0"

:: Check if venv exists
if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found at venv\Scripts\python.exe
    echo Please create it with: python -m venv venv
    echo Then install deps:    venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

:RESTART_LOOP
echo.
echo [%TIME%] Starting OCR backend server...
echo.

:: Set PYTHONIOENCODING to UTF-8 so unicode characters never crash stdout
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

:: Run the server — if it crashes, loop back after 5 seconds
venv\Scripts\python.exe -u main.py

set EXIT_CODE=%errorlevel%
echo.
echo [%TIME%] Server exited with code %EXIT_CODE%.

if %EXIT_CODE% == 0 (
    echo Server stopped cleanly. Press any key to restart, or Ctrl+C to quit.
    pause
) else (
    echo [!] Server crashed or was killed. Auto-restarting in 5 seconds...
    echo     Press Ctrl+C NOW to abort restart.
    timeout /t 5 /nobreak >nul
)

goto RESTART_LOOP
