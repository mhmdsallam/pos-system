const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const dbDirectory = path.join(os.homedir(), 'Documents', 'RestaurantPOS');
const dbPath = path.join(dbDirectory, 'pos.db');

const db = new sqlite3.Database(dbPath);

const migrate = () => {
    console.log('Starting Image Migration (V4)...');

    db.serialize(() => {
        db.run(`ALTER TABLE products ADD COLUMN image TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.log('Column image might already exist.');
            } else if (!err) {
                console.log('Added image column to products.');
            }
        });
    });

    setTimeout(() => {
        console.log('Migration V4 completed.');
        db.close();
    }, 1000);
};

migrate();
