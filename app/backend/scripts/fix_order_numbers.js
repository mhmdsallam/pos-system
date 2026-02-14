const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const os = require("os");

const dbDirectory = path.join(os.homedir(), "Documents", "RestaurantPOS");
const dbPath = path.join(dbDirectory, "pos.db");

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Update old format ORD-XXXX to just XXXX
  db.run(
    "UPDATE orders SET order_number = SUBSTR(order_number, 5) WHERE order_number LIKE 'ORD-%'",
    (err) => {
      if (err) {
        console.error("Error updating orders:", err);
      } else {
        console.log("Updated existing orders to new format");
      }
      db.close();
    },
  );
});
