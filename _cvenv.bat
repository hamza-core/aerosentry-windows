@echo off
rem Makes the team's conda environment active in this window. Used by the other .bat files.
rem Another name? Set it first:   set AERO_CONDA_ENV=myenv
if not defined AERO_CONDA_ENV set "AERO_CONDA_ENV=cv_env"
if /i "%CONDA_DEFAULT_ENV%"=="%AERO_CONDA_ENV%" exit /b 0
set "CONDA_BAT="
for %%C in ("%USERPROFILE%\miniconda3" "%USERPROFILE%\anaconda3" "%USERPROFILE%\miniforge3" "%LOCALAPPDATA%\miniconda3" "%LOCALAPPDATA%\anaconda3" "%ProgramData%\miniconda3" "%ProgramData%\anaconda3" "%ProgramData%\miniforge3") do if not defined CONDA_BAT if exist "%%~C\condabin\conda.bat" set "CONDA_BAT=%%~C\condabin\conda.bat"
if not defined CONDA_BAT for /f "delims=" %%C in ('where conda.bat 2^>nul') do if not defined CONDA_BAT set "CONDA_BAT=%%C"
if not defined CONDA_BAT goto :noconda
call "%CONDA_BAT%" activate %AERO_CONDA_ENV%
if /i not "%CONDA_DEFAULT_ENV%"=="%AERO_CONDA_ENV%" goto :noenv
exit /b 0
:noconda
echo STOPPED: conda was not found. Open "Anaconda Prompt", run:  conda activate cv_env
echo then go to this folder and run the same command there, for example:  setup.bat
exit /b 1
:noenv
echo STOPPED: the conda environment "%AERO_CONDA_ENV%" could not be activated. List yours with:  conda env list
exit /b 1
