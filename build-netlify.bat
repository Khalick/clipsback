@echo off
echo Preparing Netlify Functions deployment...

REM Create the functions directory if it doesn't exist
if not exist netlify\functions mkdir netlify\functions

REM Copy necessary files to the functions directory
echo Copying package.json...
copy package.json netlify\functions\

echo Copying db.js...
copy db.js netlify\functions\

REM Copy the utils directory and its contents
echo Copying utils directory...
if not exist netlify\functions\utils mkdir netlify\functions\utils
xcopy /E /Y utils\* netlify\functions\utils\

echo Setup complete!
