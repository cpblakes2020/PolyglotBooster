@echo off
rem Runs the PolyglotBooster data backup and appends its output to a log.
rem Started weekly by the Windows scheduled task "PolyglotBooster data backup".
cd /d "%~dp0.."
call npm run backup >> "%USERPROFILE%\Documents\PolyglotBooster backups\backup.log" 2>&1
