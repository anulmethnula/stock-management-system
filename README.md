<p align="center">
  <img src="assets/stockeasy-banner.svg" alt="StockEasy — stock management, made simple: PO → GRN → Stock" width="100%" />
</p>

<p align="center">
  <strong>A clear, visual stock management system for small teams.</strong><br />
  Create purchase orders, receive goods, and follow your stock — without complicated screens.
</p>

<p align="center">
  <img alt="React 18" src="https://img.shields.io/badge/React-18-149eca?logo=react&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Express-4-30363d?logo=express&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-local%20database-2877a8?logo=sqlite&logoColor=white" />
  <img alt="Project status: prototype" src="https://img.shields.io/badge/Status-Prototype-f1a93b" />
</p>

> **Project status:** Working prototype for learning and local testing. It is **not ready for public or production use**: there is no user login, role control, or complete stock movement history yet.

## 📦 What is StockEasy?

StockEasy helps a business see **what it has**, **what it needs to order**, and **what has arrived**. It is designed for staff who may not know technical stock-management terms. The current version works well with a small number of suppliers.

| Screen | What you can do |
| --- | --- |
| 🏠 **Home** | See stock totals, low-stock alerts, and open orders. |
| 📦 **Items** | Add/edit items, use emojis or upload photos, set costs and low-stock levels. |
| 🚚 **Suppliers** | Add/edit supplier names and contact details. |
| 🧾 **Orders (PO)** | Create purchase orders, see totals, and check orders waiting for goods. |
| ✅ **Received (GRN)** | Record deliveries and see what was received. |

Other details already in the code: responsive mobile navigation, light/dark mode, Lucide icons, small animations, searchable items, partial deliveries, and basic PO printing.

## 🔄 The everyday workflow

```text
1. Create a PO (Purchase Order)
   = Tell a supplier what you want to buy.
               ↓
2. Supplier delivers the goods
   = Count what really arrived.
               ↓
3. Save a GRN (Goods Received Note)
   = Record the goods received.
               ↓
4. Stock updates automatically
   = Only the received quantity is added.
```

**Example:** You order **20 boxes** in a PO. The supplier brings **12 boxes**. You save a GRN for **12**. Your stock increases by **12** and the PO keeps **8 boxes** pending. You can receive the remaining boxes later.

### PO vs GRN, in simple words

- **PO = What you asked for.** Making a PO does **not** increase stock.
- **GRN = What actually came.** Saving a GRN **does** increase stock.
- **Low-stock warning = Time to order more.** A product is flagged when its stock reaches or falls below the warning amount.

## 🚀 Run it on your computer

**You need:** [Node.js LTS](https://nodejs.org/) installed.

**Windows (easy way):** Double-click `start.bat` in the project folder. It installs packages and starts the app.

**Terminal (Windows, macOS, Linux):**

```bash
npm install
npm start
```

Open **http://localhost:3001** in your browser.

**For development:**

```bash
npm install
npm run dev
```

The API runs on **port 3001** and the Vite development site on **http://localhost:5173**.

## 🗂️ How it is built

| Part | Technology | Purpose |
| --- | --- | --- |
| Interface | React 18 + Vite | Pages, forms, and user-friendly interactions |
| Visuals | Lucide React + CSS | Icons, responsive layout, and animations |
| Server | Node.js + Express | PO, GRN, supplier, and product actions |
| Data | SQLite (`better-sqlite3`) | Saves items, suppliers, orders, and goods received |

```text
src/                 React interface and styling
server/              API and SQLite setup
database/schema.sql  Database tables
database/stockeasy.db Local database (includes demo data in the current repo)
assets/              README banner
start.bat            Simple Windows starter
```

### 💾 Your data and backups

Records are saved in `database/stockeasy.db` on the computer running the server. **Back up this file** when the app is stopped, and keep backups private. The current project can create sample suppliers/items when the supplier table is empty.

**Important:** The current repository already includes a database file, built output, and `node_modules`. These should be cleaned up before normal team development. Never commit real customer, supplier, or business records to a public repository. Deleting the database file removes stored data.

## 🛠️ What needs improvement before real business use

- 🔐 **Login and permissions:** protect the system and restrict who can edit or receive stock.
- 📤 **Stock-out records:** track items used, sold, transferred, or damaged — not only goods coming in.
- 🧾 **Full movement history:** record who changed stock, when, how much, and why; avoid silent manual stock edits.
- 🛡️ **Stronger checks:** validate quantities and supplier/product matches on the server, handle errors clearly, and prevent incorrect or duplicate receipts.
- 🔁 **Corrections and approvals:** support controlled PO changes/cancellations and GRN corrections or returns.
- 📊 **Reports and exports:** useful stock movement reports and properly formatted printable documents.
- 🧪 **Testing and release setup:** automated tests, clean Git tracking, backups, and a safe deployment plan.

These are **planned improvements**, not features claimed to be finished.

---

<p align="center">
  Built with React, Express and SQLite · Developed with assistance from Claude AI<br />
  <strong>StockEasy — simpler stock management for everyday work.</strong>
</p>
