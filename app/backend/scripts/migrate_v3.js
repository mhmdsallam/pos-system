const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const dbDirectory = path.join(os.homedir(), 'Documents', 'RestaurantPOS');
const dbPath = path.join(dbDirectory, 'pos.db');

const db = new sqlite3.Database(dbPath);

const migrate = () => {
    console.log('Starting Delivery Data migration...');

    const addColumn = (table, column, definition) => {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.log(`Column ${column} might already exist in ${table}`);
            } else if (!err) {
                console.log(`Added ${column} to ${table}`);
            }
        });
    };

    db.serialize(() => {
        // Add Delivery Customer Details to Orders
        addColumn('orders', 'customer_name', 'TEXT');
        addColumn('orders', 'customer_phone', 'TEXT');
        addColumn('orders', 'customer_address', 'TEXT');
    });

    setTimeout(() => {
        console.log('Migration V3 completed.');
        db.close();
    }, 1000);
};

migrate();
