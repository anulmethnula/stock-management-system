# StockEasy production deployment

Target URL: `https://stock.supuncompanies.com`

The deployment ZIP contains a cleaned `database/stockeasy.db`: it keeps the existing active `admin` login and default categories, but contains no suppliers, products, customers, documents, stock, or history records. It contains no plain-text passwords, Git files, tests, or `node_modules`.

## 1. DNS

Create an `A` record named `stock` under `supuncompanies.com` pointing to the public IP address of the Node.js server.

## 2. Upload and install

Upload and extract the deployment ZIP to `/var/www/stockeasy`, then run:

```bash
cd /var/www/stockeasy
npm ci --omit=dev
sudo mkdir -p /var/lib/stockeasy
sudo chown -R "$USER":"$USER" /var/lib/stockeasy
cp database/stockeasy.db /var/lib/stockeasy/stockeasy.db
```

Copy `deployment.env.example` to `.env` and load those variables through the hosting panel or process manager. The included database already has the preserved administrator login, so the first-start admin variables are not used unless that database is removed. Never upload the completed `.env` publicly.

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

Open `https://stock.supuncompanies.com` and sign in with the same `admin` username and password used in the local system. Only its secure password hash is stored in the included SQLite database.

Administrators can download a consistent database snapshot from **Staff → Download Backup**. Also back up `/var/lib/stockeasy/stockeasy.db` regularly.

## Updating later

Back up the production database first. Replace the application files but keep `/var/lib/stockeasy/stockeasy.db`. For the product-ID/database update, stop the app and run the included idempotent migration file against the production database:

```bash
pm2 stop stockeasy
npm run migrate:hosting -- /var/lib/stockeasy/stockeasy.db
```

The migration creates a timestamped `.bak` file beside the database before changing anything. Keep that backup until the updated site has been checked. Then install production dependencies and restart:

```bash
npm ci --omit=dev
pm2 restart stockeasy --update-env
```

Schema updates are additive and run automatically at startup.
