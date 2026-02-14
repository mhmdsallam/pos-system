const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const dbDirectory = path.join(os.homedir(), 'Documents', 'RestaurantPOS');
const dbPath = path.join(dbDirectory, 'pos.db');

const db = new sqlite3.Database(dbPath);

const migrate = () => {
    console.log('Starting Employee & Payroll migration...');

    db.serialize(() => {
        // 1. Employees table
        db.run(`
          CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            position TEXT,
            salary REAL NOT NULL,
            phone TEXT,
            hire_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 2. Advances table
        db.run(`
          CREATE TABLE IF NOT EXISTS advances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            description TEXT,
            status TEXT DEFAULT 'pending',
            payroll_id INTEGER,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
          )
        `);

        // 3. Payrolls table
        db.run(`
          CREATE TABLE IF NOT EXISTS payrolls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            month TEXT NOT NULL,
            year INTEGER NOT NULL,
            base_salary REAL NOT NULL,
            advances_deducted REAL DEFAULT 0,
            bonuses REAL DEFAULT 0,
            deductions REAL DEFAULT 0,
            net_salary REAL NOT NULL,
            payment_date DATETIME,
            status TEXT DEFAULT 'paid',
            FOREIGN KEY (employee_id) REFERENCES employees(id)
          )
        `, (err) => {
            if (err) console.error('Error creating tables:', err);
            else console.log('Employee tables created successfully.');
        });
    });

    db.close(() => {
        console.log('Migration completed.');
    });
};

migrate();
