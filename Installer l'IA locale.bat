@echo off
cd /d "%~dp0"
title Installation de l IA locale de Rocket
echo.
echo  Rocket : installation de l IA locale gratuite (Ollama).
echo  Elle permet a Rocket de repondre a tout, meme quand Claude est deconnecte.
echo  Il faut environ 5 Go d espace disque et 8 Go de memoire vive.
echo.
where ollama >nul 2>nul
if errorlevel 1 (
  echo  1/2 Installation d Ollama...
  winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo  L installation automatique a echoue. Installez Ollama depuis https://ollama.com/download
    echo  puis relancez ce fichier.
    start "" https://ollama.com/download
    pause
    exit /b 1
  )
)
set "OLLAMA=ollama"
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
echo.
echo  2/2 Telechargement du modele (environ 4,7 Go, une seule fois)...
"%OLLAMA%" pull qwen2.5:7b
if errorlevel 1 (
  echo  Echec du telechargement. Verifiez Internet et relancez ce fichier.
  pause
  exit /b 1
)
echo.
echo  Termine ! Relancez Rocket : il utilisera l IA locale quand Claude ne repond pas.
pause
