@echo off
cd /d "%~dp0"
call "%~dp0_cvenv.bat" || goto :end
python aerosentry.py demo %*
:end
pause
