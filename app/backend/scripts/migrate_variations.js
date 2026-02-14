// Migration script to create product_variations table if missing
const path = require("path");
const os = require("os");

const dbDirectory = path.join(os.homedir(), "Documents", "RestaurantPOS");
const dbPath = path.join(dbDirectory, "pos.db");

const sqlite3 = require("sqlite3").verbose();
const database = new sqlite3.Database(dbPath);

console.log("Checking/Creating product_variations table...");

database.serialize(() => {
  database.run(
    `
    CREATE TABLE IF NOT EXISTS product_variations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL DEFAULT 0,
      cost_price REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `,
    (err) => {
      if (err) {
        console.error("Error creating table:", err.message);
      } else {
        console.log("product_variations table created (or already exists)");
      }
    },
  );
});

setTimeout(() => {
  console.log("Done!");
  database.close();
}, 1000);
