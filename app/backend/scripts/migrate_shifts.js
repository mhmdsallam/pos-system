/**
 * Database Migration: Add Shifts Table
 * This migration adds cashier shift tracking for accurate financial reconciliation
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const os = require("os");

const dbPath = path.join(os.homedir(), "Documents", "RestaurantPOS", "pos.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err);
    process.exit(1);
  }
  console.log("Connected to database for migration");
});

db.serialize(() => {
  console.log("Creating shifts table...");

  // Create shifts table
  db.run(
    `
        CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cashier_id INTEGER NOT NULL,
            cashier_name TEXT NOT NULL,
            start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            end_time DATETIME,
            status TEXT DEFAULT 'open',
            total_orders INTEGER DEFAULT 0,
            total_revenue REAL DEFAULT 0,
            total_cost REAL DEFAULT 0,
            total_profit REAL DEFAULT 0,
            cash_sales REAL DEFAULT 0,
            instapay_sales REAL DEFAULT 0,
            vodafone_cash_sales REAL DEFAULT 0,
            visa_sales REAL DEFAULT 0,
            starting_cash REAL DEFAULT 0,
            ending_cash REAL DEFAULT 0,
            cash_variance REAL DEFAULT 0,
            notes TEXT,
            closed_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cashier_id) REFERENCES users(id),
            FOREIGN KEY (closed_by) REFERENCES users(id)
        )
    `,
    (err) => {
      if (err) {
        console.error("Error creating shifts table:", err);
      } else {
        console.log("✓ Shifts table created successfully");
      }
    },
  );

  // Add shift_id column to orders table if it doesn't exist
  db.all("PRAGMA table_info(orders)", (err, columns) => {
    if (err) {
      console.error("Error checking orders table:", err);
      return;
    }

    const hasShiftId = columns.some((c) => c.name === "shift_id");

    if (!hasShiftId) {
      console.log("Adding shift_id column to orders table...");
      db.run(
        `ALTER TABLE orders ADD COLUMN shift_id INTEGER REFERENCES shifts(id)`,
        (err) => {
          if (err) {
            console.error("Error adding shift_id column:", err);
          } else {
            console.log("✓ shift_id column added to orders table");
          }
        },
      );
    } else {
      console.log("✓ shift_id column already exists");
    }
  });

  // Add order_type column if it doesn't exist
  db.all("PRAGMA table_info(orders)", (err, columns) => {
    if (err) return;

    const hasOrderType = columns.some((c) => c.name === "order_type");

    if (!hasOrderType) {
      console.log("Adding order_type column to orders table...");
      db.run(
        `ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'dine_in'`,
        (err) => {
          if (err) {
            console.error("Error adding order_type column:", err);
          } else {
            console.log("✓ order_type column added to orders table");
          }
        },
      );
    } else {
      console.log("✓ order_type column already exists");
    }
  });

  // Add customer fields to orders if they don't exist
  db.all("PRAGMA table_info(orders)", (err, columns) => {
    if (err) return;

    const fields = [
      "customer_name",
      "customer_phone",
      "customer_address",
      "subtotal",
      "discount_percentage",
      "discount_amount",
      "delivery_fee",
    ];

    fields.forEach((field) => {
      const hasField = columns.some((c) => c.name === field);
      if (!hasField) {
        let dataType = "TEXT";
        if (
          [
            "subtotal",
            "discount_percentage",
            "discount_amount",
            "delivery_fee",
          ].includes(field)
        ) {
          dataType = "REAL DEFAULT 0";
        }

        console.log(`Adding ${field} column to orders table...`);
        db.run(`ALTER TABLE orders ADD COLUMN ${field} ${dataType}`, (err) => {
          if (err) {
            console.error(`Error adding ${field} column:`, err);
          } else {
            console.log(`✓ ${field} column added to orders table`);
          }
        });
      }
    });
  });
});

db.close((err) => {
  if (err) {
    console.error("Error closing database:", err);
  } else {
    console.log("\n✓ Migration completed successfully");
    console.log("Database connection closed");
  }
});
