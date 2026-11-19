@echo off
chcp 65001 > nul
title Local Finance - parar
cd /d "%~dp0"

rem Desliga o servidor do Local Finance e fecha a janela dele.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\parar.ps1"
timeout /t 3 > nul
