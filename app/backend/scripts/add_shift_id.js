/**
 * Add shift_id column to orders table
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'Documents', 'RestaurantPOS', 'pos.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('Connected to database');
});

// Check if shift_id exists
db.all("PRAGMA table_info(orders)", (err, columns) => {
    if (err) {
        console.error('Error:', err);
        process.exit(1);
    }

    const hasShiftId = columns.some(c => c.name === 'shift_id');
    
    if (!hasShiftId) {
        console.log('Adding shift_id column to orders table...');
        db.run(`ALTER TABLE orders ADD COLUMN shift_id INTEGER`, (err) => {
            if (err) {
                console.error('Error adding shift_id column:', err);
            } else {
                console.log('✓ shift_id column added to orders table');
            }
            db.close();
        });
    } else {
        console.log('✓ shift_id column already exists');
        db.close();
    }
});
