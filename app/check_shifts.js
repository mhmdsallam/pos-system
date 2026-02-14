const db = require('./backend/database/db');
console.log("Checking database for open shifts...");

db.initialize().then(() => {
    const sql = "SELECT * FROM shifts WHERE status = 'open'";
    db.getDb().all(sql, [], (err, rows) => {
        if (err) {
            console.error("Error:", err);
            return;
        }
        console.log(`Found ${rows.length} open shifts:`);
        rows.forEach(row => {
            console.log(`- ID: ${row.id}, CashierID: ${row.cashier_id}, Name: ${row.cashier_name}, Started: ${row.start_time}`);
        });
        
        // Force close if strictly needed (optional)
        // logic to close could go here
    });
});
