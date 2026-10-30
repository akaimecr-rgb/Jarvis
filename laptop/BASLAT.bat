@echo off
cd /d "%~dp0"
pip install -q vosk sounddevice numpy requests yt-dlp imageio-ffmpeg
python -m pip install -q -U yt-dlp
python jarvis_laptop.py
pause
