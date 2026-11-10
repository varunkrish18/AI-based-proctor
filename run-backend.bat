@echo off
title Proctoring System - Backend (Spring Boot :8080)
cd /d "%~dp0backend"
echo ====================================================
echo Starting Spring Boot Backend on http://localhost:8080
echo ====================================================
call .\mvnw.cmd spring-boot:run
pause
