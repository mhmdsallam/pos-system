const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const os = require("os");

const dbDirectory = path.join(os.homedir(), "Documents", "RestaurantPOS");
const dbPath = path.join(dbDirectory, "pos.db");

const db = new sqlite3.Database(dbPath);

const checkExpenses = () => {
  console.log("Checking expenses...\n");

  // Check schema
  db.get(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='expenses'",
    (err, row) => {
      if (err) {
        console.error("Error:", err.message);
        return;
      }
      console.log("Expenses table schema:");
      console.log(row.sql);
      console.log("");

      // Count total
      db.get("SELECT COUNT(*) as count FROM expenses", (err, row) => {
        console.log(`Total expenses: ${row.count}`);

        // Get all expenses
        db.all("SELECT * FROM expenses ORDER BY date DESC", (err, rows) => {
          console.log("\nAll expenses:");
          rows.forEach((r) => {
            console.log(`  ${r.id}. ${r.category} - ${r.amount} - ${r.date}`);
          });

          // Check for duplicates
          db.all(
            `
                    SELECT category, amount, date, COUNT(*) as cnt
                    FROM expenses
                    GROUP BY category, amount, date
                    HAVING cnt > 1
                `,
            (err, duplicates) => {
              console.log("\nDuplicates:");
              if (duplicates.length === 0) {
                console.log("  None found");
              } else {
                duplicates.forEach((d) => {
                  console.log(
                    `  ${d.category}: ${d.amount} on ${d.date} (${d.cnt} times)`,
                  );
                });
              }
              db.close();
            },
          );
        });
      });
    },
  );
};

checkExpenses();
