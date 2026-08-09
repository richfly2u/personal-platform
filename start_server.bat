@echo off
title 個人平台同步伺服器
cd /d C:\Users\alan\personal-platform
echo 啟動個人平台同步伺服器 (HTTPS :9443)...
echo 手機 🔄 同步與待辦回寫都靠它
echo.
python sync_server.py
pause
