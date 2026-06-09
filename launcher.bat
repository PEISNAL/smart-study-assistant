@echo off
chcp 65001 >nul
title 万能网课助手 - 运行中（关闭此窗口即停止）
cd /d "%~dp0"

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   ❌ 未找到 Node.js！
    echo   请先安装：https://nodejs.org （下载 LTS 版本，一路下一步即可）
    echo.
    pause
    exit /b 1
)

:: 首次安装依赖
if not exist "node_modules\express" (
    echo   📦 首次运行，安装依赖中...
    call npm install
    echo.
)

:: 启动
echo.
echo   ========================================
echo     🎓 万能网课助手 启动中...
echo   ========================================
echo.
echo   👉 浏览器即将自动打开配置页面
echo   💡 关闭本窗口即可停止服务
echo   ========================================
echo.

:: 打开浏览器
start "" http://localhost:3456

:: 启动服务器
node server.js

pause
