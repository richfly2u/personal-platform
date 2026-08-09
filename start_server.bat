@echo off
title Personal Platform Sync Server
cd /d C:\Users\alan\personal-platform
echo Starting sync server (HTTPS :9443)...
echo Used by phone Refresh button and todo write-back.
echo.
python sync_server.py
pause
