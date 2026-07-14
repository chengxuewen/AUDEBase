@echo off
REM bootstrap.bat — AUDEBase development environment entry point (Windows)
REM Usage: bootstrap.bat
setlocal enabledelayedexpansion

echo === AUDEBase Bootstrap ===

REM Step 1: Install/update pixi and project dependencies
call "%~dp0scripts\pixi-init.bat"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: pixi-init.bat failed
    exit /b 1
)

REM Step 2: Activate pixi environment shell hook
call "%~dp0pixi.bat"
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: pixi.bat failed — some features may not work

)

echo === AUDEBase environment ready ===
echo Run "pixi run --help" to see available tasks
