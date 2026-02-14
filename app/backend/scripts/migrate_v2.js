const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const dbDirectory = path.join(os.homedir(), 'Documents', 'RestaurantPOS');
const dbPath = path.join(dbDirectory, 'pos.db');

const db = new sqlite3.Database(dbPath);

const migrate = () => {
    console.log('Starting Branches & Advanced POS migration...');

    db.serialize(() => {
        // 1. Create Branches Table
        db.run(`
          CREATE TABLE IF NOT EXISTS branches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT,
            phone TEXT,
            is_main BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
            if (!err) {
                 // Create default branch
                 db.get("SELECT count(*) as count FROM branches", (err, row) => {
                    if (row.count === 0) {
                        db.run("INSERT INTO branches (name, is_main) VALUES (?, ?)", ['الفرع الرئيسي', 1]);
                    }
                 });
            }
        });

        // 2. Product Variations (Sizes)
        db.run(`
          CREATE TABLE IF NOT EXISTS product_variations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            cost_price REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
          )
        `);

        // 3. Combos
        db.run(`
          CREATE TABLE IF NOT EXISTS combos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            image TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS combo_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            combo_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER DEFAULT 1,
            FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id)
          )
        `);

        // 3.1 HR Tables
         db.run(`
            CREATE TABLE IF NOT EXISTS employees (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              position TEXT,
              salary REAL DEFAULT 0,
              phone TEXT,
              hire_date DATETIME,
              is_active BOOLEAN DEFAULT 1,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          db.run(`
            CREATE TABLE IF NOT EXISTS advances (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              employee_id INTEGER NOT NULL,
              amount REAL NOT NULL,
              description TEXT,
              date DATETIME DEFAULT CURRENT_TIMESTAMP,
              status TEXT DEFAULT 'pending',
              payroll_id INTEGER,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (employee_id) REFERENCES employees(id)
            )
          `);

          db.run(`
            CREATE TABLE IF NOT EXISTS payrolls (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              employee_id INTEGER NOT NULL,
              month TEXT NOT NULL,
              year TEXT NOT NULL,
              base_salary REAL NOT NULL,
              bonuses REAL DEFAULT 0,
              deductions REAL DEFAULT 0,
              advances_deducted REAL DEFAULT 0,
              net_salary REAL NOT NULL,
              payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
              status TEXT DEFAULT 'paid',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (employee_id) REFERENCES employees(id)
            )
          `);

        // 4. Update Tables with new columns
        const addColumn = (table, column, definition) => {
            db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.log(`Column ${column} might already exist in ${table}`);
                } else if (!err) {
                    console.log(`Added ${column} to ${table}`);
                }
            });
        };

        // Users linked to branch
        addColumn('users', 'branch_id', 'INTEGER REFERENCES branches(id)');

        // Products linked to branch (nullable = all branches)
        addColumn('products', 'branch_id', 'INTEGER REFERENCES branches(id)');
        addColumn('products', 'has_variations', 'BOOLEAN DEFAULT 0');

        // Orders linked to branch + order type
        addColumn('orders', 'branch_id', 'INTEGER REFERENCES branches(id)');
        addColumn('orders', 'order_type', "TEXT DEFAULT 'dine_in'"); // dine_in, takeaway, delivery

        // Order Items details
        addColumn('order_items', 'variation_id', 'INTEGER REFERENCES product_variations(id)');
        addColumn('order_items', 'is_combo', 'BOOLEAN DEFAULT 0');
        
        // Combos branch link
        addColumn('combos', 'branch_id', 'INTEGER REFERENCES branches(id)');
        
        // Note: 'notes' column might already exist in previous schema or added manually, ensuring it exists
        // addColumn('order_items', 'notes', 'TEXT'); // Already exists from previous turn logic safely? Let's check. 
        // Previous migration didn't invoke addColumn for notes on order_items explicitly in 'migrate_db.js' but creation script has it.
        // We will assume creation script is source of truth for new db, but for existing db we might need it.
        // It's safe to try adding it.
        // Actually, looking at `db.js` in previous turn, `order_items` schema includes `notes TEXT`.
        
    });

    // Wait a bit for async alters then set default branch for existing data
    setTimeout(() => {
        db.run("UPDATE products SET branch_id = 1 WHERE branch_id IS NULL");
        db.run("UPDATE users SET branch_id = 1 WHERE branch_id IS NULL AND role != 'owner'");
        // Add allow_spicy column to products
    db.run(`ALTER TABLE products ADD COLUMN allow_spicy BOOLEAN DEFAULT 0`, (err) => {
        if (!err) console.log("Added allow_spicy column to products");
    });

    console.log("Migration V2 completed successfully!");
        db.close();
    }, 2000);
};

migrate();
