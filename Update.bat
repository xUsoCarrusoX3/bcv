@echo off
setlocal enabledelayedexpansion
color 0b
echo ====================================================
echo      Automatizador Inteligente de Git para GitHub
echo ====================================================
echo.

:: 1. Verificar si Git esta inicializado en esta carpeta
if not exist ".git" (
    echo [*] Inicializando repositorio Git por primera vez...
    git init
    git branch -M main
)

:: 2. Verificar si ya tiene un repositorio remoto (origin) configurado
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [!] Este proyecto no tiene un repositorio remoto asociado.
    set /p "repo_url=[?] Pega la URL de tu repositorio de GitHub: "
    
    if "!repo_url!"=="" (
        echo [X] No ingresaste ninguna URL. Cancelando operacion.
        goto fin
    )
    
    git remote add origin !repo_url!
    echo [+] ¡Repositorio remoto configurado con exito!
) else (
    for /f "tokens=*" %%i in ('git remote get-url origin') do set "repo_url=%%i"
    echo [+] Repositorio detectado: !repo_url!
)

:: 3. Sincronizar con GitHub por si la carpeta .git fue borrada previamente
echo.
echo [*] Sincronizando con el repositorio remoto...
git pull origin main --allow-unrelated-histories -X theirs >nul 2>&1

echo.
echo ====================================================
echo [+] Preparando cambios (anadiendo y borrando)...
git add -A

:: Comprobar si hay cambios reales para subir
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo.
    echo [i] No hay cambios nuevos para subir en este proyecto.
    goto fin
)

:: 4. Pedir mensaje para el commit
echo.
set /p "mensaje=[?] Escribe el mensaje del commit (presiona Enter para usar uno por defecto): "
if "!mensaje!"=="" set "mensaje=Actualizacion automatica"

git commit -m "!mensaje!"

:: 5. Subir a GitHub
echo.
echo [*] Subiendo cambios a GitHub...
git push -u origin main

:fin
echo.
echo ====================================================
echo                ¡Proceso finalizado!
echo ====================================================
pause