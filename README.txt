STOCKEASY - HOW TO RUN
1. Install Node.js (LTS) from nodejs.org
2. Windows: double-click start.bat
   Mac/Linux: open a terminal here, run:  npm install   then   npm start
3. Open http://localhost:3001 in your browser

Your data lives in database/stockeasy.db (SQLite). Copy this file to back up.
database/schema.sql shows every table. Delete stockeasy.db to reset to sample data.
Developers: "npm run dev" runs API (3001) + hot-reload client (5173).
