@echo off
cd /d "%~dp0"
title Rocket
if not exist node_modules (
  echo Premiere installation, patientez une minute...
  call npm install
)
rem Rocket ouvre lui-meme Chrome (ou Edge) des que le serveur est pret.
set ROCKET_OPEN=1
npm start
pause
