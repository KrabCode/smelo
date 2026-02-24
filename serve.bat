@echo off
pushd "%~dp0docs"
start "" python -m http.server 8000
timeout /t 2 >nul
start "" firefox "http://localhost:8000/"
echo Server running on http://localhost:8000/
echo Press any key to stop...
pause >nul
taskkill /f /im python.exe >nul 2>&1
popd
