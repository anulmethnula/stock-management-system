import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "database");
fs.mkdirSync(dir, { recursive: true });
const databasePath = path.resolve(process.env.STOCKEASY_DB_PATH || path.join(dir, "stockeasy.db"));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
// Node's SQLite module avoids native C++ builds on Windows.
const sqlite = new DatabaseSync(databasePath);
const db = {
  prepare(sql) { return sqlite.prepare(sql); },
  exec(sql) { return sqlite.exec(sql); },
  pragma(sql) {
    if (sql.includes("=")) { sqlite.exec("PRAGMA " + sql); return; }
    return sqlite.prepare("PRAGMA " + sql).all();
  },
  transaction(fn) {
    return (...args) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = fn(...args);
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    };
  }
};
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(dir, "schema.sql"), "utf8"));

// Additive migration: older StockEasy installations retain all existing PO/GRN data.
function addColumn(table, name, definition) {
  const has = db.pragma(`table_info(${table})`).some(col => col.name === name);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}
addColumn("suppliers", "location", "TEXT DEFAULT ''");
addColumn("suppliers", "phone2", "TEXT DEFAULT ''");
addColumn("suppliers", "notes", "TEXT DEFAULT ''");
addColumn("suppliers", "supplier_type", "TEXT NOT NULL DEFAULT 'external'");
addColumn("suppliers", "active", "INTEGER NOT NULL DEFAULT 1");
addColumn("customers", "phone2", "TEXT DEFAULT ''");
addColumn("customers", "notes", "TEXT DEFAULT ''");
addColumn("customers", "customer_type", "TEXT NOT NULL DEFAULT 'external'");
addColumn("products", "sku", "TEXT");
addColumn("products", "category", "TEXT NOT NULL DEFAULT 'Other'");
addColumn("products", "sale_price", "REAL NOT NULL DEFAULT 0");
addColumn("products", "active", "INTEGER NOT NULL DEFAULT 1");
addColumn("grns", "status", "TEXT NOT NULL DEFAULT 'Active'");
addColumn("staff", "permissions", "TEXT NOT NULL DEFAULT '{}'");

// Replace the original grocery demo catalogue with factory-relevant examples.
const legacyProducts = [
  ["Rice 5kg bag", "Safety helmet shell", "HEL-SHELL-001", "Helmets", "🪖", "pieces"],
  ["Fresh milk 1L", "Copper wire 2.5mm", "ELE-WIRE-25", "Electrical", "🔌", "rolls"],
  ["Eggs tray (30)", "32A circuit breaker", "ELE-MCB-32", "Electrical", "⚡", "pieces"],
  ["Paper bags", "Helmet chin strap", "HEL-STRAP-001", "Helmets", "🧵", "bundles"],
  ["Cardboard boxes", "Helmet packaging box", "PKG-BOX-001", "Packaging", "📦", "boxes"],
  ["Dish soap", "Clear helmet visor", "HEL-VISOR-CLR", "Helmets", "🥽", "pieces"],
  ["Tissue rolls", "Cut-resistant safety gloves", "PPE-GLOVE-001", "Safety gear", "🧤", "pairs"]
];
for (const [oldName, name, sku, category, emoji, unit] of legacyProducts) {
  db.prepare("UPDATE products SET name=?,sku=?,category=?,emoji=?,unit=?,image=NULL WHERE name=?").run(name, sku, category, emoji, unit, oldName);
}
db.prepare("UPDATE products SET category='Helmets' WHERE sku LIKE 'HEL-%' AND category='Other'").run();
db.prepare("UPDATE products SET category='Electrical' WHERE sku LIKE 'ELE-%' AND category='Other'").run();
db.prepare("UPDATE products SET category='Packaging' WHERE sku LIKE 'PKG-%' AND category='Other'").run();
db.prepare("UPDATE products SET category='Safety gear' WHERE sku LIKE 'PPE-%' AND category='Other'").run();

export function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
export function passwordMatches(password, encoded) {
  if (typeof encoded !== "string" || !encoded.includes(":")) return false;
  const [salt, expectedHex] = encoded.split(":");
  if (!/^[a-f\d]{32}$/i.test(salt) || !/^[a-f\d]{128}$/i.test(expectedHex)) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
}

// Existing stock becomes an opening balance. The old GRNs remain unchanged.
db.transaction(() => {
  for (const p of db.prepare("SELECT id,stock FROM products").all()) {
    if (!db.prepare("SELECT 1 FROM stock_movements WHERE product_id=? LIMIT 1").get(p.id)) {
      db.prepare("INSERT INTO stock_movements(product_id,qty_change,event_type,reference,note) VALUES(?,?, 'Opening balance', 'MIGRATION', 'Existing balance when history tracking began')")
        .run(p.id, p.stock);
    }
  }
})();

if (!db.prepare("SELECT 1 FROM staff LIMIT 1").get()) {
  const user = (process.env.STOCKEASY_ADMIN_USER || "admin").trim();
  const password = process.env.STOCKEASY_ADMIN_PASSWORD || crypto.randomBytes(12).toString("base64url");
  if (password.length < 8) throw new Error("STOCKEASY_ADMIN_PASSWORD must have at least 8 characters.");
  db.prepare("INSERT INTO staff(username,password_hash,role) VALUES(?,?,'admin')").run(user, passwordHash(password));
  console.log("\n==============================================");
  console.log(" StockEasy first-time ADMIN login");
  console.log(" Username:", user);
  console.log(" Password:", password);
  console.log(" Save this password securely. It is shown once.");
  console.log("==============================================\n");
}
export default db;
