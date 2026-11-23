import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const databaseArgument = process.argv[2];
if (!databaseArgument) {
  console.error("Usage: npm run migrate:hosting -- /absolute/path/to/stockeasy.db");
  process.exit(1);
}

const databasePath = path.resolve(databaseArgument);
if (!fs.existsSync(databasePath) || !fs.statSync(databasePath).isFile()) {
  console.error(`Database file not found: ${databasePath}`);
  process.exit(1);
}

const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const backupPath = `${databasePath}.before-host-migration-${timestamp}.bak`;
const escapeSqlString = value => value.replaceAll("'", "''");
const db = new DatabaseSync(databasePath);

try {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`VACUUM INTO '${escapeSqlString(backupPath)}'`);

  const productColumns = db.prepare("PRAGMA table_info(products)").all();
  if (!productColumns.some(column => column.name === "company_product_id")) {
    db.exec("ALTER TABLE products ADD COLUMN company_product_id TEXT");
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)");
    db.exec(`
      UPDATE products
      SET company_product_id = CAST(id AS TEXT)
      WHERE TRIM(COALESCE(company_product_id, '')) = ''
    `);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_product_id
      ON products(company_product_id COLLATE NOCASE)
      WHERE TRIM(COALESCE(company_product_id, '')) <> ''
    `);

    const legacyCategories = [
      "Helmets",
      "Electrical",
      "Safety gear",
      "Raw materials",
      "Packaging",
      "Tools",
      "Other"
    ];
    const categoryIsUsed = db.prepare(`
      SELECT 1 FROM products WHERE category = ? COLLATE NOCASE LIMIT 1
    `);
    const hideCategory = db.prepare(`
      UPDATE product_categories SET active = 0 WHERE name = ? COLLATE NOCASE
    `);
    for (const category of legacyCategories) {
      if (!categoryIsUsed.get(category)) hideCategory.run(category);
    }

    db.prepare("INSERT OR IGNORE INTO schema_migrations(name) VALUES(?)")
      .run("hosting-company-product-id-v1");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const integrity = db.prepare("PRAGMA integrity_check").get();
  const foreignKeyProblems = db.prepare("PRAGMA foreign_key_check").all();
  if (integrity.integrity_check !== "ok" || foreignKeyProblems.length) {
    throw new Error(
      `Verification failed (integrity: ${integrity.integrity_check}; foreign-key errors: ${foreignKeyProblems.length})`
    );
  }

  const productCount = db.prepare("SELECT COUNT(*) count FROM products").get().count;
  const migratedCount = db.prepare(`
    SELECT COUNT(*) count FROM products
    WHERE TRIM(COALESCE(company_product_id, '')) <> ''
  `).get().count;

  console.log("StockEasy hosting migration completed successfully.");
  console.log(`Database: ${databasePath}`);
  console.log(`Backup:   ${backupPath}`);
  console.log(`Products with company IDs: ${migratedCount}/${productCount}`);
} finally {
  db.close();
}
