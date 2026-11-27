@echo off
cd /d "%~dp0"
call "%~dp0_cvenv.bat" || goto :end
python scripts\camera_check.py %*
:end
pause
