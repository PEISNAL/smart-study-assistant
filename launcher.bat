@echo off
chcp 65001 >nul
title 万能网课助手
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未找到 Node.js，请先安装：https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo 📦 首次运行，安装依赖中...
    call npm install
)

echo 🚀 启动桌面版万能网课助手...
call npx electron .
