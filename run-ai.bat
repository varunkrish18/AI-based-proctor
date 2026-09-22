@echo off
title Proctoring System - AI Service (FastAPI :8000)
cd /d "%~dp0ai-service"
echo ====================================================
echo Starting AI Computer Vision Service on http://localhost:8000
echo ====================================================
call .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
