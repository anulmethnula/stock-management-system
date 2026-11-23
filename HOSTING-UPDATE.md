# StockEasy live-site update

This package updates `https://stock.supuncompanies.com` without replacing its production data.

## Before extracting the package

1. Stop the StockEasy Node.js application in the hosting panel or with PM2.
2. Download or copy `/var/lib/stockeasy/stockeasy.db` as an additional backup.
3. Keep the existing `.env` file and database. They are intentionally not included in this package.

## Install and migrate

Extract the package into a new application directory, then run:

```bash
npm ci --omit=dev
npm run migrate:hosting -- /var/lib/stockeasy/stockeasy.db
```

The migration creates another timestamped `.bak` beside the database before making changes. It is safe to run again if necessary.

Configure the Node.js application to start `server/server.js`, using the existing environment variables, and then restart it. With PM2:

```bash
pm2 restart stockeasy --update-env
```

## Check after restarting

Open `https://stock.supuncompanies.com` in a private browser window and verify login, Products, Current Stock, GRNs, customer orders, and reports. Keep the previous application directory and database backups until these checks pass.

If the hosting panel uses a different database location, replace `/var/lib/stockeasy/stockeasy.db` with the value of `STOCKEASY_DB_PATH` from the existing environment configuration.
