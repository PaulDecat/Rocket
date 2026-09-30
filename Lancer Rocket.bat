@echo off
cd /d "%~dp0"
title Rocket
if not exist node_modules (
  echo Premiere installation, patientez une minute...
  call npm install
)
start "" http://localhost:3000
npm start
pause
