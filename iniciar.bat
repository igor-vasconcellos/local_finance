@echo off
chcp 65001 > nul
title Local Finance
cd /d "%~dp0"

rem ================================================================
rem  Local Finance - iniciar
rem  Duplo clique: sobe o servidor e abre o app no navegador.
rem  Nao precisa de administrador.
rem ================================================================

where node > nul 2> nul
if errorlevel 1 goto :sem_node

rem Ja esta rodando? Entao so abre o navegador.
curl -s -o nul http://127.0.0.1:3000/login
if not errorlevel 1 goto :abrir

if not exist "node_modules\" goto :instalar
:depois_instalar
if not exist ".env" goto :configurar
:depois_configurar
if not exist ".next\BUILD_ID" goto :compilar
:depois_compilar

echo.
echo  Iniciando o Local Finance...
start "Local Finance - servidor (feche para desligar)" /min cmd /k "npm start"

rem Espera o servidor responder - ate 60 segundos.
set /a tentativas=0
:esperar
timeout /t 1 /nobreak > nul
curl -s -o nul http://127.0.0.1:3000/login
if not errorlevel 1 goto :abrir
set /a tentativas+=1
if %tentativas% lss 60 goto :esperar
echo.
echo  [ERRO] O servidor nao respondeu.
echo  Abra a janela "Local Finance - servidor" na barra de tarefas para ver o motivo.
pause
exit /b 1

:abrir
start "" http://localhost:3000
exit /b 0

:instalar
echo.
echo  Primeira execucao: instalando dependencias, pode levar alguns minutos...
call npm ci
if errorlevel 1 goto :erro
goto :depois_instalar

:configurar
echo.
echo  Criando configuracao inicial e banco de dados...
call npm run setup
if errorlevel 1 goto :erro
goto :depois_configurar

:compilar
echo.
echo  Preparando a versao otimizada do app, so na primeira vez...
call npm run build
if errorlevel 1 goto :erro
goto :depois_compilar

:sem_node
echo.
echo  [ERRO] Node.js nao encontrado.
echo  Instale com:  winget install --id OpenJS.NodeJS.LTS -e
pause
exit /b 1

:erro
echo.
echo  [ERRO] Algo deu errado. Copie a mensagem acima para pedir ajuda.
pause
exit /b 1
