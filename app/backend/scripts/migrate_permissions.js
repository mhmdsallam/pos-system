const db = require("../database/db");

// Migration: Add custom_permissions column to users table
const migratePermissions = () => {
  return new Promise((resolve, reject) => {
    // Add custom_permissions column if not exists
    db.getDb().run(
      `
    ALTER TABLE users ADD COLUMN custom_permissions TEXT DEFAULT NULL
  `,
      (err) => {
        if (err && err.message.includes("duplicate column name")) {
          console.log("✅ Column custom_permissions already exists");
        } else if (err) {
          console.error("❌ Error adding column:", err.message);
        } else {
          console.log("✅ Column custom_permissions added successfully");
        }

        // Also add delivery_fee column to orders table for delivery fees
        db.getDb().run(
          `
      ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10,2) DEFAULT 0
    `,
          (err2) => {
            if (err2 && err2.message.includes("duplicate column name")) {
              console.log("✅ Column delivery_fee already exists");
            } else if (err2) {
              console.error(
                "❌ Error adding delivery_fee column:",
                err2.message,
              );
            } else {
              console.log("✅ Column delivery_fee added successfully");
            }

            resolve();
          },
        );
      },
    );
  });
};

migratePermissions()
  .then(() => {
    console.log("🎉 Migration completed!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  });
