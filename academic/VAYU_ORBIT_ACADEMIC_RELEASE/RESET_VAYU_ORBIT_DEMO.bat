@echo off
setlocal enabledelayedexpansion
title VAYU ORBIT - Demo Database Reset Utility
cd /d "%~dp0"

echo ======================================================================
echo  VAYU ORBIT -- DEMO DATABASE RESET UTILITY
echo ======================================================================
echo.
echo  This utility prepares a pristine demonstration state with ZERO journeys.
echo  The protected production database (military_logistics.db) will NOT be touched.
echo.

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found on your system PATH.
    echo Please install Python 3.11+ and ensure 'Add Python to PATH' is enabled.
    echo.
    pause
    exit /b 1
)

python backend\prepare_demo_db.py
set RESET_EXIT=%errorlevel%

echo.
if %RESET_EXIT% equ 0 (
    echo [PASS] Demo database successfully prepared.
    echo You can now launch START_VAYU_ORBIT_DEMO.bat for your presentation.
) else (
    echo [FAIL] Reset operation encountered an error (exit code %RESET_EXIT%).
)

echo.
pause
exit /b %RESET_EXIT%
