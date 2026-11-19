@echo off
chcp 65001 > nul
title Local Finance - atualizar
cd /d "%~dp0"

rem ================================================================
rem  Baixa a versao mais nova do GitHub e prepara o app.
rem  Seus dados - pasta data - e o arquivo .env nao sao alterados.
rem ================================================================

curl -s -o nul http://127.0.0.1:3000/login
if not errorlevel 1 (
  echo  O app esta aberto. Desligando antes de atualizar...
  call "%~dp0parar.bat"
)

echo.
echo  [1/3] Baixando atualizacoes...
git pull
if errorlevel 1 goto :erro

echo.
echo  [2/3] Instalando dependencias...
call npm install
if errorlevel 1 goto :erro

echo.
echo  [3/3] Preparando o app...
call npm run build
if errorlevel 1 goto :erro

echo.
echo  Pronto! Use o iniciar.bat para abrir o Local Finance.
echo  O banco de dados e atualizado sozinho na primeira abertura.
pause
exit /b 0

:erro
echo.
echo  [ERRO] A atualizacao falhou. Copie a mensagem acima para pedir ajuda.
pause
exit /b 1
