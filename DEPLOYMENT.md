# StockEasy production deployment

Target URL: `https://stock.supuncompanies.com`

The deployment ZIP is intentionally clean. It contains no local database, passwords, Git files, tests, or `node_modules`. On the first start, StockEasy creates a new database from `database/schema.sql`.

## 1. DNS

Create an `A` record named `stock` under `supuncompanies.com` pointing to the public IP address of the Node.js server.

## 2. Upload and install

Upload and extract the deployment ZIP to `/var/www/stockeasy`, then run:

```bash
cd /var/www/stockeasy
npm ci --omit=dev
sudo mkdir -p /var/lib/stockeasy
sudo chown -R "$USER":"$USER" /var/lib/stockeasy
```

Copy `deployment.env.example` to `.env`, replace the example admin password with a long random password, and load those variables through the hosting panel or process manager. Never upload the completed `.env` publicly.

## 3. Start with PM2

```bash
npm install -g pm2
set -a
. ./.env
set +a
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Only run one StockEasy server instance because the application uses SQLite.

## 4. Configure the subdomain

Copy `nginx-stock.supuncompanies.com.conf` to `/etc/nginx/sites-available/stockeasy`, enable it, validate Nginx, and reload:

```bash
sudo ln -s /etc/nginx/sites-available/stockeasy /etc/nginx/sites-enabled/stockeasy
sudo nginx -t
sudo systemctl reload nginx
```

Enable HTTPS with the host's SSL tool or Certbot:

```bash
sudo certbot --nginx -d stock.supuncompanies.com
```

## 5. First login and backups

Open `https://stock.supuncompanies.com` and sign in with `STOCKEASY_ADMIN_USER` and `STOCKEASY_ADMIN_PASSWORD`. After the first successful start, remove the plain-text password variable from the process environment if your hosting workflow permits it; only its secure hash is stored in SQLite.

Administrators can download a consistent database snapshot from **Staff → Download Backup**. Also back up `/var/lib/stockeasy/stockeasy.db` regularly.

## Updating later

Back up the production database first. Replace the application files but keep `/var/lib/stockeasy/stockeasy.db`, then run:

```bash
npm ci --omit=dev
pm2 restart stockeasy --update-env
```

Schema updates are additive and run automatically at startup.
