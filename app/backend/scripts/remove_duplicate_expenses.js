const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const os = require("os");

const dbDirectory = path.join(os.homedir(), "Documents", "RestaurantPOS");
const dbPath = path.join(dbDirectory, "pos.db");

const db = new sqlite3.Database(dbPath);

const removeDuplicates = () => {
  console.log("Removing duplicate expenses...");

  // First, count total expenses before
  db.get("SELECT COUNT(*) as count FROM expenses", (err, row) => {
    if (err) {
      console.error("Error counting expenses:", err.message);
      return;
    }
    console.log(`Total expenses before: ${row.count}`);

    // Find duplicates
    db.all(
      `
            SELECT category, amount, date, COUNT(*) as cnt
            FROM expenses
            GROUP BY category, amount, date
            HAVING cnt > 1
        `,
      (err, duplicates) => {
        if (err) {
          console.error("Error finding duplicates:", err.message);
          return;
        }

        if (duplicates.length === 0) {
          console.log("No duplicate expenses found.");
          db.close();
          return;
        }

        console.log(`Found ${duplicates.length} duplicate groups:`);
        duplicates.forEach((d) => {
          console.log(
            `  - ${d.category}: ${d.amount} on ${d.date} (${d.cnt} times)`,
          );
        });

        // Delete duplicates, keeping only the first one
        db.run(
          `
                DELETE FROM expenses
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM expenses
                    GROUP BY category, amount, date
                )
            `,
          function (err) {
            if (err) {
              console.error("Error deleting duplicates:", err.message);
              return;
            }

            console.log(`Deleted ${this.changes} duplicate expenses.`);

            // Count after
            db.get("SELECT COUNT(*) as count FROM expenses", (err, row) => {
              console.log(`Total expenses after: ${row.count}`);
              db.close();
            });
          },
        );
      },
    );
  });
};

removeDuplicates();
