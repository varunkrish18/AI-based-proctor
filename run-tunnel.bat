@echo off
title Proctoring System - Ngrok Tunnel (Port 8080)
cd /d "%~dp0"
echo ====================================================
echo Starting Ngrok Tunnel for Spring Boot Backend (:8080)
echo URL: https://caecally-shiftable-cammy.ngrok-free.dev
echo ====================================================
ngrok.exe http 8080 --url https://caecally-shiftable-cammy.ngrok-free.dev
pause
