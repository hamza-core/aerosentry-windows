@echo off
title AeroSentry media
cd /d "%~dp0.."
call "%CD%\_cvenv.bat" || goto :end
python aerosentry.py run media
:end
pause
