@echo off
setlocal
chcp 65001 > nul
TITLE Guardian AI - Master Launcher
CLS

:: Repo root = folder of this script (works wherever the repo is cloned)
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo =======================================================================
echo               GUARDIAN AI SYSTEM - ONE-CLICK MULTI-LAUNCHER
echo =======================================================================
echo  Repo: %ROOT%
echo.

:: -----------------------------------------------------------------------
:: 0. Prerequisites
:: -----------------------------------------------------------------------
echo [STEP 0/4] Checking prerequisites...
set "MISSING="
where docker > nul 2>&1 || (echo   [X] docker not found - install Docker Desktop: https://www.docker.com/products/docker-desktop/ & set "MISSING=1")
where go > nul 2>&1 || (echo   [X] go not found - install Go: https://go.dev/dl/ & set "MISSING=1")
where npm > nul 2>&1 || (echo   [X] npm not found - install Node.js: https://nodejs.org/ & set "MISSING=1")
if defined MISSING goto :fail

docker info > nul 2>&1 || (echo   [X] Docker is installed but not running - start Docker Desktop and try again. & goto :fail)
docker compose version > nul 2>&1 || (echo   [X] "docker compose" v2 not available - update Docker Desktop. & goto :fail)

if not exist "%ROOT%\api\.venv\Scripts\activate.bat" (
    where python > nul 2>&1 || (echo   [X] python not found and api\.venv does not exist - install Python 3.12+ & goto :fail)
    echo   [!] api\.venv not found - using the system python. Install deps from api\pyproject.toml.
)
if not exist "%ROOT%\api\models\best_m.pth" echo   [!] api\models\best_m.pth not found - the AI server will fail to load the model.
if not exist "%ROOT%\backend\.env" echo   [!] backend\.env not found - copy backend\.env.example to backend\.env and fill it in.
if not exist "%ROOT%\api\.env" echo   [!] api\.env not found - copy api\.env.example to api\.env and fill it in.
if not exist "%ROOT%\frontend\.env.local" if not exist "%ROOT%\frontend\.env" echo   [!] frontend\.env.local not found - copy frontend\.env.example to frontend\.env.local.
echo   OK
echo.

:: -----------------------------------------------------------------------
:: 1. Infrastructure in Docker: Mosquitto + PostgreSQL + Redis
:: -----------------------------------------------------------------------
echo [STEP 1/4] Starting Docker services (docker-compose.yml)...
set "SERVICES=postgres redis"
set "MOSQ_OK=1"
:: passwd and certs are gitignored and must be created by hand (see mosquitto\README.md).
:: A trailing "\" checks for a directory: Docker creates missing mount paths as empty folders.
if not exist "%ROOT%\mosquitto\config\passwd" set "MOSQ_OK="
if exist "%ROOT%\mosquitto\config\passwd\" set "MOSQ_OK="
if not exist "%ROOT%\mosquitto\certs\server.crt" set "MOSQ_OK="
if not exist "%ROOT%\mosquitto\certs\server.key" set "MOSQ_OK="
if defined MOSQ_OK (
    set "SERVICES=mosquitto postgres redis"
) else (
    echo   [!] Skipping mosquitto: mosquitto\config\passwd or mosquitto\certs\server.crt/.key is missing.
    echo       See mosquitto\README.md for how to create them.
)

:: Reuse backend\.env so DB_USER / DB_PASSWORD / DB_NAME / DB_PORT / REDIS_* match what Go connects with
set "ENV_ARG="
if exist "%ROOT%\backend\.env" set ENV_ARG=--env-file "%ROOT%\backend\.env"

echo   docker compose up -d --wait %SERVICES%
docker compose --project-directory "%ROOT%" -f "%ROOT%\docker-compose.yml" %ENV_ARG% up -d --wait %SERVICES%
if errorlevel 1 (
    echo   [!] docker compose reported an error - check: docker compose logs
    echo       If port 5433 or 6379 is already in use, a local PostgreSQL/Redis may already be running.
)
echo.

:: -----------------------------------------------------------------------
:: 2. Python AI server (FastAPI + MQTT receiver, started by app.py)
:: -----------------------------------------------------------------------
echo [STEP 2/4] Opening Python AI server window (port 8000)...
start "Guardian AI - Python AI (Port 8000)" /d "%ROOT%\api" cmd /k "set PYTHONIOENCODING=utf-8& (if exist .venv\Scripts\activate.bat call .venv\Scripts\activate.bat)& python -m uvicorn app:app --host 0.0.0.0 --port 8000"

:: -----------------------------------------------------------------------
:: 3. Go backend
:: -----------------------------------------------------------------------
echo [STEP 3/4] Opening Go backend window (port 8080)...
start "Guardian AI - Go Backend (Port 8080)" /d "%ROOT%\backend" cmd /k "go run ."

:: -----------------------------------------------------------------------
:: 4. Next.js frontend
:: -----------------------------------------------------------------------
echo [STEP 4/4] Opening Next.js frontend window (port 3000)...
start "Guardian AI - Next.js Frontend (Port 3000)" /d "%ROOT%\frontend" cmd /k "(if not exist node_modules npm install)& npm run dev"

echo.
echo =======================================================================
echo  All services launched. Each app logs in its own window.
echo  - Frontend : http://localhost:3000
echo  - Backend  : http://localhost:8080
echo  - AI       : http://localhost:8000
echo  This window closes in 5 seconds.
echo =======================================================================
timeout /t 5 > nul
exit /b 0

:fail
echo.
echo  Fix the problems above and run start_guardian.bat again.
pause
exit /b 1
