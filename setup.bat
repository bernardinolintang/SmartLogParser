@echo off

where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Docker is not installed. Please install it from https://www.docker.com and re-run this script.
    exit /b 1
)

echo Starting setup, this may take 10-20 minutes on first run...

docker compose up -d --build

echo Waiting for Ollama to start...
timeout /t 15 /nobreak >nul

docker exec smartlogparser-ollama-1 ollama pull llama3.2

echo Setup complete! Visit http://localhost:8080
pause
