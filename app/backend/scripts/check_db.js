const path = require("path");
const os = require("os");
const Database = require("better-sqlite3");

// Check database in production location
const dbPath = path.join(
  os.homedir(),
  "AppData",
  "Roaming",
  "Restaurant POS",
  "pos.db",
);

console.log("🔍 Checking database at:", dbPath);

try {
  const db = new Database(dbPath);

  // Check users
  const users = db
    .prepare("SELECT username, full_name, role, active FROM users")
    .all();

  console.log("\n📊 Users in database:");
  console.log("═══════════════════════════════════════");
  if (users.length === 0) {
    console.log("❌ No users found!");
    console.log("💡 Solution: Delete pos.db file and restart the app");
  } else {
    users.forEach((user, index) => {
      console.log(`${index + 1}. Username: ${user.username}`);
      console.log(`   Full Name: ${user.full_name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Active: ${user.active ? "Yes" : "No"}`);
      console.log("───────────────────────────────────────");
    });
  }

  db.close();

  console.log("\n✅ Database check complete!");
  console.log("\n💡 Default login credentials:");
  console.log("   Username: admin");
  console.log("   Password: 1234");
} catch (error) {
  if (error.code === "ENOENT") {
    console.log("❌ Database file not found!");
    console.log("💡 The app will create it on first run.");
  } else {
    console.log("❌ Error:", error.message);
  }
}
