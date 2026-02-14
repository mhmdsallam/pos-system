const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const os = require("os");

const dbPath = path.join(os.homedir(), "Documents", "RestaurantPOS", "pos.db");
const db = new sqlite3.Database(dbPath);

console.log(`Connecting to database at ${dbPath}...`);

db.serialize(() => {
    // 1. Check and Add category_id to inventory table
    db.run("ALTER TABLE inventory ADD COLUMN category_id INTEGER REFERENCES inventory_categories(id) ON DELETE SET NULL", (err) => {
        if (err && err.message.includes("duplicate column")) {
            console.log("Column 'category_id' already exists in 'inventory' table.");
        } else if (err) {
            console.error("Error adding column to inventory:", err.message);
        } else {
            console.log("Successfully added 'category_id' to 'inventory' table.");
        }
    });

    // 2. Check and Add last_updated to inventory table
    db.run("ALTER TABLE inventory ADD COLUMN last_updated DATETIME DEFAULT CURRENT_TIMESTAMP", (err) => {
        if (err && err.message.includes("duplicate column")) {
            console.log("Column 'last_updated' already exists in 'inventory' table.");
        } else if (err) {
            console.error("Error adding column to inventory:", err.message);
        } else {
            console.log("Successfully added 'last_updated' to 'inventory' table.");
        }
    });
    
     // 3. Create inventory_categories table if not exists (just in case)
    db.run(`
        CREATE TABLE IF NOT EXISTS inventory_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            icon TEXT,
            color TEXT DEFAULT '#6b7280',
            sort_order INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error("Error creating inventory_categories:", err.message);
        else console.log("Verified 'inventory_categories' table.");
    });

});

db.close(() => {
    console.log("Migration script completed.");
});
