import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "database");
const db = new Database(path.join(dir, "stockeasy.db"));
db.pragma("journal_mode = DELETE");
db.exec(fs.readFileSync(path.join(dir, "schema.sql"), "utf8"));

if (!db.prepare("SELECT COUNT(*) c FROM suppliers").get().c) {
  const today = new Date().toISOString().slice(0, 10);
  const sup = db.prepare("INSERT INTO suppliers(name,contact,phone) VALUES(?,?,?)");
  sup.run("Fresh Farm Foods", "Nimal Perera", "077 123 4567");
  sup.run("Island Packaging", "Kamala Silva", "071 555 0101");
  sup.run("CleanCo Supplies", "Ravi Fernando", "076 222 3344");
  const p = db.prepare("INSERT INTO products(name,emoji,supplier_id,unit,cost,stock,reorder) VALUES(?,?,?,?,?,?,?)");
  [["Rice 5kg bag","🍚",1,"bags",1450,40,15],["Fresh milk 1L","🥛",1,"packs",380,8,20],["Eggs tray (30)","🥚",1,"trays",1100,0,6],
   ["Paper bags","🛍️",2,"bundles",650,30,10],["Cardboard boxes","📦",2,"boxes",90,120,50],
   ["Dish soap","🧴",3,"bottles",420,12,12],["Tissue rolls","🧻",3,"packs",560,25,10]].forEach(r => p.run(...r));
  db.prepare("INSERT INTO purchase_orders(code,supplier_id,date) VALUES('PO-0001',1,?)").run(today);
  const i = db.prepare("INSERT INTO po_items(po_id,product_id,qty,cost) VALUES(1,?,?,?)");
  i.run(2, 40, 380); i.run(3, 12, 1100);
}
export default db;
