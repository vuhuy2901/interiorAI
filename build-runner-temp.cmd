@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 >nul
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where link
where cargo
cd /d "C:\QLDAPM-final\interiorAI\paperclip"
pnpm --filter @paperclipai/paperclip-runner build:binary
exit /b %ERRORLEVEL%
