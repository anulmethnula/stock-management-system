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


## Bulk upload existing items and stock (Excel)

**Items → Bulk Upload Excel → Download Current Stock Template → Fill → Upload & Preview → Confirm.**

- Reuse the same 11-column Excel template for your **first migration** and **future item/stock counts**.
- The download includes currently active products, their Product IDs and available stock. Fill new items on blank rows with a **unique Item Code** and leave Product ID empty.
- Columns (in order): Product ID, Item Code, Item Name, Category, Supplier / Branch, Unit, Quantity, Unit Cost (Rs), Selling Price (Rs), Total Cost (Rs), Total Selling (Rs).
- Quantity means the **final available stock**, not stock to add. Example: current 100, Excel 120 → final 120. Calculated totals are for review only.
- Suppliers/branches must already exist in StockEasy and must be spelled as saved. Categories named in Excel are created/reactivated automatically.
- Preview shows new/updated/unchanged items, quantity differences and errors. Nothing is saved until the user checks the confirmation box and clicks Confirm.
- Import requires both **Items edit** and **Stock corrections edit** permissions. Every committed stock difference is recorded in history with a unique BULK reference.
- Repeat imports of the same reviewed inventory data are blocked; changed records after preview require a fresh preview. Existing products omitted from Excel are kept unchanged.
- Unused factory demo categories are archived automatically; categories still assigned to items are retained.
- For **future supplier purchases**, use **PO → GRN**, not Items bulk upload. GRN adds goods, while inventory bulk upload sets a final physical count.
- Back up the database and verify the Excel's quantities before your first real migration.


## Purchase Order (PO) Excel bulk request

- Use **Stock Requests → Create Purchase Order → Download latest PO template** after migrating or updating the Items catalogue. The downloaded workbook is generated from active products with their real Product ID, Item Code, Item Name, Category, Usual Supplier, Unit, Available Stock and Unit Cost.
- Purchase template columns: **Product ID | Item Code | Item Name | Category | Usual Supplier | Unit | Available Stock | Order Quantity | Unit Cost (Rs) | Total Cost (Rs)**.
- Choose the actual PO supplier in the StockEasy form. **Usual Supplier in Excel is for reference only**: a PO can request an item from a different branch.
- Enter new requested quantities in **column H**. Leave items you are not ordering blank. Review or change **Unit Cost (column I)**; Total Cost (column J) calculates automatically. Excel includes bordered rows, quantity/price validation and a How to Fill guide.
- Upload the sheet and review items before saving. Uploading does not create a PO until Save, and saving a PO **never changes current stock**. Stock increases only when actual GRN receipt is saved.
- Do not upload the 11-column Inventory Migration file into the PO importer; that file sets absolute physical stock counts and is handled under Items.
- PO import checks IDs, item codes and product details, rejects repeated products/invalid amounts, and supports at most **200 distinct items** per PO. If the catalogue changes, download a fresh PO template.


## Final workflow hardening (November 2026)

### Bulk Items migration
- Items → Bulk Upload Excel → Download template → Fill → Upload & Preview → Confirm.
- Detects when two spreadsheet rows map to the **same existing product**, even if one matches by Product ID and the other by Item Code. No changes are committed while errors exist.
- Items absent from an Excel file are **kept automatically**. When using a verified **complete** product list, staff can deliberately tick **Archive eligible missing items** in the preview. Only zero-stock, non-quarantined products with **no open PO, customer order or quotation** can be archived. The list is reviewed and audited; a partial update must never enable this option.
- A bulk stock count sets the **final** on-hand available quantity; it is not added to existing stock.

### Three different Excel operations
| Process | Purpose | When stock changes |
| --- | --- | --- |
| Items → Bulk Upload | New/updated items, current physical stock | After explicit migration confirmation, as a final count |
| Create PO → Download/Upload PO Excel | Request quantities from a supplier | **Not** when PO is saved |
| Receive PO → Download/Upload GRN Excel | Confirm actual received quantities | **Only when Save GRN is clicked** |

- GRN template is specific to the selected active PO and its current unreceived quantities. Fill **Receive Now (column I)**, upload, review and click Save GRN.
- An old GRN sheet is rejected when quantities or item details have changed. Partial receiving and Receive All still work.
- Stock reports calculate historical balances using SQL. Movement history is paged in 200-row groups. Downloaded reports are **real .xlsx files**, not HTML disguised as Excel.
- A movement-history export exceeding 50,000 rows asks for a narrower date range. Browser screens do not load the full movement ledger at login.

### Protect the live StockEasy domain with HTTPS

The app is a **Node/Express + SQLite server**. GitHub updates cannot, by themselves, install a certificate on your existing VPS. If StockEasy is hosted on your own Linux VPS, this repository provides `deploy/Caddyfile` as a Caddy automatic-HTTPS reverse-proxy example for `stock.supuncompanies.com`.

1. **Back up** your live `database/stockeasy.db` and existing server/proxy configuration before changing anything. Do not replace the live SQLite database with a local/test database.
2. Confirm the DNS A/AAAA records for `stock.supuncompanies.com` point to the public VPS, and that inbound TCP ports **80 and 443** reach it. If Nginx/Apache already manages the site, configure HTTPS there instead of running two proxies.
3. Install **Caddy** on the VPS if no proxy already handles HTTPS; use `deploy/Caddyfile` as `/etc/caddy/Caddyfile` after checking the configuration. Caddy obtains and renews TLS certificates automatically when DNS and port access are correct. Do not point Caddy at a public Node listener.
4. Run the app behind Caddy, bound **only to loopback**, with `STOCKEASY_HOST=127.0.0.1`, `PORT=3001`, `COOKIE_SECURE=1`, and `REQUIRE_HTTPS=1`. Use a system service, not a terminal session.
5. Test `https://stock.supuncompanies.com` for a valid padlock, `http://stock.supuncompanies.com` for an HTTPS redirect, and confirm login, uploads and downloads after TLS is enabled.
6. Never expose backend port 3001 publicly or put session tokens/admin passwords into source control. Store the live database persistently and back it up regularly.

**Important:** TLS is not considered fixed on the public website until the VPS proxy is configured and a real browser connection verifies the certificate. Code changes alone cannot make the currently insecure URL secure.
