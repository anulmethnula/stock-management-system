import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "database");
fs.mkdirSync(dir, { recursive: true });
const databasePath = path.resolve(process.env.STOCKEASY_DB_PATH || path.join(dir, "stockeasy.db"));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(dir, "schema.sql"), "utf8"));

// Additive migration: older StockEasy installations retain all existing PO/GRN data.
function addColumn(table, name, definition) {
  const has = db.pragma(`table_info(${table})`).some(col => col.name === name);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}
addColumn("suppliers", "location", "TEXT DEFAULT ''");
addColumn("suppliers", "active", "INTEGER NOT NULL DEFAULT 1");
addColumn("products", "sku", "TEXT");
addColumn("products", "sale_price", "REAL NOT NULL DEFAULT 0");
addColumn("products", "active", "INTEGER NOT NULL DEFAULT 1");
addColumn("grns", "status", "TEXT NOT NULL DEFAULT 'Active'");

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
