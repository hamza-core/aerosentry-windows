@echo off
title AeroSentry face
cd /d "%~dp0.."
call "%CD%\_cvenv.bat" || goto :end
python aerosentry.py run face
:end
pause
