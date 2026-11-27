@echo off
title AeroSentry worker
cd /d "%~dp0.."
call "%CD%\_cvenv.bat" || goto :end
python aerosentry.py run worker
:end
pause
