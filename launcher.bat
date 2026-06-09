@echo off
chcp 65001 >nul
title 万能网课助手

echo.
echo   ==================================
echo     🎓 万能网课助手 启动中...
echo   ==================================
echo.

cd /d "%~dp0"

:: 检查 node
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   ❌ 未找到 Node.js，请先安装：https://nodejs.org
    pause
    exit /b 1
)

:: 检查依赖
if not exist "node_modules" (
    echo   📦 首次运行，正在安装依赖...
    call npm install
    echo.
)

:: 检查 express
if not exist "node_modules\express" (
    echo   📦 安装 Express...
    call npm install express
    echo.
)

:: 启动服务
echo   🌐 正在启动服务...
echo   💡 浏览器将自动打开，关闭此窗口即可停止服务
echo.
start "" http://localhost:3456
node server.js

pause
