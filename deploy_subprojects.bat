@echo off
setlocal

set SMELO_DIR=%~dp0
set FLASH_CARDS_DIR=%SMELO_DIR%..\poker_flash_cards
set HAND_TRACKER_DIR=%SMELO_DIR%..\poker-hand-tracker

if "%1"=="" (
    echo Usage: deploy_subprojects.bat [pre^|hand^|all]
    exit /b 1
)

if "%1"=="pre" goto build_pre
if "%1"=="hand" goto build_hand
if "%1"=="all" goto build_all
echo Unknown target: %1
echo Usage: deploy_subprojects.bat [pre^|hand^|all]
exit /b 1

:build_pre
echo Building preflop trainer...
cd /d "%FLASH_CARDS_DIR%" || exit /b 1
call flutter build web --release --base-href /pre/ || exit /b 1
echo Deploying to docs/pre/...
rmdir /s /q "%SMELO_DIR%docs\pre" 2>nul
mkdir "%SMELO_DIR%docs\pre"
xcopy /s /e /q "build\web\*" "%SMELO_DIR%docs\pre\" >nul
echo Done: pre
if "%1"=="pre" goto end
goto :eof

:build_hand
echo Building hand tracker...
cd /d "%HAND_TRACKER_DIR%" || exit /b 1
call flutter build web --release --base-href /hand/ || exit /b 1
echo Deploying to docs/hand/...
rmdir /s /q "%SMELO_DIR%docs\hand" 2>nul
mkdir "%SMELO_DIR%docs\hand"
xcopy /s /e /q "build\web\*" "%SMELO_DIR%docs\hand\" >nul
echo Done: hand
goto end

:build_all
call :build_pre
if errorlevel 1 exit /b 1
call :build_hand
if errorlevel 1 exit /b 1
goto end

:end
cd /d "%SMELO_DIR%"
echo Deploy complete.
echo.
set /p COMMIT="Commit and push? [y/N] "
if /i "%COMMIT%"=="y" (
    git add docs/pre docs/hand
    git commit -m "Rebuild subprojects"
    git push
)
