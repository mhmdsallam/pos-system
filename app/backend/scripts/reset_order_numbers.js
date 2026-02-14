const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const os = require("os");

const dbDirectory = path.join(os.homedir(), "Documents", "RestaurantPOS");
const dbPath = path.join(dbDirectory, "pos.db");

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // First, get all orders and assign new simple sequential numbers
  db.all("SELECT id, order_number FROM orders ORDER BY id", (err, rows) => {
    if (err) {
      console.error("Error fetching orders:", err);
      return db.close();
    }

    let counter = 1;
    const stmt = db.prepare("UPDATE orders SET order_number = ? WHERE id = ?");

    rows.forEach((row) => {
      stmt.run(counter.toString(), row.id);
      counter++;
    });

    stmt.finalize((err) => {
      if (err) {
        console.error("Error updating order numbers:", err);
      } else {
        console.log(
          `Successfully reset ${rows.length} orders to sequential numbers starting from 1`,
        );
      }
      db.close();
    });
  });
});
