@echo off
title AeroSentry web
cd /d "%~dp0.."
call "%CD%\_cvenv.bat" || goto :end
python aerosentry.py run web
:end
pause
