const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const os = require("os");
const bcrypt = require("bcryptjs");

// Database location: always inside user AppData (or Electron userData path)
const resolveDataDir = () => {
  if (process.env.ELECTRON_USER_DATA_PATH)
    return process.env.ELECTRON_USER_DATA_PATH;
  const appData =
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "Restaurant POS");
};

const dbDirectory = resolveDataDir();
const dbPath = path.join(dbDirectory, "pos.db");
const dbExists = fs.existsSync(dbPath);

if (!fs.existsSync(dbDirectory)) {
  fs.mkdirSync(dbDirectory, { recursive: true });
  console.log(`Created database directory: ${dbDirectory}`);
}

let db;

const initializeDatabase = async () => {
  console.log("Initializing database...");
  const openDb = () => new Database(dbPath);

  try {
    try {
      db = openDb();
    } catch (err) {
      console.error(
        "⚠️  Failed to open database, attempting recovery...",
        err.message,
      );
      if (fs.existsSync(dbPath)) {
        const backupPath = `${dbPath}.corrupt-${Date.now()}`;
        try {
          fs.renameSync(dbPath, backupPath);
          console.warn(`Corrupt DB moved to: ${backupPath}`);
        } catch (e) {
          console.error("⚠️  Failed to move corrupt DB:", e.message);
        }
      }
      db = openDb();
    }

    const isFirstRun = !dbExists || !fs.existsSync(dbPath);

    // Safety pragmas
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    console.log(`Connected to SQLite database at: ${dbPath}`);
    // Performance optimizations for better responsiveness
    db.pragma("synchronous = NORMAL");
    db.pragma("cache_size = -8000"); // 8MB cache
    db.pragma("temp_store = MEMORY"); // Store temp tables in memory
    db.pragma("mmap_size = 268435456"); // 256MB memory-mapped I/O
    db.pragma("busy_timeout = 5000"); // Wait up to 5s for locks

    // Create all tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT DEFAULT 'cashier',
        active BOOLEAN DEFAULT 1,
        force_password_reset BOOLEAN DEFAULT 0,
        custom_permissions TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3b82f6',
        icon TEXT,
        sort_order INTEGER DEFAULT 0,
        image TEXT,
        is_active BOOLEAN DEFAULT 1,
        branch_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        cost_price REAL DEFAULT 0,
        category_id INTEGER,
        image TEXT,
        available BOOLEAN DEFAULT 1,
        branch_id INTEGER,
        has_variations INTEGER DEFAULT 0,
        allow_spicy INTEGER DEFAULT 0,
        custom_options TEXT,
        is_menu_item BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        table_number TEXT,
        total REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        payment_method TEXT,
        cashier_id INTEGER,
        shift_id INTEGER,
        customer_id INTEGER DEFAULT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        customer_address TEXT,
        order_type TEXT DEFAULT 'dine_in',
        discount_percentage REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        delivery_fee REAL DEFAULT 0,
        subtotal REAL DEFAULT 0,
        branch_id INTEGER DEFAULT 1,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (cashier_id) REFERENCES users(id),
        FOREIGN KEY (shift_id) REFERENCES shifts(id)
      );

      CREATE TABLE IF NOT EXISTS product_variations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        cost_price REAL DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        combo_id INTEGER,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        cost_price REAL DEFAULT 0,
        notes TEXT,
        variation_id INTEGER,
        is_spicy BOOLEAN DEFAULT 0,
        is_combo BOOLEAN DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (combo_id) REFERENCES combos(id)
      );

      CREATE TABLE IF NOT EXISTS inventory_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        icon TEXT,
        color TEXT DEFAULT '#6b7280',
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL UNIQUE,
        quantity INTEGER DEFAULT 0,
        min_quantity INTEGER DEFAULT 5,
        unit TEXT DEFAULT 'قطعة',
        avg_cost REAL DEFAULT 0,
        category_id INTEGER,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES inventory_categories(id) ON DELETE SET NULL
      );

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
      );

      CREATE TABLE IF NOT EXISTS combos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        original_price REAL,
        discount_percentage REAL DEFAULT 0,
        image TEXT,
        is_active BOOLEAN DEFAULT 1,
        start_date DATETIME,
        end_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS combo_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        combo_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER DEFAULT 1,
        FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        user_id INTEGER,
        shift_id INTEGER,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        address TEXT,
        first_order_date DATETIME,
        total_orders INTEGER DEFAULT 0,
        total_spent REAL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        position TEXT,
        salary REAL DEFAULT 0,
        phone TEXT,
        hire_date DATETIME,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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
      );

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
      );

      CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        cashier_id INTEGER,
        cashier_name TEXT,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        opening_balance REAL DEFAULT 0,
        starting_cash REAL DEFAULT 0,
        closing_balance REAL DEFAULT 0,
        total_cash REAL DEFAULT 0,
        total_card REAL DEFAULT 0,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    console.log("Database tables created successfully");

    // Create performance indexes
    createIndexes();

    // Run migrations for existing databases
    runMigrations();

    // First-run admin bootstrap only
    await seedInitialAdmin(isFirstRun);
    
    // First-run menu seeding
    await seedInitialMenu(isFirstRun);

    return Promise.resolve();
  } catch (err) {
    console.error("Error initializing database:", err);
    return Promise.reject(err);
  }
};

const initialMenu = require("./initial_menu");

const seedInitialMenu = async (isFirstRun) => {
  if (!isFirstRun) return;

  try {
    const productsCount = db.prepare("SELECT COUNT(*) as count FROM products").get();
    if (productsCount.count > 0) return;

    console.log("🍽️ Seeding initial menu data...");

    const insertCategory = db.prepare(
      "INSERT INTO categories (name, icon, color) VALUES (?, ?, ?)"
    );
    const insertProduct = db.prepare(
      "INSERT INTO products (name, price, description, category_id, available) VALUES (?, ?, ?, ?, 1)"
    );

    const seedTransaction = db.transaction((menu) => {
      for (const section of menu) {
        const result = insertCategory.run(section.category, section.icon || "Utensils", section.color || "#3b82f6");
        const categoryId = result.lastInsertRowid;

        if (section.products) {
          for (const product of section.products) {
            insertProduct.run(product.name, product.price, product.description || "", categoryId);
          }
        }
      }
    });

    seedTransaction(initialMenu);

    console.log("✅ Initial menu seeded successfully!");
  } catch (err) {
    console.error("Error seeding initial menu:", err);
  }
};

// Performance indexes for fast queries
const createIndexes = () => {
  console.log("📊 Creating performance indexes...");
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_orders_shift_id ON orders(shift_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_cashier_id ON orders(cashier_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number)`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_shift_id ON expenses(shift_id)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_id ON inventory_batches(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)`,
    `CREATE INDEX IF NOT EXISTS idx_shifts_cashier_status ON shifts(cashier_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_shifts_user_status ON shifts(user_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)`,
    `CREATE INDEX IF NOT EXISTS idx_products_available ON products(available)`,
    `CREATE INDEX IF NOT EXISTS idx_advances_employee_id ON advances(employee_id)`,
  ];

  let created = 0;
  for (const sql of indexes) {
    try {
      db.exec(sql);
      created++;
    } catch (err) {
      // Individual index failure is non-critical
    }
  }
  console.log(`✅ ${created}/${indexes.length} performance indexes created`);
};

// Migration function to update existing databases
const runMigrations = () => {
  console.log("🔧 Running database migrations...");

  try {
    // Check shifts table columns
    const shiftsInfo = db.pragma("table_info(shifts)");
    const shiftsColumns = shiftsInfo.map((col) => col.name);

    if (!shiftsColumns.includes("user_id")) {
      console.log("  → Adding user_id to shifts table");
      db.exec(
        "ALTER TABLE shifts ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE",
      );
      db.exec("UPDATE shifts SET user_id = cashier_id WHERE user_id IS NULL");
    }

    if (!shiftsColumns.includes("cashier_id")) {
      console.log("  → Adding cashier_id to shifts table");
      db.exec(
        "ALTER TABLE shifts ADD COLUMN cashier_id INTEGER REFERENCES users(id)",
      );
      db.exec(
        "UPDATE shifts SET cashier_id = user_id WHERE cashier_id IS NULL",
      );
    }

    if (!shiftsColumns.includes("cashier_name")) {
      console.log("  → Adding cashier_name to shifts table");
      db.exec("ALTER TABLE shifts ADD COLUMN cashier_name TEXT");
    }

    if (!shiftsColumns.includes("starting_cash")) {
      console.log("  → Adding starting_cash to shifts table");
      db.exec("ALTER TABLE shifts ADD COLUMN starting_cash REAL DEFAULT 0");
    }

    // Check orders table columns
    const ordersInfo = db.pragma("table_info(orders)");
    const ordersColumns = ordersInfo.map((col) => col.name);
    if (!ordersColumns.includes("shift_id")) {
      console.log("  → Adding shift_id to orders table");
      db.exec(
        "ALTER TABLE orders ADD COLUMN shift_id INTEGER REFERENCES shifts(id)",
      );
    }

    // Check users table columns
    const usersInfo = db.pragma("table_info(users)");
    const userColumns = usersInfo.map((col) => col.name);
    if (!userColumns.includes("force_password_reset")) {
      console.log("  → Adding force_password_reset to users table");
      db.exec(
        "ALTER TABLE users ADD COLUMN force_password_reset BOOLEAN DEFAULT 0",
      );
    }

    if (!userColumns.includes("custom_permissions")) {
      console.log("  → Adding custom_permissions to users table");
      db.exec(
        "ALTER TABLE users ADD COLUMN custom_permissions TEXT DEFAULT NULL",
      );
    }

    // Add missing shift closure columns
    const shiftClosureColumns = {
      total_orders: "INTEGER DEFAULT 0",
      total_revenue: "REAL DEFAULT 0",
      total_cost: "REAL DEFAULT 0",
      total_profit: "REAL DEFAULT 0",
      cash_sales: "REAL DEFAULT 0",
      instapay_sales: "REAL DEFAULT 0",
      vodafone_cash_sales: "REAL DEFAULT 0",
      visa_sales: "REAL DEFAULT 0",
      ending_cash: "REAL DEFAULT 0",
      cash_variance: "REAL DEFAULT 0",
      notes: "TEXT",
      closed_by: "TEXT",
      updated_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
    };

    const updatedShiftsInfo = db.pragma("table_info(shifts)");
    const updatedShiftsColumns = updatedShiftsInfo.map((col) => col.name);

    for (const [colName, colType] of Object.entries(shiftClosureColumns)) {
      if (!updatedShiftsColumns.includes(colName)) {
        console.log(`  → Adding ${colName} to shifts table`);
        db.exec(`ALTER TABLE shifts ADD COLUMN ${colName} ${colType}`);
      }
    }

    console.log("✅ Database migrations completed successfully");
  } catch (err) {
    console.error(
      "⚠️  Migration error (may be safe to ignore if columns exist):",
      err.message,
    );
  }
};

const seedInitialAdmin = async (isFirstRun) => {
  try {
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get();
    if (userCount.count === 0) {
      const adminPassword = await bcrypt.hash("1234", 10);
      db.prepare(
        "INSERT INTO users (username, password, full_name, role, force_password_reset) VALUES (?, ?, ?, ?, 1)",
      ).run("admin", adminPassword, "المدير", "owner");
      console.log(
        "✅ First-run admin created (username: admin, password: 1234, force reset enabled)",
      );
    } else if (isFirstRun) {
      console.log("✅ Existing database detected; no seeding performed");
    }
  } catch (err) {
    console.error("Error creating initial admin:", err);
  }
};

// Wrapper class to make better-sqlite3 compatible with sqlite3 callback API
// Uses setImmediate to yield to event loop between queries, preventing UI freezes
class SqliteWrapper {
  constructor(db) {
    this.db = db;
    this.inTransaction = false;
  }

  get(sql, params = [], callback) {
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.get(...params);
      // Yield to event loop before calling back to prevent blocking
      setImmediate(() => callback(null, result));
    } catch (err) {
      setImmediate(() => callback(err));
    }
  }

  all(sql, params = [], callback) {
    try {
      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params);
      setImmediate(() => callback(null, results));
    } catch (err) {
      setImmediate(() => callback(err));
    }
  }

  run(sql, params = [], callback) {
    try {
      // Handle transaction commands
      if (sql === "BEGIN TRANSACTION" || sql === "BEGIN") {
        this.db.prepare("BEGIN").run();
        this.inTransaction = true;
        if (callback) setImmediate(() => callback.call({}, null));
        return;
      }
      if (sql === "COMMIT") {
        this.db.prepare("COMMIT").run();
        this.inTransaction = false;
        if (callback) setImmediate(() => callback.call({}, null));
        return;
      }
      if (sql === "ROLLBACK") {
        this.db.prepare("ROLLBACK").run();
        this.inTransaction = false;
        if (callback) setImmediate(() => callback.call({}, null));
        return;
      }

      const stmt = this.db.prepare(sql);
      const info = stmt.run(...params);
      // Mimic sqlite3 'this' context with lastID and changes
      if (callback) {
        const ctx = { lastID: info.lastInsertRowid, changes: info.changes };
        setImmediate(() => callback.call(ctx, null));
      }
    } catch (err) {
      if (callback) {
        setImmediate(() => callback.call({}, err));
      }
    }
  }

  serialize(callback) {
    // better-sqlite3 is synchronous by default, so just call the callback
    if (callback) callback();
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  prepare(sql) {
    return this.db.prepare(sql);
  }
}

const getDatabase = () => new SqliteWrapper(db);

module.exports = {
  initialize: initializeDatabase,
  getDb: getDatabase,
};
