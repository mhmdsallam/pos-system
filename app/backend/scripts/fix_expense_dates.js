const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const os = require("os");

const dbDirectory = path.join(os.homedir(), "Documents", "RestaurantPOS");
const dbPath = path.join(dbDirectory, "pos.db");

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Fix malformed dates (timestamps)
  db.all(
    "SELECT id, date FROM expenses WHERE date LIKE '%1770365%' OR date NOT LIKE '%-%'",
    (err, rows) => {
      if (err) {
        console.error("Error:", err.message);
        return db.close();
      }

      console.log(`Found ${rows.length} entries with malformed dates`);

      rows.forEach((row) => {
        const newDate = new Date(parseInt(row.date)).toISOString().slice(0, 10);
        db.run(
          "UPDATE expenses SET date = ? WHERE id = ?",
          [newDate, row.id],
          (err) => {
            if (err) {
              console.error("Error updating:", err.message);
            } else {
              console.log(`Fixed expense ${row.id}: ${row.date} -> ${newDate}`);
            }
          },
        );
      });

      // Close after updates
      setTimeout(() => {
        db.close();
      }, 1000);
    },
  );
});
