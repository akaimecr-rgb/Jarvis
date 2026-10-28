@echo off
cd /d "%~dp0"
pip install -q vosk sounddevice numpy requests yt-dlp
python jarvis_laptop.py
pause
