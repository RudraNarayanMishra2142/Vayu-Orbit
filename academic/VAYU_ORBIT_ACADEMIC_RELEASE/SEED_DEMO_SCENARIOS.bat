@echo off
setlocal enabledelayedexpansion
title VAYU ORBIT - Pre-Stage Demonstration Scenarios
cd /d "%~dp0"

echo ======================================================================
echo  VAYU ORBIT -- OPTIONAL DEMO SCENARIOS PRE-STAGE UTILITY
echo ======================================================================
echo.
echo  This utility seeds two pre-staged sample journeys into the ISOLATED
echo  demonstration database (military_logistics_demo.db) only:
echo    1. CMS-DEMO-ACTIVE-01     [ACTIVE]    - Fuel and spacing alerts
echo    2. CMS-DEMO-COMPLETED-02  [COMPLETED] - Timeline and PDF debrief
echo.
echo  The production database (military_logistics.db) will NOT be modified.
echo.

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found on your system PATH.
    echo Please install Python 3.11+ and ensure 'Add Python to PATH' is enabled.
    echo.
    pause
    exit /b 1
)

python backend\seed_demo_scenarios.py
set SEED_EXIT=%errorlevel%

echo.
if %SEED_EXIT% equ 0 (
    echo [PASS] Demonstration scenarios pre-staged successfully.
    echo Launch START_VAYU_ORBIT_DEMO.bat to review the journeys in the UI.
) else (
    echo [FAIL] Seeding operation encountered an error (exit code %SEED_EXIT%).
)

echo.
pause
exit /b %SEED_EXIT%
