@echo off
title AeroSentry model
cd /d "%~dp0.."
call "%CD%\_cvenv.bat" || goto :end
python aerosentry.py run model
:end
pause
