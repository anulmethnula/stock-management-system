<p align="center"><img src="assets/stockeasy-banner.svg" alt="StockEasy" width="100%"></p>

<h2 align="center">📦 StockEasy — Supun Group Stock Management</h2>
<p align="center">A React application for managing goods from Supun branches to customer companies.</p>

<p align="center"><a href="https://stock.supuncompanies.com/"><b>Visit hosted StockEasy system</b></a></p>

## Project Overview

StockEasy brings purchasing, goods receiving, inventory, quotations, customer orders and deliveries into a connected workflow. It demonstrates business process modelling and practical application interfaces.

## 🔄 How it works
**Supun branch → PO (request) → GRN (receive) → Stock → Customer quotation → Approval → Customer order → Delivery**

- 🏢 **Branches:** Add, edit, remove or restore Supun branches.
- 📦 **Items:** Photos, stock alerts, buying/selling prices.
- 🧾 **PO + GRN:** Request from any branch; receive full or partial quantities.
- 📊 **Excel PO:** Download an item template, fill quantities, upload and review before saving.
- 🏬 **Customers:** Manage customer companies and orders.
- 💰 **Quotations:** Create price offers, record customer approval/rejection, print or save as PDF, and convert approved quotes into one customer order without changing stock.
- 🚚 **Deliveries:** Dispatch goods, reduce stock automatically, print delivery notes.
- ↩️ **Returns & corrections:** Reverse mistakes safely with stock history.
- 🔐 **Staff accounts:** Admin, staff and view-only access.
- 📱 **Simple UI:** Icons, gentle animations, mobile layout, light/dark mode.

## 🚀 Run locally
Install [Node.js 22](https://nodejs.org/). On Windows, double-click **`start.bat`** or run:

```bash
npm install
npm start
```

Open **http://localhost:3001**. On the first start, your **admin password appears in the terminal window**. Save it safely (username: `admin` unless changed).

For development: `npm run dev` · Build: `npm run build` · Test: `npm test`

## Technology

**Frontend:** React · Vite · Lucide Icons  
**Backend:** Express · SQLite

## Quality checks

```bash
npm run build
npm test
```

Use a local database or a separate test environment for development and testing.

> ⚠️ **Local-first project:** Back up `database/stockeasy.db` before updating. Existing PO/GRN data is kept when the database is upgraded. Old sample suppliers remain until you remove them. Do not expose this app directly to the internet without further security and deployment review.

<p align="center"><sub>Built with AI assistance · StockEasy for Supun Group</sub></p>
