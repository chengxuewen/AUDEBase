@echo off
REM pixi.bat — pixi shell hook for Windows (CMD/PowerShell)
REM Sets up PATH and environment variables for the pixi project
REM Usage: call pixi.bat



REM Find pixi binary
where pixi >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: pixi not found in PATH. Install it first: https://pixi.sh
    exit /b 1
)

REM Run pixi shell-hook and apply it
for /f "delims=" %%i in ('pixi shell-hook') do %%i

REM Verify python is available
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo pixi environment activated
) else (
    echo WARNING: python not found in pixi environment
)
