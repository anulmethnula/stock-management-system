@echo off
echo Installing (first time only)...
call npm install
echo Starting StockEasy at http://localhost:3001
start http://localhost:3001
call npm start
