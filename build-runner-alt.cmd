@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 >nul
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
set "CARGO_TARGET_DIR=%USERPROFILE%\.paperclip\runner-target"
cd /d "C:\QLDAPM-final\interiorAI\paperclip\packages\paperclip-runner"
cargo build --release --manifest-path runner\Cargo.toml --locked -p paperclip-runner-core --bin paperclip-runnerd
if errorlevel 1 exit /b %errorlevel%
copy /Y "%USERPROFILE%\.paperclip\runner-target\release\paperclip-runnerd.exe" "%USERPROFILE%\.paperclip\paperclip-runnerd.exe" >nul
if errorlevel 1 exit /b %errorlevel%
echo RUNNER_BINARY=%USERPROFILE%\.paperclip\paperclip-runnerd.exe
