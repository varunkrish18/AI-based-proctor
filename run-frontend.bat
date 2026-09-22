@echo off
title Proctoring System - Frontend (Vite React :5173)
cd /d "%~dp0frontend"
echo ====================================================
echo Starting Frontend Web App on http://localhost:5173
echo ====================================================
call npm.cmd run dev
pause
