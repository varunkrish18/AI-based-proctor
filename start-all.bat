@echo off
echo ====================================================
echo Launching AI Online Examination ^& Proctoring System
echo (Running without Docker on Windows)
echo ====================================================
echo 1. Starting Backend (Spring Boot :8080)...
start "Proctoring Backend" cmd /k "cd /d %~dp0backend && .\mvnw.cmd spring-boot:run"
timeout /t 5 /nobreak >nul

echo 2. Starting AI Service (FastAPI :8000)...
start "Proctoring AI Service" cmd /k "cd /d %~dp0ai-service && .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 3 /nobreak >nul

echo 3. Starting Frontend (React :5173)...
start "Proctoring Frontend" cmd /k "cd /d %~dp0frontend && npm.cmd run dev"

echo ====================================================
echo All 3 services are launching in their own windows!
echo - Frontend Web App:  http://localhost:5173
echo - Backend REST API:  http://localhost:8080
echo - AI Service Docs:   http://localhost:8000/docs
echo ====================================================
pause
