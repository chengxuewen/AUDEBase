@echo off
REM pixi-init.bat — Initialize pixi and project dependencies (Windows)
REM Usage: pixi-init.bat
setlocal enabledelayedexpansion

set "PROJECT_ROOT=%~dp0.."

REM Check if pixi is installed
where pixi >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo pixi not found. Installing via PowerShell...
    powershell -Command "iwr -useb https://pixi.sh/install.ps1 | iex" -NoProfile
    if %ERRORLEVEL% NEQ 0 (
        echo "ERROR: pixi installation failed"
        exit /b 1
    )
    REM Refresh PATH
    set "PATH=%USERPROFILE%\.pixi\bin;%PATH%"
    where pixi >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo "ERROR: pixi binary not found after installation"
        exit /b 1
    )
)

REM Check pixi version
set "PIXI_VERSION=0.67.2"
for /f "tokens=2" %%v in ('pixi --version 2^>nul') do set "CURRENT_PIXI_VERSION=%%v"
if not "!CURRENT_PIXI_VERSION!"=="!PIXI_VERSION!" (
    echo pixi version mismatch (installed: !CURRENT_PIXI_VERSION!, required: !PIXI_VERSION!^). Reinstalling...
    REM Reinstall to exact version
    powershell -Command "$env:PIXI_VERSION='!PIXI_VERSION!'; iwr -useb https://pixi.sh/install.ps1 | iex" -NoProfile
    if !ERRORLEVEL! NEQ 0 (
        echo WARNING: pixi version reinstall failed
    )
)

echo Installing project dependencies...
pixi install --frozen 2>nul || (
    echo Lock file missing or outdated, running pixi install...
    pixi install
)
if %ERRORLEVEL% NEQ 0 (
    echo "ERROR: pixi install failed"
    exit /b 1
)

echo Checking pixi-pack...
where pixi-pack >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing pixi-pack (includes pixi-unpack)...
    pixi global install pixi-pack
    if %ERRORLEVEL% NEQ 0 (
        echo WARNING: pixi-pack install failed — deploy scripts may not work
    )
)
echo pixi init complete
