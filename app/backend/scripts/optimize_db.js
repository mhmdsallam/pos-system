const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const dbDirectory = path.join(os.homedir(), 'Documents', 'RestaurantPOS');
const dbPath = path.join(dbDirectory, 'pos.db');

const db = new sqlite3.Database(dbPath);

const optimize = () => {
    console.log('Starting Database Optimization (V5)...');

    db.serialize(() => {
        // 1. Indexes for Orders
        db.run('CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at)');
        db.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
        
        // 2. Indexes for Foreign Keys
        db.run('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)');
        
        // 3. Financial Indexes
        db.run('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)');
        db.run('CREATE INDEX IF NOT EXISTS idx_payrolls_year_month ON payrolls(year, month)');

        console.log('Indexes created successfully.');
    });

    // Check for missing columns in Settings or others that might have been skipped
    setTimeout(() => {
        console.log('Optimization V5 completed.');
        db.close();
    }, 1000);
};

optimize();
