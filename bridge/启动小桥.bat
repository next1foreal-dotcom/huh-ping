@echo off
REM Windows: double-click to start the Huh? bridge
cd /d "%~dp0"
where node >nul 2>nul || (echo Please install Node.js 18+ first: https://nodejs.org & pause & exit /b 1)
node huh-bridge.mjs
pause
