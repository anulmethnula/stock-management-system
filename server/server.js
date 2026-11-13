import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "./db.js";

const app = express();
app.use(express.json({ limit: "8mb" }));
const pad = (p, n) => `${p}-${String(n).padStart(4, "0")}`;
const today = () => new Date().toISOString().slice(0, 10);

// Everything the screen needs, in one call
app.get("/api/all", (req, res) => {
  const items = db.prepare("SELECT po_id,product_id pid,qty,cost,received FROM po_items").all();
  const lines = db.prepare("SELECT grn_id,product_id pid,qty FROM grn_lines").all();
  res.json({
    suppliers: db.prepare("SELECT id,name,contact,phone FROM suppliers ORDER BY name").all(),
    products: db.prepare("SELECT id,name,emoji,image img,supplier_id sid,unit,cost,stock,reorder FROM products ORDER BY name").all(),
    pos: db.prepare("SELECT id n,code id,supplier_id sid,date,status FROM purchase_orders ORDER BY n DESC").all()
      .map(o => ({ ...o, items: items.filter(i => i.po_id === o.n) })),
    grns: db.prepare('SELECT g.id n,g.code id,p.code poId,g.supplier_id sid,g.date,g.received_by "by",g.note FROM grns g JOIN purchase_orders p ON p.id=g.po_id ORDER BY g.id DESC').all()
      .map(g => ({ ...g, lines: lines.filter(l => l.grn_id === g.n) })),
  });
});

const P = b => [b.name, b.emoji || "📦", b.img || null, b.sid, b.unit, Number(b.cost), Number(b.stock), Number(b.reorder)];
app.post("/api/products", (req, res) => {
  db.prepare("INSERT INTO products(name,emoji,image,supplier_id,unit,cost,stock,reorder) VALUES(?,?,?,?,?,?,?,?)").run(...P(req.body));
  res.json({ ok: true });
});
app.put("/api/products/:id", (req, res) => {
  db.prepare("UPDATE products SET name=?,emoji=?,image=?,supplier_id=?,unit=?,cost=?,stock=?,reorder=? WHERE id=?").run(...P(req.body), req.params.id);
  res.json({ ok: true });
});
app.post("/api/suppliers", (req, res) => {
  const b = req.body;
  db.prepare("INSERT INTO suppliers(name,contact,phone) VALUES(?,?,?)").run(b.name, b.contact, b.phone);
  res.json({ ok: true });
});
app.put("/api/suppliers/:id", (req, res) => {
  const b = req.body;
  db.prepare("UPDATE suppliers SET name=?,contact=?,phone=? WHERE id=?").run(b.name, b.contact, b.phone, req.params.id);
  res.json({ ok: true });
});

// Purchase order
app.post("/api/pos", (req, res) => {
  const { sid, items } = req.body;
  const code = db.transaction(() => {
    const id = db.prepare("INSERT INTO purchase_orders(code,supplier_id,date) VALUES('',?,?)").run(sid, today()).lastInsertRowid;
    const c = pad("PO", id);
    db.prepare("UPDATE purchase_orders SET code=? WHERE id=?").run(c, id);
    const ins = db.prepare("INSERT INTO po_items(po_id,product_id,qty,cost) VALUES(?,?,?,?)");
    items.forEach(i => ins.run(id, i.pid, i.qty, i.cost));
    return c;
  })();
  res.json({ code });
});

// Goods received note: adds to stock and updates the order
app.post("/api/pos/:id/receive", (req, res) => {
  const poId = Number(req.params.id);
  const { lines, note, by } = req.body;
  const code = db.transaction(() => {
    const po = db.prepare("SELECT * FROM purchase_orders WHERE id=?").get(poId);
    const gid = db.prepare("INSERT INTO grns(code,po_id,supplier_id,date,received_by,note) VALUES('',?,?,?,?,?)").run(poId, po.supplier_id, today(), by, note || "").lastInsertRowid;
    const c = pad("GRN", gid);
    db.prepare("UPDATE grns SET code=? WHERE id=?").run(c, gid);
    for (const l of lines) {
      const it = db.prepare("SELECT * FROM po_items WHERE po_id=? AND product_id=?").get(poId, l.pid);
      const q = Math.max(0, Math.min(Number(l.qty), it.qty - it.received)); // never more than ordered
      if (!q) continue;
      db.prepare("UPDATE po_items SET received=received+? WHERE id=?").run(q, it.id);
      db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(q, l.pid);
      db.prepare("INSERT INTO grn_lines(grn_id,product_id,qty) VALUES(?,?,?)").run(gid, l.pid, q);
    }
    const open = db.prepare("SELECT COUNT(*) c FROM po_items WHERE po_id=? AND received<qty").get(poId).c;
    db.prepare("UPDATE purchase_orders SET status=? WHERE id=?").run(open ? "Part received" : "Received", poId);
    return c;
  })();
  res.json({ code });
});

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
}
app.listen(3001, () => console.log("StockEasy running at http://localhost:3001"));
