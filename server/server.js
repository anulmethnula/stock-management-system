import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import db, { passwordHash, passwordMatches } from "./db.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};
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
const sessionsMs = 7 * 24 * 60 * 60 * 1000;
const attempts = new Map();
const FEATURES = ["dashboard","products","suppliers","customers","purchase_orders","goods_received","customer_orders","deliveries","stock_history","staff"];
const defaultPermissions = role => Object.fromEntries(FEATURES.map(feature => [feature, role === "admin" ? "edit" : role === "viewer" ? "view" : feature === "staff" ? "none" : "edit"]));
const cleanPermissions = (value, role = "staff") => {
  if (role === "admin") return defaultPermissions("admin");
  let source = value;
  if (typeof source === "string") { try { source = JSON.parse(source); } catch { source = {}; } }
  const fallback = defaultPermissions(role);
  return Object.fromEntries(FEATURES.map(feature => [feature, feature === "staff" ? "none" : ["none","view","edit"].includes(source?.[feature]) ? source[feature] : fallback[feature]]));
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
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions(token_hash,staff_id,expires_at) VALUES(?,?,?)")
      .run(tokenHash(token), user.id, Date.now() + sessionsMs);
    res.cookie(cookieName, token, {
      httpOnly: true, sameSite: "strict", path: "/", secure: process.env.COOKIE_SECURE === "1", maxAge: sessionsMs
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
  const returnLines = db.prepare("SELECT return_id,product_id pid,qty FROM return_lines").all();
  return {
    user: publicUser(req.user),
    branches: canSee("suppliers","products","purchase_orders","goods_received") ? db.prepare("SELECT id,name,contact,phone,phone2,location,notes,supplier_type,active FROM suppliers ORDER BY active DESC,name").all() : [],
    products: canSee("products","purchase_orders","goods_received","customer_orders","deliveries","stock_history") ? db.prepare("SELECT id,name,sku,category,emoji,image img,supplier_id sid,unit,cost,sale_price sell,stock,reorder,active FROM products ORDER BY active DESC,name").all() : [],
    customers: canSee("customers","customer_orders","deliveries") ? db.prepare("SELECT id,name,contact,phone,phone2,address,notes,customer_type,active FROM customers ORDER BY active DESC,name").all() : [],
    pos: canSee("purchase_orders","goods_received") ? db.prepare("SELECT id n,code id,supplier_id sid,date,status FROM purchase_orders ORDER BY n DESC").all()
      .map(o => ({ ...o, items: poItems.filter(i => i.po_id === o.n) }))
      : [],
    grns: canSee("goods_received") ? db.prepare('SELECT g.id n,g.code id,p.code poId,g.po_id poN,g.supplier_id sid,g.date,g.received_by "by",g.note,g.status FROM grns g JOIN purchase_orders p ON p.id=g.po_id ORDER BY g.id DESC').all()
      .map(g => ({ ...g, lines: grnLines.filter(l => l.grn_id === g.n) }))
      : [],
    orders: canSee("customer_orders","deliveries") ? db.prepare("SELECT id n,code id,customer_id cid,date,status,note FROM customer_orders ORDER BY n DESC").all()
      .map(o => ({ ...o, items: orderItems.filter(i => i.order_id === o.n) }))
      : [],
    deliveries: canSee("deliveries") ? db.prepare("SELECT id n,code id,order_id orderN,customer_id cid,date,delivered_by byName,note,status FROM deliveries ORDER BY n DESC").all()
      .map(d => ({ ...d, lines: deliveryLines.filter(l => l.delivery_id === d.n) }))
      : [],
    returns: canSee("deliveries") ? db.prepare("SELECT id n,code id,delivery_id deliveryN,customer_id cid,date,note,status FROM customer_returns ORDER BY n DESC").all()
      .map(r => ({ ...r, lines: returnLines.filter(l => l.return_id === r.n) }))
      : [],
    movements: canSee("stock_history") ? db.prepare("SELECT id,product_id pid,qty_change qty,event_type type,reference,note,actor,created_at at FROM stock_movements ORDER BY id DESC LIMIT 1000").all() : []
  };
}));

const logStock = (pid, change, type, ref, note, actor) => db.prepare(
  "INSERT INTO stock_movements(product_id,qty_change,event_type,reference,note,actor) VALUES(?,?,?,?,?,?)"
).run(pid, change, type, ref, note || "", actor || "System");
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
  const used = db.prepare("SELECT 1 FROM customer_orders WHERE customer_id=? LIMIT 1").get(id);
  if (used) db.prepare("UPDATE customers SET active=0 WHERE id=?").run(id);
  else db.prepare("DELETE FROM customers WHERE id=?").run(id);
  return { archived: !!used };
}));

function productFields(b) {
  const sid = ident(b.sid);
  check(find("suppliers", sid).active, "Choose an active branch.");
  const img = b.img && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.img) && b.img.length < 3000000 ? b.img : null;
  return [required(b.name, "item name"), str(b.sku, 60) || null, str(b.category, 40) || "Other", str(b.emoji, 8) || "📦", img, sid, required(b.unit, "unit", 40),
    money(b.cost, "Buying price"), money(b.sell ?? 0, "Selling price"), amount(b.reorder ?? 5, "Low-stock warning")];
}
app.post("/api/products", requireEdit("products"), run(req => transaction(() => {
  const b = req.body || {}, fields = productFields(b), opening = amount(b.stock ?? 0, "Opening stock");
  const info = db.prepare("INSERT INTO products(name,sku,category,emoji,image,supplier_id,unit,cost,sale_price,reorder,stock) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(...fields, opening);
  logStock(info.lastInsertRowid, opening, "Opening balance", "NEW ITEM", "Initial quantity", req.user.username);
  return { id: info.lastInsertRowid };
})));
app.put("/api/products/:id", requireEdit("products"), run(req => {
  const id = find("products", req.params.id).id, b = req.body || {};
  const fields = productFields(b);
  db.prepare("UPDATE products SET name=?,sku=?,category=?,emoji=?,image=?,supplier_id=?,unit=?,cost=?,sale_price=?,reorder=?,active=? WHERE id=?")
    .run(...fields, b.active === 0 ? 0 : 1, id);
  // Stock is deliberately not editable here. Use adjustment for an auditable change.
}));
app.delete("/api/products/:id", requireEdit("products"), run(req => {
  const id = find("products", req.params.id).id;
  const used = db.prepare("SELECT 1 FROM po_items WHERE product_id=? UNION SELECT 1 FROM customer_order_items WHERE product_id=? UNION SELECT 1 FROM stock_movements WHERE product_id=? LIMIT 1").get(id,id,id);
  if (used) db.prepare("UPDATE products SET active=0 WHERE id=?").run(id);
  else db.prepare("DELETE FROM products WHERE id=?").run(id);
  return { archived: !!used };
}));

function poPayload(b) {
  const sid = ident(b.sid);
  check(find("suppliers", sid).active, "Choose an active Supun branch.");
  const lines = validateLines(b.items, "order").map(l => ({ ...l, cost: money(l.cost ?? l.product.cost, "Buying price") }));
  return { sid, lines };
}
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

function orderPayload(b) {
  const cid = ident(b.cid);
  check(find("customers",cid).active, "Choose an active customer company.");
  const lines = validateLines(b.items,"customer order").map(l => ({...l,price:money(l.price ?? l.product.sale_price,"Selling price")}));
  return {cid,lines,note:str(b.note,1000)};
}
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
    changeStock(l.pid,l.qty);
    db.prepare("INSERT INTO return_lines(return_id,product_id,qty) VALUES(?,?,?)").run(id,l.pid,l.qty);
    logStock(l.pid,l.qty,"Customer return",document,note,req.user.username);
  }
  return {code:document};
})));
app.post("/api/returns/:id/reverse", requireEdit("deliveries"), run(req => transaction(() => {
  const ret = db.prepare("SELECT * FROM customer_returns WHERE id=?").get(ident(req.params.id));
  check(ret, "Return not found.", 404);
  check(ret.status === "Active", "This return is already reversed.", 409);
  const reason = required(req.body?.reason, "reason", 500);
  const lines = db.prepare("SELECT product_id pid,qty FROM return_lines WHERE return_id=?").all(ret.id);
  for (const l of lines) {
    changeStock(l.pid, -l.qty);
    logStock(l.pid, -l.qty, "Customer return reversed", ret.code, reason, req.user.username);
  }
  db.prepare("UPDATE customer_returns SET status='Reversed' WHERE id=?").run(ret.id);
  return { ok: true };
})));

app.post("/api/adjustments",requireEdit("stock_history"),run(req=>transaction(()=>{
  const pid=ident(req.body?.pid);
  const qty=Number(req.body?.change);
  check(Number.isSafeInteger(qty)&&qty!==0&&Math.abs(qty)<=100000000,"Enter a non-zero whole-number change.");
  const reason=required(req.body?.reason,"reason",500);
  changeStock(pid,qty);
  logStock(pid,qty,"Stock correction","ADJ",reason,req.user.username);
  return {ok:true};
})));

// Admin controls: no password hashes in responses; disable instead of deleting audit actors.
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
