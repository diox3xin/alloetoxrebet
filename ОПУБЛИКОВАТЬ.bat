@echo off
REM Запуск публикации в GitHub: двойной клик по этому файлу.
REM Токен не попадёт в чат — он вводится в скрытом окне или берётся из gh.

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-github-access.ps1"
echo.
pause
