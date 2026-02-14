const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbPath = path.join(os.homedir(), 'Documents/RestaurantPOS/pos.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Starting Database Migration...');

const run = (sql) => new Promise((resolve, reject) => {
    db.run(sql, function(err) {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error executing:', sql, err.message);
            // Don't reject, just log error for duplicate columns
        }
        resolve();
    });
});

async function migrate() {
    try {
        // 1. Create inventory_batches table
        console.log('1. Creating inventory_batches table...');
        await run(`
            CREATE TABLE IF NOT EXISTS inventory_batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                original_quantity INTEGER NOT NULL,
                cost_price REAL NOT NULL,
                expiry_date DATE,
                received_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                supplier TEXT,
                notes TEXT,
                is_active BOOLEAN DEFAULT 1,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);

        // 2. Update Inventory Table
        console.log('2. Updating inventory table schema...');
        await run("ALTER TABLE inventory ADD COLUMN avg_cost REAL DEFAULT 0");
        await run("ALTER TABLE inventory ADD COLUMN min_quantity INTEGER DEFAULT 5");
        await run("ALTER TABLE inventory ADD COLUMN unit TEXT DEFAULT 'قطعة'");

        // 3. Update Products Table
        console.log('3. Updating products table schema...');
        await run("ALTER TABLE products ADD COLUMN image TEXT");
        await run("ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0");

        // 4. Update Combos Table
        console.log('4. Updating combos table schema...');
        // Drop old combos table if it exists but has wrong schema? No, better to alter.
        // Or if it's simpler and data is not critical, we could drop and recreate. 
        // Let's try to add columns first.
        
        await run("ALTER TABLE combos ADD COLUMN description TEXT");
        await run("ALTER TABLE combos ADD COLUMN original_price REAL");
        await run("ALTER TABLE combos ADD COLUMN discount_percentage REAL DEFAULT 0");
        await run("ALTER TABLE combos ADD COLUMN image TEXT");
        await run("ALTER TABLE combos ADD COLUMN start_date DATETIME");
        await run("ALTER TABLE combos ADD COLUMN end_date DATETIME");

        // 5. Update Order Items
        console.log('5. Updating order_items table schema...');
        await run("ALTER TABLE order_items ADD COLUMN cost_price REAL DEFAULT 0");
        await run("ALTER TABLE order_items ADD COLUMN notes TEXT");
        await run("ALTER TABLE order_items ADD COLUMN variation_id INTEGER");
        await run("ALTER TABLE order_items ADD COLUMN is_spicy BOOLEAN DEFAULT 0");
        await run("ALTER TABLE order_items ADD COLUMN is_combo BOOLEAN DEFAULT 0");
        
        // 6. Update Customers Table
        console.log('6. Updating customers table schema...');
        await run("ALTER TABLE customers ADD COLUMN last_order_date DATETIME");
        
        console.log('✅ Migration Compeleted Successfully!');
    } catch (e) {
        console.error('❌ Migration Failed:', e);
    } finally {
        db.close();
    }
}

migrate();
