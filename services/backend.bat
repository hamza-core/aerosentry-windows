@echo off
title AeroSentry backend
cd /d "%~dp0.."
call "%CD%\_cvenv.bat" || goto :end
python aerosentry.py run backend
:end
pause
