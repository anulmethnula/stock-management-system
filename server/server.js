import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import db, { createDatabaseBackup, passwordHash, passwordMatches } from "./db.js";
import { buildPOTemplate, parsePOUpload, buildGRNTemplate, parseGRNUpload } from "./po-excel.js";
import { registerReportingRoutes } from "./reporting.js";
import { registerInventoryImportRoutes } from "./inventory-import.js";
import { registerQuotationRoutes } from "./quotations.js";

const app = express();
app.disable("x-powered-by");
// Trust only a reverse proxy on the local machine (e.g. Caddy on the VPS).
app.set("trust proxy","loopback");
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  if(req.secure)res.setHeader("Strict-Transport-Security","max-age=31536000");
  if(process.env.REQUIRE_HTTPS==="1"&&!req.secure){
    res.status(426).json({error:"HTTPS is required. Open https://stock.supuncompanies.com instead."});return;
  }
  next();
});
const today = () => new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
// SQLite stores UTC. Report and display dates use Sri Lanka's UTC+05:30 business day.
const localAt="datetime(created_at,'+330 minutes')";
const movementFields="id,product_id pid,qty_change qty,damaged_change damagedQty,event_type type,reference,note,actor,"+localAt+" at,created_at atUtc";
const code = (prefix, n) => `${prefix}-${String(n).padStart(4, "0")}`;
const fail = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
const check = (condition, message, status = 400) => { if (!condition) fail(message, status); };
const ident = v => { const n = Number(v); check(Number.isSafeInteger(n) && n > 0, "Invalid record number."); return n; };
const amount = (v, label = "Quantity", min = 0) => {
  const n = Number(v);
  check(Number.isSafeInteger(n) && n >= min && n <= 100000000, `${label} must be a whole number of at least ${min}.`);
  return n;
};
const money = (v, label = "Price") => {
  const n = Number(v);
  check(Number.isFinite(n) && n >= 0 && n <= 1e12, `${label} must be a valid positive amount.`);
  return Math.round(n * 100) / 100;
};
const str = (v, max = 255) => String(v ?? "").trim().slice(0, max);
const required = (v, label, max = 255) => { const s = str(v, max); check(s.length > 0, `Please enter ${label}.`); return s; };
const supplierType = v => { const type = str(v || "external", 20).toLowerCase(); check(["internal", "external"].includes(type), "Choose a valid supplier type."); return type; };
const find = (table, id) => {
  const allowed = ["suppliers", "products", "customers", "purchase_orders", "grns", "customer_orders", "deliveries", "staff"];
  check(allowed.includes(table), "Invalid record type.");
  const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(ident(id));
  check(row, "Record not found.", 404);
  return row;
};
const run = fn => (req, res) => {
  try { const result = fn(req); res.json(result ?? { ok: true }); }
  catch (e) {
    const code = e.status || (String(e.code || "").startsWith("SQLITE_CONSTRAINT") ? 409 : 500);
    if (code === 500) console.error("StockEasy error:", e);
    res.status(code).json({ error: code === 500 ? "Something went wrong. Please try again." : e.message });
  }
};
const transaction = fn => db.transaction(fn)();

// Sessions use httpOnly cookies and random tokens; only token hashes are stored.
const cookieName = "stockeasy_session";
const tokenHash = s => crypto.createHash("sha256").update(s).digest("hex");
const getCookie = req => (req.headers.cookie || "").split(";").map(s => s.trim()).find(s => s.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
const cookieOpts = req => `HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`;
const sessionMs = 7 * 24 * 60 * 60 * 1000;
const rememberedSessionMs = 30 * 24 * 60 * 60 * 1000;
const attempts = new Map();
const FEATURES = ["dashboard","products","suppliers","customers","purchase_orders","goods_received","customer_orders","quotations","deliveries","stock_history","reports","stock_adjustments","staff"];
const defaultPermissions = role => Object.fromEntries(FEATURES.map(feature => [feature, role === "admin" ? "edit" : feature === "stock_adjustments" || feature === "staff" ? "none" : role === "viewer" ? "view" : "edit"]));
const cleanPermissions = (value, role = "staff") => {
  if (role === "admin") return defaultPermissions("admin");
  let source = value;
  if (typeof source === "string") { try { source = JSON.parse(source); } catch { source = {}; } }
  const fallback = defaultPermissions(role);
  const custom=source&&Object.keys(source).length>0;
  return Object.fromEntries(FEATURES.map(feature => {
    let level=feature==="staff"?"none": ["none","view","edit"].includes(source?.[feature])?source[feature]:
      feature==="quotations"&&["none","view","edit"].includes(source?.customer_orders)?source.customer_orders:
      feature==="stock_adjustments"||feature==="reports"&&role==="staff"||custom?"none":fallback[feature];
    if(role==="viewer"&&level==="edit")level=feature==="stock_adjustments"?"none":"view";
    return [feature,level];
  }));
};
const publicUser = user => ({ id:user.id, username:user.username, role:user.role, permissions:cleanPermissions(user.permissions,user.role) });
app.post("/api/login", (req, res) => {
  try {
    const username = required(req.body?.username, "username", 80);
    const ip = req.ip || "unknown";
    const attempt = attempts.get(ip);
    if (attempt && attempt.until > Date.now() && attempt.count >= 10) fail("Too many attempts. Try again in 15 minutes.", 429);
    const user = db.prepare("SELECT * FROM staff WHERE username=? COLLATE NOCASE AND active=1").get(username);
    if (!user || !passwordMatches(String(req.body?.password || ""), user.password_hash)) {
      const count = (attempt?.until > Date.now() ? attempt.count : 0) + 1;
      attempts.set(ip, { count, until: Date.now() + 15 * 60 * 1000 });
      fail("Incorrect username or password.", 401);
    }
    attempts.delete(ip);
    const remember = req.body?.remember === true;
    const maxAge = remember ? rememberedSessionMs : sessionMs;
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions(token_hash,staff_id,expires_at) VALUES(?,?,?)")
      .run(tokenHash(token), user.id, Date.now() + maxAge);
    res.cookie(cookieName, token, {
      httpOnly: true, sameSite: "strict", path: "/", secure: process.env.COOKIE_SECURE === "1" || req.secure, maxAge
    });
    res.json({ user: publicUser(user) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : "Login failed." });
  }
});

app.use("/api", (req, res, next) => {
  const raw = getCookie(req);
  const session = raw && /^[a-f0-9]{64}$/.test(raw) ?
    db.prepare("SELECT s.token_hash,u.id,u.username,u.role,u.permissions,u.active FROM sessions s JOIN staff u ON u.id=s.staff_id WHERE s.token_hash=? AND s.expires_at>?").get(tokenHash(raw), Date.now()) : null;
  if (!session || !session.active) return res.status(401).json({ error: "Please log in to continue." });
  req.user = session;
  next();
});
const editor = (req, res, next) => req.user.role === "viewer" ? res.status(403).json({ error: "Your account has view-only access." }) : next();
const admin = (req, res, next) => req.user.role !== "admin" ? res.status(403).json({ error: "Only an admin can do this." }) : next();
const requireEdit = feature => (req,res,next) => cleanPermissions(req.user.permissions,req.user.role)[feature] === "edit" ? next() : res.status(403).json({ error:`You do not have edit access to ${feature.replaceAll("_"," ")}.` });
app.get("/api/session", run(req => ({ user: publicUser(req.user) })));
app.post("/api/logout", run(req => {
  const token = getCookie(req);
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
  return { ok: true };
}));
// Single page load: include linked documents and their lines, but never password hashes.
app.get("/api/all", run(req => {
  const permissions=cleanPermissions(req.user.permissions,req.user.role);
  const canSee=(...features)=>features.some(feature=>permissions[feature]!=="none");
  const poItems = db.prepare("SELECT po_id,product_id pid,qty,cost,received FROM po_items").all();
  const grnLines = db.prepare("SELECT grn_id,product_id pid,qty FROM grn_lines").all();
  const orderItems = db.prepare("SELECT order_id,product_id pid,qty,price,dispatched FROM customer_order_items").all();
  const deliveryLines = db.prepare("SELECT delivery_id,product_id pid,qty FROM delivery_lines").all();
  const returnLines = db.prepare("SELECT return_id,product_id pid,qty,condition FROM return_lines").all();
  const supplierReturnLines = db.prepare("SELECT return_id,product_id pid,qty FROM supplier_return_lines").all();
  return {
    user: publicUser(req.user),
    branches: canSee("suppliers","products","purchase_orders","goods_received","reports") ? db.prepare("SELECT id,name,contact,phone,phone2,location,notes,supplier_type,active FROM suppliers ORDER BY active DESC,name").all() : [],
    products: canSee("products","purchase_orders","goods_received","customer_orders","quotations","deliveries","stock_history","stock_adjustments","reports") ? db.prepare("SELECT id,name,sku,category,emoji,image img,supplier_id sid,unit,cost,sale_price sell,stock,damaged_stock damagedStock,reorder,active FROM products ORDER BY active DESC,name").all() : [],
    categories: canSee("products","reports") ? db.prepare("SELECT id,name,active FROM product_categories ORDER BY active DESC,name COLLATE NOCASE").all() : [],
    customers: canSee("customers","customer_orders","quotations","deliveries","reports") ? db.prepare("SELECT id,name,contact,phone,phone2,address,notes,customer_type,active FROM customers ORDER BY active DESC,name").all() : [],
    pos: canSee("purchase_orders","goods_received","reports") ? db.prepare("SELECT id n,code id,supplier_id sid,date,status FROM purchase_orders ORDER BY n DESC").all()
      .map(o => ({ ...o, items: poItems.filter(i => i.po_id === o.n) }))
      : [],
    grns: canSee("goods_received","reports") ? db.prepare('SELECT g.id n,g.code id,p.code poId,g.po_id poN,g.supplier_id sid,g.date,g.received_by "by",g.note,g.status FROM grns g JOIN purchase_orders p ON p.id=g.po_id ORDER BY g.id DESC').all()
      .map(g => ({ ...g, lines: grnLines.filter(l => l.grn_id === g.n) }))
      : [],
    supplierReturns: canSee("goods_received","reports") ? db.prepare('SELECT r.id n,r.code id,r.grn_id grnN,g.code grnId,r.supplier_id sid,r.date,r.reason_type reasonType,r.note,r.returned_by "by",r.status FROM supplier_returns r JOIN grns g ON g.id=r.grn_id ORDER BY r.id DESC').all()
      .map(r => ({ ...r, lines: supplierReturnLines.filter(l => l.return_id === r.n) }))
      : [],
    quotations: canSee("quotations","reports") ? db.prepare("SELECT id n,code id,customer_id cid,customer_name customerName,customer_address customerAddress,date,valid_until validUntil,status,note,converted_order_id convertedN FROM customer_quotations ORDER BY id DESC").all()
      .map(q=>({...q,items:db.prepare("SELECT product_id pid,item_name name,item_code sku,item_unit unit,qty,price FROM quotation_items WHERE quotation_id=? ORDER BY id").all(q.n),
        actions:db.prepare("SELECT action,actor,note,created_at at FROM quotation_actions WHERE quotation_id=? ORDER BY id").all(q.n)})) : [],
    orders: canSee("customer_orders","deliveries","reports") ? db.prepare("SELECT id n,code id,customer_id cid,date,status,note FROM customer_orders ORDER BY n DESC").all()
      .map(o => ({ ...o, items: orderItems.filter(i => i.order_id === o.n) }))
      : [],
    deliveries: canSee("deliveries","reports") ? db.prepare("SELECT id n,code id,order_id orderN,customer_id cid,date,delivered_by byName,note,status FROM deliveries ORDER BY n DESC").all()
      .map(d => ({ ...d, lines: deliveryLines.filter(l => l.delivery_id === d.n) }))
      : [],
    returns: canSee("deliveries","reports") ? db.prepare("SELECT r.id n,r.code id,r.delivery_id deliveryN,r.customer_id cid,r.date,r.note,r.status,(SELECT m.actor FROM stock_movements m WHERE m.reference=r.code AND m.event_type=\'Customer return\' LIMIT 1) byName FROM customer_returns r ORDER BY r.id DESC").all()
      .map(r => ({ ...r, lines: returnLines.filter(l => l.return_id === r.n) }))
      : [],
    movements: canSee("stock_history","reports") ? db.prepare("SELECT "+movementFields+" FROM stock_movements ORDER BY id DESC LIMIT 1000").all() : [],
    // Historical reports now request SQL aggregates or paginated movements separately.
    reportMovements: [],
    dashboardChart: canSee("dashboard") ? db.prepare("SELECT date("+localAt+") day, SUM(CASE WHEN event_type IN ('Goods received','GRN reversed') THEN qty_change ELSE 0 END) received, SUM(CASE WHEN event_type IN ('Delivered to customer','Delivery reversed') THEN -qty_change ELSE 0 END) delivered FROM stock_movements WHERE created_at>=datetime('now','-12 months','-2 days') GROUP BY day ORDER BY day").all() : [],
    dashboardCounts: canSee("dashboard") ? {
      items:db.prepare("SELECT COUNT(*) n FROM products WHERE active=1").get().n,
      low:db.prepare("SELECT COUNT(*) n FROM products WHERE active=1 AND stock<=reorder").get().n,
      pending:db.prepare("SELECT COUNT(*) n FROM purchase_orders WHERE status IN ('Ordered','Part received')").get().n,
      orders:db.prepare("SELECT COUNT(*) n FROM customer_orders WHERE status IN ('Open','Part dispatched')").get().n
    } : null
  };
}));

const logStock = (pid, change, type, ref, note, actor, damagedChange=0) => db.prepare(
  "INSERT INTO stock_movements(product_id,qty_change,event_type,reference,note,actor,damaged_change) VALUES(?,?,?,?,?,?,?)"
).run(pid, change, type, ref, note || "", actor || "System", damagedChange);
function changeDamaged(pid,delta){
  const p=find("products",pid);
  check(p.damaged_stock+delta>=0,"Not enough quarantined stock for "+p.name+".",409);
  db.prepare("UPDATE products SET damaged_stock=damaged_stock+? WHERE id=?").run(delta,pid);
}
app.get("/api/stock-history",run(req=>{
  check(cleanPermissions(req.user.permissions,req.user.role).stock_history!=="none","No stock history access.",403);
  const where=[],params=[];
  const add=(sql,...values)=>{where.push(sql);params.push(...values);};
  const q=str(req.query.q,120).toLowerCase();
  if(q)add("instr(lower(p.name||' '||COALESCE(p.sku,'')||' '||m.reference||' '||m.actor||' '||m.note),?)>0",q);
  if(req.query.pid&&req.query.pid!=="all")add("m.product_id=?",ident(req.query.pid));
  const dateValue=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""))?String(v):"";
  const from=dateValue(req.query.from),to=dateValue(req.query.to);
  if(from)add("m.created_at>=datetime(?,'-330 minutes')",from);
  if(to)add("m.created_at<datetime(?,'+1 day','-330 minutes')",to);
  check(!from||!to||from<=to,"Choose a valid date range.");
  const group="CASE WHEN event_type LIKE '%reversed%' THEN 'Reversal' WHEN event_type='Goods received' THEN 'GRN' WHEN event_type LIKE 'Supplier return%' THEN 'Supplier Return' WHEN event_type LIKE 'Customer return%' THEN 'Customer Return' WHEN event_type='Delivered to customer' THEN 'Delivery' WHEN event_type LIKE 'Quarantine%' THEN 'Quarantine' ELSE 'Adjustment' END";
  if(req.query.type&&req.query.type!=="all")add("("+group+")=?",str(req.query.type,40));
  if(req.query.direction==="in")add("m.qty_change>0");
  if(req.query.direction==="out")add("m.qty_change<0");
  if(req.query.direction==="quarantine")add("m.damaged_change<>0");
  const source=" FROM stock_movements m JOIN products p ON p.id=m.product_id"+(where.length?" WHERE "+where.join(" AND "):"");
  const totals=db.prepare("SELECT COUNT(*) records,COALESCE(SUM(CASE WHEN m.qty_change>0 THEN m.qty_change ELSE 0 END),0) stockIn,COALESCE(SUM(CASE WHEN m.qty_change<0 THEN -m.qty_change ELSE 0 END),0) stockOut,COALESCE(SUM(CASE WHEN ("+group+")='Adjustment' THEN 1 ELSE 0 END),0) adjustments"+source).get(...params);
  const pageSize=10,page=Math.max(1,Math.min(Math.ceil(totals.records/pageSize)||1,Number.parseInt(req.query.page,10)||1));
  const rows=db.prepare("SELECT m.id,m.product_id pid,m.qty_change qty,m.damaged_change damagedQty,m.event_type type,m.reference,m.note,m.actor,datetime(m.created_at,'+330 minutes') at,m.created_at atUtc"+source+" ORDER BY m.id DESC LIMIT ? OFFSET ?").all(...params,pageSize,(page-1)*pageSize);
  return {rows,totals,page,pageSize};
}));
function changeStock(pid, delta) {
  const p = find("products", pid);
  check(p.stock + delta >= 0, `Not enough stock for ${p.name}. Available: ${p.stock}.`, 409);
  db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(delta, pid);
}
function validateLines(lines, kind, key = "pid") {
  check(Array.isArray(lines) && lines.length > 0 && lines.length <= 200, "Add at least one item (maximum 200).");
  const ids = new Set();
  return lines.map(line => {
    const pid = ident(line[key]);
    check(!ids.has(pid), "The same item was added twice.");
    ids.add(pid);
    const p = find("products", pid);
    check(p.active || ["receiving","dispatch","return"].includes(kind), `${p.name} is archived.`);
    return { pid, qty: amount(line.qty, "Quantity", 1), product: p, cost: line.cost, price: line.price };
  });
}
function recalcPO(poId) {
  const sums = db.prepare("SELECT SUM(qty) qty,SUM(received) received FROM po_items WHERE po_id=?").get(poId);
  const po = find("purchase_orders", poId);
  const cancelled = ["Cancelled", "Part cancelled"].includes(po.status);
  const status = cancelled ? (sums.received ? "Part cancelled" : "Cancelled") :
    sums.received >= sums.qty ? "Received" : sums.received > 0 ? "Part received" : "Ordered";
  db.prepare("UPDATE purchase_orders SET status=? WHERE id=?").run(status, poId);
}
function recalcOrder(orderId) {
  const sums = db.prepare("SELECT SUM(qty) qty,SUM(dispatched) dispatched FROM customer_order_items WHERE order_id=?").get(orderId);
  const order = find("customer_orders", orderId);
  const cancelled = ["Cancelled", "Part cancelled"].includes(order.status);
  const status = cancelled ? (sums.dispatched ? "Part cancelled" : "Cancelled") :
    sums.dispatched >= sums.qty ? "Dispatched" : sums.dispatched > 0 ? "Part dispatched" : "Open";
  db.prepare("UPDATE customer_orders SET status=? WHERE id=?").run(status, orderId);
}

// Suppliers may be internal Supun locations or external businesses. Archive rather than lose past documents.
app.post("/api/branches", requireEdit("suppliers"), run(req => {
  const b = req.body || {};
  const info = db.prepare("INSERT INTO suppliers(name,contact,phone,phone2,location,notes,supplier_type) VALUES(?,?,?,?,?,?,?)")
    .run(required(b.name, "supplier name"), str(b.contact), str(b.phone, 40), str(b.phone2, 40), str(b.location, 300), str(b.notes, 1000), supplierType(b.supplier_type));
  return { id: info.lastInsertRowid };
}));
app.put("/api/branches/:id", requireEdit("suppliers"), run(req => {
  const branch = find("suppliers", req.params.id);
  const b = req.body || {};
  db.prepare("UPDATE suppliers SET name=?,contact=?,phone=?,phone2=?,location=?,notes=?,supplier_type=?,active=? WHERE id=?")
    .run(required(b.name, "supplier name"), str(b.contact), str(b.phone, 40), str(b.phone2, 40), str(b.location, 300), str(b.notes, 1000), supplierType(b.supplier_type), b.active === 0 ? 0 : 1, branch.id);
}));
app.delete("/api/branches/:id", requireEdit("suppliers"), run(req => {
  const id = find("suppliers", req.params.id).id;
  const used = db.prepare("SELECT 1 FROM products WHERE supplier_id=? UNION SELECT 1 FROM purchase_orders WHERE supplier_id=? LIMIT 1").get(id, id);
  if (used) db.prepare("UPDATE suppliers SET active=0 WHERE id=?").run(id);
  else db.prepare("DELETE FROM suppliers WHERE id=?").run(id);
  return { archived: !!used };
}));

app.post("/api/customers", requireEdit("customers"), run(req => {
  const b = req.body || {};
  const info = db.prepare("INSERT INTO customers(name,contact,phone,phone2,address,notes,customer_type) VALUES(?,?,?,?,?,?,?)")
    .run(required(b.name, "company name"), str(b.contact), str(b.phone, 40), str(b.phone2, 40), str(b.address, 500), str(b.notes, 1000), supplierType(b.customer_type));
  return { id: info.lastInsertRowid };
}));
app.put("/api/customers/:id", requireEdit("customers"), run(req => {
  const id = find("customers", req.params.id).id, b = req.body || {};
  db.prepare("UPDATE customers SET name=?,contact=?,phone=?,phone2=?,address=?,notes=?,customer_type=?,active=? WHERE id=?")
    .run(required(b.name, "company name"), str(b.contact), str(b.phone, 40), str(b.phone2, 40), str(b.address, 500), str(b.notes, 1000), supplierType(b.customer_type), b.active === 0 ? 0 : 1, id);
}));
app.delete("/api/customers/:id", requireEdit("customers"), run(req => {
  const id = find("customers", req.params.id).id;
  const used = db.prepare("SELECT 1 FROM customer_orders WHERE customer_id=? UNION SELECT 1 FROM customer_quotations WHERE customer_id=? LIMIT 1").get(id,id);
  if (used) db.prepare("UPDATE customers SET active=0 WHERE id=?").run(id);
  else db.prepare("DELETE FROM customers WHERE id=?").run(id);
  return { archived: !!used };
}));

function productFields(b) {
  const sid = ident(b.sid);
  check(find("suppliers", sid).active, "Choose an active branch.");
  const category=required(b.category,"category",40);
  check(db.prepare("SELECT 1 FROM product_categories WHERE name=? COLLATE NOCASE AND active=1").get(category),"Choose an active category.",409);
  const img = b.img && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.img) && b.img.length < 3000000 ? b.img : null;
  return [required(b.name, "item name"), required(b.sku, "item code", 60), category, str(b.emoji, 8) || "📦", img, sid, required(b.unit, "unit", 40),
    money(b.cost, "Buying price"), money(b.sell ?? 0, "Selling price"), amount(b.reorder ?? 5, "Low-stock warning")];
}
app.post("/api/products", requireEdit("products"), run(req => transaction(() => {
  const b = req.body || {}, fields = productFields(b), opening = amount(b.stock ?? 0, "Opening stock");
  check(!db.prepare("SELECT 1 FROM products WHERE sku=? COLLATE NOCASE LIMIT 1").get(fields[1]),
    "Item Code already exists. Edit the existing item instead.",409);
  check(!db.prepare("SELECT 1 FROM products WHERE name=? COLLATE NOCASE AND supplier_id=? LIMIT 1").get(fields[0],fields[5]),
    "This product already exists for the selected supplier. Edit the existing item instead.",409);
  check(!opening||cleanPermissions(req.user.permissions,req.user.role).stock_adjustments==="edit","Opening stock requires stock correction permission.",403);
  const info = db.prepare("INSERT INTO products(name,sku,category,emoji,image,supplier_id,unit,cost,sale_price,reorder,stock) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(...fields, opening);
  logStock(info.lastInsertRowid, opening, "Opening balance", "NEW ITEM", "Initial quantity", req.user.username);
  return { id: info.lastInsertRowid };
})));
app.put("/api/products/:id", requireEdit("products"), run(req => {
  const id = find("products", req.params.id).id, b = req.body || {};
  const fields = productFields(b);
  check(!db.prepare("SELECT 1 FROM products WHERE sku=? COLLATE NOCASE AND id<>? LIMIT 1").get(fields[1],id),
    "Item Code already belongs to another product.",409);
  check(!db.prepare("SELECT 1 FROM products WHERE name=? COLLATE NOCASE AND supplier_id=? AND id<>? LIMIT 1").get(fields[0],fields[5],id),
    "This product already exists for the selected supplier.",409);
  db.prepare("UPDATE products SET name=?,sku=?,category=?,emoji=?,image=?,supplier_id=?,unit=?,cost=?,sale_price=?,reorder=?,active=? WHERE id=?")
    .run(...fields, b.active === 0 ? 0 : 1, id);
  // Stock is deliberately not editable here. Use adjustment for an auditable change.
}));
app.delete("/api/products/:id", requireEdit("products"), run(req => {
  const id = find("products", req.params.id).id;
  const used = db.prepare("SELECT 1 FROM po_items WHERE product_id=? UNION SELECT 1 FROM customer_order_items WHERE product_id=? UNION SELECT 1 FROM quotation_items WHERE product_id=? UNION SELECT 1 FROM stock_movements WHERE product_id=? LIMIT 1").get(id,id,id,id);
  if (used) db.prepare("UPDATE products SET active=0 WHERE id=?").run(id);
  else db.prepare("DELETE FROM products WHERE id=?").run(id);
  return { archived: !!used };
}));

app.post("/api/categories",requireEdit("products"),run(req=>{
  const name=required(req.body?.name,"category name",40);
  check(!db.prepare("SELECT 1 FROM product_categories WHERE name=? COLLATE NOCASE").get(name),"A category with this name already exists.",409);
  const id=db.prepare("INSERT INTO product_categories(name) VALUES(?)").run(name).lastInsertRowid;
  return {id,name};
}));
app.put("/api/categories/:id",requireEdit("products"),run(req=>transaction(()=>{
  const id=ident(req.params.id),current=db.prepare("SELECT * FROM product_categories WHERE id=?").get(id);
  check(current,"Category not found.",404);
  const name=required(req.body?.name??current.name,"category name",40),active=req.body?.active===0?0:1;
  check(!db.prepare("SELECT 1 FROM product_categories WHERE name=? COLLATE NOCASE AND id<>?").get(name,id),"A category with this name already exists.",409);
  if(!active)check(!db.prepare("SELECT 1 FROM products WHERE category=? COLLATE NOCASE LIMIT 1").get(current.name),"Reassign items in this category before archiving it.",409);
  db.prepare("UPDATE product_categories SET name=?,active=? WHERE id=?").run(name,active,id);
  if(name!==current.name)db.prepare("UPDATE products SET category=? WHERE category=? COLLATE NOCASE").run(name,current.name);
  return {id,name,active};
})));
app.delete("/api/categories/:id",requireEdit("products"),run(req=>transaction(()=>{
  const id=ident(req.params.id),current=db.prepare("SELECT * FROM product_categories WHERE id=?").get(id);
  check(current,"Category not found.",404);
  check(!db.prepare("SELECT 1 FROM products WHERE category=? COLLATE NOCASE LIMIT 1").get(current.name),"Reassign items in this category before deleting it.",409);
  db.prepare("DELETE FROM product_categories WHERE id=?").run(id);
  return {deleted:true};
})));

function poPayload(b) {
  const sid = ident(b.sid);
  check(find("suppliers", sid).active, "Choose an active Supun branch.");
  const existing=Array.isArray(b.items)?b.items:[],fresh=Array.isArray(b.newItems)?b.newItems:[];
  check(existing.length+fresh.length>0&&existing.length+fresh.length<=200,"Add at least one item (maximum 200).");
  const lines = existing.length?validateLines(existing, "order").map(l => ({ ...l, cost: money(l.cost ?? l.product.cost, "Buying price") })):[];
  const seenCodes=new Set(lines.map(l=>String(l.product.sku||"").trim().toLocaleLowerCase("en")));
  const seenNames=new Set(lines.map(l=>String(l.product.name).trim().toLocaleLowerCase("en")));
  for(const raw of fresh){
    const sku=required(raw.sku,"item code",60),name=required(raw.name,"item name"),category=required(raw.category,"category",40),unit=required(raw.unit,"unit",40);
    const key=sku.toLocaleLowerCase("en"),nameKey=name.toLocaleLowerCase("en"),qty=amount(raw.qty,"Quantity",1),cost=money(raw.cost,"Buying price");
    check(!seenCodes.has(key),"The same Item Code was added twice.");seenCodes.add(key);
    check(!seenNames.has(nameKey),"The same product was added twice.");seenNames.add(nameKey);
    check(!db.prepare("SELECT 1 FROM products WHERE sku=? COLLATE NOCASE").get(sku),"Item Code "+sku+" already exists. Upload a fresh PO template.",409);
    check(!db.prepare("SELECT 1 FROM products WHERE name=? COLLATE NOCASE AND supplier_id=?").get(name,sid),"Product "+name+" already exists for this supplier.",409);
    const savedCategory=db.prepare("SELECT id,active FROM product_categories WHERE name=? COLLATE NOCASE").get(category);
    if(!savedCategory)db.prepare("INSERT INTO product_categories(name) VALUES(?)").run(category);
    else if(!savedCategory.active)db.prepare("UPDATE product_categories SET active=1 WHERE id=?").run(savedCategory.id);
    const pid=db.prepare("INSERT INTO products(name,sku,category,emoji,supplier_id,unit,cost,sale_price,stock,reorder) VALUES(?,?,?,'📦',?,?,?,0,0,5)")
      .run(name,sku,category,sid,unit,cost).lastInsertRowid;
    lines.push({pid,qty,cost,product:find("products",pid)});
  }
  return { sid, lines };
}
// Bulk entry: download a real .xlsx workbook, then preview an uploaded workbook.
// Import never changes stock and never creates a PO until the user confirms the order.
app.get("/api/po-template", (req,res) => {
  const access=cleanPermissions(req.user.permissions,req.user.role).purchase_orders;
  if(access==="none") return res.status(403).json({error:"You do not have access to purchase orders."});
  try {
    const products=db.prepare("SELECT p.id,p.sku,p.name,p.category,p.unit,p.stock,p.cost,s.name supplierName FROM products p JOIN suppliers s ON s.id=p.supplier_id WHERE p.active=1 ORDER BY p.category COLLATE NOCASE,p.name COLLATE NOCASE,p.id").all();
    const workbook=buildPOTemplate(products);
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",'attachment; filename="StockEasy_PO_Template.xlsx"');
    res.setHeader("Cache-Control","no-store");
    res.send(workbook);
  } catch(error) {
    console.error("Excel template error:",error);
    res.status(500).json({error:"Could not create the template. Please try again."});
  }
});
app.post("/api/po-import", requireEdit("purchase_orders"),
  express.raw({type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",limit:"4mb"}),
  run(req=>{
    check(Buffer.isBuffer(req.body)&&req.body.length>0,"Please select a .xlsx file to upload.");
    const products=db.prepare("SELECT id,sku,name,category,unit,active,cost FROM products").all();
    const items=parsePOUpload(req.body,products);
    if(req.query.sid!==undefined){
      const sid=ident(req.query.sid);check(find("suppliers",sid).active,"Choose an active supplier before uploading.");
      const names=new Set();
      for(const item of items.filter(x=>x.isNew)){
        const key=item.name.trim().toLocaleLowerCase("en");
        check(!names.has(key),"New product '"+item.name+"' is entered more than once.",422);names.add(key);
        check(!db.prepare("SELECT 1 FROM products WHERE name=? COLLATE NOCASE AND supplier_id=?").get(item.name,sid),
          "Product '"+item.name+"' already exists for the selected supplier with another Item Code.",422);
      }
    }
    return {items,count:items.length,newCount:items.filter(x=>x.isNew).length,existingCount:items.filter(x=>!x.isNew).length,total:items.reduce((n,l)=>n+l.qty*l.cost,0)};
  })
);
app.post("/api/pos", requireEdit("purchase_orders"), run(req => transaction(() => {
  const { sid, lines } = poPayload(req.body || {});
  const id = db.prepare("INSERT INTO purchase_orders(code,supplier_id,date) VALUES('',?,?)").run(sid, today()).lastInsertRowid;
  const document = code("PO", id);
  db.prepare("UPDATE purchase_orders SET code=? WHERE id=?").run(document, id);
  const insert = db.prepare("INSERT INTO po_items(po_id,product_id,qty,cost) VALUES(?,?,?,?)");
  lines.forEach(l => insert.run(id,l.pid,l.qty,l.cost));
  return { code: document };
})));
app.put("/api/pos/:id", requireEdit("purchase_orders"), run(req => transaction(() => {
  const po = find("purchase_orders", req.params.id);
  check(po.status === "Ordered", "Only orders with no deliveries can be edited.", 409);
  const { sid, lines } = poPayload(req.body || {});
  db.prepare("DELETE FROM po_items WHERE po_id=?").run(po.id);
  db.prepare("UPDATE purchase_orders SET supplier_id=? WHERE id=?").run(sid,po.id);
  const insert = db.prepare("INSERT INTO po_items(po_id,product_id,qty,cost) VALUES(?,?,?,?)");
  lines.forEach(l => insert.run(po.id,l.pid,l.qty,l.cost));
  return { code: po.code };
})));
app.delete("/api/pos/:id", requireEdit("purchase_orders"), run(req => {
  const po = find("purchase_orders", req.params.id);
  check(!["Cancelled","Part cancelled","Received"].includes(po.status), "This order cannot be cancelled.", 409);
  const n = db.prepare("SELECT SUM(received) n FROM po_items WHERE po_id=?").get(po.id).n || 0;
  db.prepare("UPDATE purchase_orders SET status=? WHERE id=?").run(n ? "Part cancelled" : "Cancelled", po.id);
  return { ok: true };
}));
// GRN Excel is only a prepared selection. The normal Save GRN API remains
// the only place that increases real inventory.
const grnExcelLines=poId=>db.prepare("SELECT p.id,p.sku,p.name,p.category,p.unit,li.qty ordered,li.received FROM po_items li JOIN products p ON p.id=li.product_id WHERE li.po_id=? ORDER BY p.category COLLATE NOCASE,p.name COLLATE NOCASE").all(poId);
app.get("/api/pos/:id/grn-template",requireEdit("goods_received"),(req,res)=>{
  try {
    const po=find("purchase_orders",req.params.id);
    check(["Ordered","Part received"].includes(po.status),"This PO is not open for receiving.",409);
    const supplier=find("suppliers",po.supplier_id);
    const buffer=buildGRNTemplate({code:po.code,supplierName:supplier.name},grnExcelLines(po.id));
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",'attachment; filename="StockEasy_'+po.code+'_GRN.xlsx"');
    res.setHeader("Cache-Control","no-store");res.send(buffer);
  }catch(e){res.status(e.status||500).json({error:e.status?e.message:"Could not create the GRN template."});}
});
app.post("/api/pos/:id/grn-import",requireEdit("goods_received"),
  express.raw({type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",limit:"4mb"}),
  run(req=>{
    const po=find("purchase_orders",req.params.id);
    check(["Ordered","Part received"].includes(po.status),"This PO is not open for receiving.",409);
    check(Buffer.isBuffer(req.body)&&req.body.length>0,"Upload a GRN .xlsx file.");
    let lines;try{lines=parseGRNUpload(req.body,po,grnExcelLines(po.id));}
    catch(e){e.status=e.status||422;throw e;}
    return {poCode:po.code,lines,count:lines.length,total:lines.reduce((n,l)=>n+l.qty,0)};
  })
);
app.post("/api/pos/:id/receive", requireEdit("goods_received"), run(req => transaction(() => {
  const po = find("purchase_orders", req.params.id);
  check(["Ordered","Part received"].includes(po.status), "This purchase order is not open.", 409);
  const lines = validateLines(req.body?.lines, "receiving");
  const inspected = lines.map(l => {
    const poItem = db.prepare("SELECT * FROM po_items WHERE po_id=? AND product_id=?").get(po.id,l.pid);
    check(poItem, "This product was not ordered.", 409);
    check(l.qty <= poItem.qty - poItem.received, `Only ${poItem.qty - poItem.received} units of ${l.product.name} are still expected.`, 409);
    return { ...l, itemId: poItem.id };
  });
  const by = required(req.body?.by || req.user.username, "received by", 100);
  const id = db.prepare("INSERT INTO grns(code,po_id,supplier_id,date,received_by,note) VALUES('',?,?,?,?,?)")
    .run(po.id,po.supplier_id,today(),by,str(req.body?.note, 1000)).lastInsertRowid;
  const document = code("GRN",id);
  db.prepare("UPDATE grns SET code=? WHERE id=?").run(document,id);
  for (const l of inspected) {
    db.prepare("UPDATE po_items SET received=received+? WHERE id=?").run(l.qty,l.itemId);
    changeStock(l.pid,l.qty);
    db.prepare("INSERT INTO grn_lines(grn_id,product_id,qty) VALUES(?,?,?)").run(id,l.pid,l.qty);
    logStock(l.pid,l.qty,"Goods received",document,`From ${po.code}`,req.user.username);
  }
  recalcPO(po.id);
  return { code: document };
})));
app.post("/api/grns/:id/reverse", requireEdit("goods_received"), run(req => transaction(() => {
  const grn = find("grns", req.params.id);
  check(grn.status === "Active", "This GRN is already reversed.", 409);
  check(!db.prepare("SELECT 1 FROM supplier_returns WHERE grn_id=? AND status='Active' LIMIT 1").get(grn.id),
    "This GRN has active supplier returns. Reverse those GRTNs before reversing the GRN.",409);
  const lines = db.prepare("SELECT product_id pid,qty FROM grn_lines WHERE grn_id=?").all(grn.id);
  for (const l of lines) {
    changeStock(l.pid,-l.qty);
    db.prepare("UPDATE po_items SET received=received-? WHERE po_id=? AND product_id=?").run(l.qty,grn.po_id,l.pid);
    logStock(l.pid,-l.qty,"GRN reversed",grn.code,required(req.body?.reason,"reason",500),req.user.username);
  }
  db.prepare("UPDATE grns SET status='Reversed' WHERE id=?").run(grn.id);
  recalcPO(grn.po_id);
  return { ok: true };
})));

app.post("/api/supplier-returns", requireEdit("goods_received"), run(req => transaction(() => {
  const grn=find("grns",req.body?.grnN);
  check(grn.status==="Active","Only an active GRN can be returned to its supplier.",409);
  const reasonType=str(req.body?.reasonType,30);
  check(["damaged","defective","wrong_item","other"].includes(reasonType),"Choose a valid return reason.");
  const note=str(req.body?.note,500);
  if(reasonType==="other")check(note.length>0,"Enter the return reason when Other is selected.");
  const lines=validateLines(req.body?.lines,"return");
  const validated=lines.map(l=>{
    const original=db.prepare("SELECT qty FROM grn_lines WHERE grn_id=? AND product_id=?").get(grn.id,l.pid);
    check(original,"That product was not received on this GRN.",409);
    const previous=db.prepare("SELECT COALESCE(SUM(srl.qty),0) n FROM supplier_return_lines srl JOIN supplier_returns sr ON sr.id=srl.return_id WHERE sr.grn_id=? AND sr.status='Active' AND srl.product_id=?").get(grn.id,l.pid).n;
    const remaining=original.qty-previous;
    check(l.qty<=remaining,`Only ${remaining} units of ${l.product.name} remain returnable from this GRN.`,409);
    check(l.qty<=l.product.stock,`Only ${l.product.stock} units of ${l.product.name} are currently available in stock.`,409);
    return l;
  });
  const returnedBy=str(req.body?.by||req.user.username,100)||req.user.username;
  const id=db.prepare("INSERT INTO supplier_returns(code,grn_id,supplier_id,date,reason_type,note,returned_by) VALUES('',?,?,?,?,?,?)")
    .run(grn.id,grn.supplier_id,today(),reasonType,note,returnedBy).lastInsertRowid;
  const document=code("GRTN",id);
  db.prepare("UPDATE supplier_returns SET code=? WHERE id=?").run(document,id);
  for(const l of validated){
    changeStock(l.pid,-l.qty);
    db.prepare("INSERT INTO supplier_return_lines(return_id,product_id,qty) VALUES(?,?,?)").run(id,l.pid,l.qty);
    logStock(l.pid,-l.qty,"Supplier return",document,`${reasonType.replace("_"," ")} · From ${grn.code}${note?` · ${note}`:""}`,req.user.username);
  }
  return {code:document};
})));
app.post("/api/supplier-returns/:id/reverse", requireEdit("goods_received"), run(req => transaction(() => {
  const ret=db.prepare("SELECT * FROM supplier_returns WHERE id=?").get(ident(req.params.id));
  check(ret,"Supplier return not found.",404);
  check(ret.status==="Active","This supplier return is already reversed.",409);
  const reason=required(req.body?.reason,"reason",500);
  const lines=db.prepare("SELECT product_id pid,qty FROM supplier_return_lines WHERE return_id=?").all(ret.id);
  for(const l of lines){changeStock(l.pid,l.qty);logStock(l.pid,l.qty,"Supplier return reversed",ret.code,reason,req.user.username);}
  db.prepare("UPDATE supplier_returns SET status='Reversed' WHERE id=?").run(ret.id);
  return {ok:true};
})));

function orderPayload(b) {
  const cid = ident(b.cid);
  check(find("customers",cid).active, "Choose an active customer company.");
  const lines = validateLines(b.items,"customer order").map(l => ({...l,price:money(l.price ?? l.product.sale_price,"Selling price")}));
  return {cid,lines,note:str(b.note,1000)};
}
registerQuotationRoutes(app, { db, requireEdit, run, transaction, find, ident, required, str, money, validateLines, today, code, check });
app.post("/api/customer-orders", requireEdit("customer_orders"), run(req => transaction(() => {
  const {cid,lines,note}=orderPayload(req.body || {});
  const id=db.prepare("INSERT INTO customer_orders(code,customer_id,date,note) VALUES('',?,?,?)").run(cid,today(),note).lastInsertRowid;
  const document=code("CO",id);
  db.prepare("UPDATE customer_orders SET code=? WHERE id=?").run(document,id);
  const insert=db.prepare("INSERT INTO customer_order_items(order_id,product_id,qty,price) VALUES(?,?,?,?)");
  lines.forEach(l=>insert.run(id,l.pid,l.qty,l.price));
  return {code:document};
})));
app.put("/api/customer-orders/:id", requireEdit("customer_orders"), run(req => transaction(() => {
  const order=find("customer_orders",req.params.id);
  check(!db.prepare("SELECT 1 FROM customer_quotations WHERE converted_order_id=?").get(order.id),
    "Orders created from approved quotations cannot be edited. Create a separate order for changes.",409);
  check(order.status==="Open","Only customer orders with no dispatch can be edited.",409);
  const {cid,lines,note}=orderPayload(req.body || {});
  db.prepare("DELETE FROM customer_order_items WHERE order_id=?").run(order.id);
  db.prepare("UPDATE customer_orders SET customer_id=?,note=? WHERE id=?").run(cid,note,order.id);
  const insert=db.prepare("INSERT INTO customer_order_items(order_id,product_id,qty,price) VALUES(?,?,?,?)");
  lines.forEach(l=>insert.run(order.id,l.pid,l.qty,l.price));
  return {code:order.code};
})));
app.delete("/api/customer-orders/:id",requireEdit("customer_orders"),run(req=>{
  const order=find("customer_orders",req.params.id);
  check(!["Cancelled","Part cancelled","Dispatched"].includes(order.status),"This order cannot be cancelled.",409);
  const shipped=db.prepare("SELECT SUM(dispatched) n FROM customer_order_items WHERE order_id=?").get(order.id).n||0;
  db.prepare("UPDATE customer_orders SET status=? WHERE id=?").run(shipped?"Part cancelled":"Cancelled",order.id);
}));
app.post("/api/customer-orders/:id/dispatch",requireEdit("deliveries"),run(req=>transaction(()=>{
  const order=find("customer_orders",req.params.id);
  check(["Open","Part dispatched"].includes(order.status),"This customer order is not open.",409);
  const lines=validateLines(req.body?.lines,"dispatch");
  const validated=lines.map(l=>{
    const orderLine=db.prepare("SELECT * FROM customer_order_items WHERE order_id=? AND product_id=?").get(order.id,l.pid);
    check(orderLine,"This product is not on the customer order.",409);
    check(l.qty<=orderLine.qty-orderLine.dispatched,`Only ${orderLine.qty-orderLine.dispatched} units of ${l.product.name} remain to send.`,409);
    check(l.qty<=l.product.stock,`Not enough stock for ${l.product.name}. Available: ${l.product.stock}.`,409);
    return {...l,lineId:orderLine.id};
  });
  const id=db.prepare("INSERT INTO deliveries(code,order_id,customer_id,date,delivered_by,note) VALUES('',?,?,?,?,?)")
    .run(order.id,order.customer_id,today(),str(req.body?.by||req.user.username,100),str(req.body?.note,1000)).lastInsertRowid;
  const document=code("DN",id);
  db.prepare("UPDATE deliveries SET code=? WHERE id=?").run(document,id);
  for(const l of validated){
    changeStock(l.pid,-l.qty);
    db.prepare("UPDATE customer_order_items SET dispatched=dispatched+? WHERE id=?").run(l.qty,l.lineId);
    db.prepare("INSERT INTO delivery_lines(delivery_id,product_id,qty) VALUES(?,?,?)").run(id,l.pid,l.qty);
    logStock(l.pid,-l.qty,"Delivered to customer",document,`From ${order.code}`,req.user.username);
  }
  recalcOrder(order.id);
  return {code:document};
})));
app.post("/api/deliveries/:id/reverse",requireEdit("deliveries"),run(req=>transaction(()=>{
  const delivery=find("deliveries",req.params.id);
  check(delivery.status==="Active","This delivery is already reversed.",409);
  check(!db.prepare("SELECT 1 FROM customer_returns WHERE delivery_id=? AND status='Active' LIMIT 1").get(delivery.id),
    "This delivery has customer returns. Please contact an admin before reversing it.",409);
  const reason=required(req.body?.reason,"reason",500);
  const lines=db.prepare("SELECT product_id pid,qty FROM delivery_lines WHERE delivery_id=?").all(delivery.id);
  for(const l of lines){
    changeStock(l.pid,l.qty);
    db.prepare("UPDATE customer_order_items SET dispatched=dispatched-? WHERE order_id=? AND product_id=?").run(l.qty,delivery.order_id,l.pid);
    logStock(l.pid,l.qty,"Delivery reversed",delivery.code,reason,req.user.username);
  }
  db.prepare("UPDATE deliveries SET status='Reversed' WHERE id=?").run(delivery.id);
  recalcOrder(delivery.order_id);
})));
app.post("/api/returns",requireEdit("deliveries"),run(req=>transaction(()=>{
  const delivery=find("deliveries",req.body?.deliveryN);
  check(delivery.status==="Active","This delivery cannot accept returns.",409);
  const lines=validateLines(req.body?.lines,"return");
  const validated=lines.map(l=>{
    const original=db.prepare("SELECT qty FROM delivery_lines WHERE delivery_id=? AND product_id=?").get(delivery.id,l.pid);
    check(original,"That product was not in the delivery.",409);
    const previous=db.prepare("SELECT COALESCE(SUM(rl.qty),0) n FROM return_lines rl JOIN customer_returns r ON r.id=rl.return_id WHERE r.delivery_id=? AND r.status='Active' AND rl.product_id=?").get(delivery.id,l.pid).n;
    check(l.qty<=original.qty-previous,`Only ${original.qty-previous} units of ${l.product.name} can be returned.`,409);
    return l;
  });
  const note=required(req.body?.note,"return reason",500);
  const id=db.prepare("INSERT INTO customer_returns(code,delivery_id,customer_id,date,note) VALUES('',?,?,?,?)")
    .run(delivery.id,delivery.customer_id,today(),note).lastInsertRowid;
  const document=code("RTN",id);
  db.prepare("UPDATE customer_returns SET code=? WHERE id=?").run(document,id);
  for(const l of validated){
    const condition=req.body.lines.find(x=>Number(x.pid)===l.pid)?.condition;
    check(["sellable","quarantine"].includes(condition),"Choose the inspected condition for each returned item.");
    const quarantined=condition==="quarantine";
    if(quarantined)changeDamaged(l.pid,l.qty);else changeStock(l.pid,l.qty);
    db.prepare("INSERT INTO return_lines(return_id,product_id,qty,condition) VALUES(?,?,?,?)").run(id,l.pid,l.qty,condition);
    logStock(l.pid,quarantined?0:l.qty,"Customer return",document,note+" · "+condition,req.user.username,quarantined?l.qty:0);
  }
  return {code:document};
})));
app.post("/api/returns/:id/reverse", requireEdit("deliveries"), run(req => transaction(() => {
  const ret = db.prepare("SELECT * FROM customer_returns WHERE id=?").get(ident(req.params.id));
  check(ret, "Return not found.", 404);
  check(ret.status === "Active", "This return is already reversed.", 409);
  const reason = required(req.body?.reason, "reason", 500);
  const lines = db.prepare("SELECT product_id pid,qty,condition FROM return_lines WHERE return_id=?").all(ret.id);
  for (const l of lines) {
    const quarantined=l.condition==="quarantine";
    if(quarantined)changeDamaged(l.pid,-l.qty);else changeStock(l.pid,-l.qty);
    logStock(l.pid,quarantined?0:-l.qty,"Customer return reversed",ret.code,reason,req.user.username,quarantined?-l.qty:0);
  }
  db.prepare("UPDATE customer_returns SET status='Reversed' WHERE id=?").run(ret.id);
  return { ok: true };
})));

app.post("/api/adjustments",requireEdit("stock_adjustments"),run(req=>transaction(()=>{
  const pid=ident(req.body?.pid);
  const qty=Number(req.body?.change);
  check(Number.isSafeInteger(qty)&&qty!==0&&Math.abs(qty)<=100000000,"Enter a non-zero whole-number change.");
  const reason=required(req.body?.reason,"reason",500);
  changeStock(pid,qty);
  logStock(pid,qty,"Stock correction","ADJ",reason,req.user.username);
  return {ok:true};
})));

app.post("/api/quarantine",requireEdit("stock_adjustments"),run(req=>transaction(()=>{
  const pid=ident(req.body?.pid),qty=amount(req.body?.qty,"Quantity",1);
  const mode=str(req.body?.mode,20),reason=required(req.body?.reason,"inspection reason",500);
  check(["release","dispose","hold"].includes(mode),"Choose a quarantine action.");
  if(mode==="hold"){changeStock(pid,-qty);changeDamaged(pid,qty);}
  else{changeDamaged(pid,-qty);if(mode==="release")changeStock(pid,qty);}
  logStock(pid,mode==="release"?qty:mode==="hold"?-qty:0,"Quarantine "+mode,"QA",reason,req.user.username,mode==="hold"?qty:-qty);
  return {ok:true};
})));

 registerInventoryImportRoutes(app,{db,express,requireEdit,run,transaction,check,changeStock,logStock});
 registerReportingRoutes(app,{db,express,check,cleanPermissions,movementFields});
// Admin controls: no password hashes in responses; disable instead of deleting audit actors.
app.get("/api/admin/database-backup",admin,(req,res)=>{
  const stamp=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date()).replaceAll(":","-").replace(" ","_");
  const filename=`StockEasy_Backup_${stamp}.db`,temporary=path.join(os.tmpdir(),`stockeasy-${crypto.randomUUID()}.db`);
  try{
    createDatabaseBackup(temporary);
    res.setHeader("Cache-Control","no-store");
    res.download(temporary,filename,error=>{
      fs.rm(temporary,{force:true},()=>{});
      if(error&&!res.headersSent)res.status(500).json({error:"Could not download the database backup."});
    });
  }catch(error){
    fs.rm(temporary,{force:true},()=>{});
    console.error("Database backup error:",error);
    res.status(500).json({error:"Could not create the database backup."});
  }
});
app.get("/api/staff",admin,run(()=>({ staff:db.prepare("SELECT id,username,role,permissions,active FROM staff ORDER BY active DESC,username").all().map(user=>({...user,permissions:cleanPermissions(user.permissions,user.role)})) })));
const validRole=r=>{check(["admin","staff","viewer"].includes(r),"Choose a valid staff role.");return r;};
app.post("/api/staff",admin,run(req=>{
  const b=req.body||{}, username=required(b.username,"username",80), password=String(b.password||"");
  check(password.length>=8,"Password must be at least 8 characters.");
  const role=validRole(b.role||"staff"), permissions=JSON.stringify(cleanPermissions(b.permissions,role));
  const info=db.prepare("INSERT INTO staff(username,password_hash,role,permissions) VALUES(?,?,?,?)")
    .run(username,passwordHash(password),role,permissions);
  return {id:info.lastInsertRowid};
}));
app.put("/api/staff/:id",admin,run(req=>transaction(()=>{
  const u=find("staff",req.params.id), b=req.body||{}, role=validRole(b.role||u.role);
  const active=b.active===0?0:1;
  const remaining=db.prepare("SELECT COUNT(*) n FROM staff WHERE role='admin' AND active=1 AND id<>?").get(u.id).n;
  check(!(u.role==="admin" && u.active && (role!=="admin"||!active) && remaining===0),"You must keep at least one active admin.",409);
  const permissions=JSON.stringify(cleanPermissions(b.permissions??u.permissions,role));
  db.prepare("UPDATE staff SET username=?,role=?,permissions=?,active=? WHERE id=?")
    .run(required(b.username,"username",80),role,permissions,active,u.id);
  if(b.password){
    check(String(b.password).length>=8,"Password must be at least 8 characters.");
    db.prepare("UPDATE staff SET password_hash=? WHERE id=?").run(passwordHash(String(b.password)),u.id);
    db.prepare("DELETE FROM sessions WHERE staff_id=?").run(u.id);
  }
  if(!active) db.prepare("DELETE FROM sessions WHERE staff_id=?").run(u.id);
})));
app.delete("/api/staff/:id",admin,run(req=>{
  const u=find("staff",req.params.id);
  check(u.id!==req.user.id,"You cannot disable your own account.",409);
  if(u.role==="admin"&&u.active){
    const other=db.prepare("SELECT COUNT(*) n FROM staff WHERE role='admin' AND active=1 AND id<>?").get(u.id).n;
    check(other>0,"You must keep at least one active admin.",409);
  }
  db.prepare("UPDATE staff SET active=0 WHERE id=?").run(u.id);
  db.prepare("DELETE FROM sessions WHERE staff_id=?").run(u.id);
  return {archived:true};
}));

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"..");
const dist=path.join(root,"dist");
if(fs.existsSync(dist)){
  app.use(express.static(dist));
  app.get("*",(req,res)=>res.sendFile(path.join(dist,"index.html")));
}
const host=process.env.STOCKEASY_HOST||"127.0.0.1";
const port=Number(process.env.PORT||3001);
app.listen(port,host,()=>console.log(`StockEasy running at http://${host}:${port}`));
