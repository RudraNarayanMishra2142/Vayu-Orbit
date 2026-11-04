@echo off
setlocal enabledelayedexpansion
title VAYU ORBIT - Demo Launcher
cd /d "%~dp0"

echo ======================================================================
echo  VAYU ORBIT -- ONE-CLICK DEMONSTRATION LAUNCHER
echo ======================================================================
echo.

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found on your system PATH.
    echo Please install Python 3.11+ and ensure 'Add Python to PATH' is enabled.
    echo.
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found on your system PATH.
    echo Please install Node.js (LTS version) to run the frontend interface.
    echo.
    pause
    exit /b 1
)

python backend\demo_launcher.py
set LAUNCHER_EXIT=%errorlevel%

if %LAUNCHER_EXIT% neq 0 (
    echo.
    echo [ERROR] Demo launcher exited with error code %LAUNCHER_EXIT%.
    pause
)
exit /b %LAUNCHER_EXIT%
