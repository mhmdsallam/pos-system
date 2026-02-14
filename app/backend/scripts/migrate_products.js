// Migration script to add missing columns to products table
const path = require("path");
const os = require("os");

const dbDirectory = path.join(os.homedir(), "Documents", "RestaurantPOS");
const dbPath = path.join(dbDirectory, "pos.db");

const sqlite3 = require("sqlite3").verbose();
const database = new sqlite3.Database(dbPath);

console.log("Running migration...");

database.serialize(() => {
  // Add branch_id column
  database.run(`ALTER TABLE products ADD COLUMN branch_id INTEGER`, (err) => {
    if (err && !err.message.includes("duplicate column name")) {
      console.error("Error adding branch_id:", err.message);
    } else {
      console.log("branch_id column added (or already exists)");
    }
  });

  // Add has_variations column
  database.run(
    `ALTER TABLE products ADD COLUMN has_variations INTEGER DEFAULT 0`,
    (err) => {
      if (err && !err.message.includes("duplicate column name")) {
        console.error("Error adding has_variations:", err.message);
      } else {
        console.log("has_variations column added (or already exists)");
      }
    },
  );

  // Add allow_spicy column
  database.run(
    `ALTER TABLE products ADD COLUMN allow_spicy INTEGER DEFAULT 0`,
    (err) => {
      if (err && !err.message.includes("duplicate column name")) {
        console.error("Error adding allow_spicy:", err.message);
      } else {
        console.log("allow_spicy column added (or already exists)");
      }
    },
  );
});

setTimeout(() => {
  console.log("Migration completed!");
  database.close();
}, 1000);
