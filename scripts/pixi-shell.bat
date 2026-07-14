@echo off
REM pixi-shell.bat — Open a new shell with pixi environment activated
REM Requires pixi to be installed and initialized
REM Usage: pixi-shell.bat

where pixi >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: pixi not found. Run bootstrap.bat first.
    exit /b 1
)
pixi shell
