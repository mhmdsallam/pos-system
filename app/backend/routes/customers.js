const express = require("express");
const router = express.Router();
const db = require("../database/db");

// Import auth middleware
const { authMiddleware, requireRole } = require("../middleware/auth");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Only owner can access customers
router.use(requireRole("owner"));

// Get all customers with search
router.get("/", (req, res) => {
  const { search, limit = 50 } = req.query;

  let sql = `
        SELECT c.*,
        (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count,
        (SELECT MAX(created_at) FROM orders WHERE customer_id = c.id) as last_order_date
        FROM customers c
    `;
  const params = [];

  if (search) {
    sql += ` WHERE c.name LIKE ? OR c.phone LIKE ?`;
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY c.total_spent DESC LIMIT ?`;
  params.push(parseInt(limit));

  db.getDb().all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Search customer by phone (for POS quick lookup)
router.get("/search/:phone", (req, res) => {
  const sql = `
        SELECT * FROM customers WHERE phone = ?
    `;

  db.getDb().get(sql, [req.params.phone], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "العميل غير موجود" });
    }
    res.json(row);
  });
});

// Get top customers - MUST be before /:id to avoid route conflict
router.get("/stats/top", (req, res) => {
  const sql = `
        SELECT c.id, c.name, c.phone, c.total_orders, c.total_spent,
        c.first_order_date,
        (SELECT MAX(created_at) FROM orders WHERE customer_id = c.id) as last_order_date
        FROM customers c
        WHERE c.total_orders > 0
        ORDER BY c.total_spent DESC
        LIMIT 10
    `;

  db.getDb().all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get customer by ID with full order history
router.get("/:id", (req, res) => {
  const customerSql = `
        SELECT c.*,
        (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count,
        (SELECT SUM(total) FROM orders WHERE customer_id = c.id) as total_spent,
        (SELECT MAX(created_at) FROM orders WHERE customer_id = c.id) as last_order_date
        FROM customers c WHERE c.id = ?
    `;

  const ordersSql = `
        SELECT o.*, u.full_name as cashier_name
        FROM orders o
        LEFT JOIN users u ON o.cashier_id = u.id
        WHERE o.customer_id = ?
        ORDER BY o.created_at DESC
    `;

  db.getDb().get(customerSql, [req.params.id], (err, customer) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!customer) {
      return res.status(404).json({ error: "العميل غير موجود" });
    }

    db.getDb().all(ordersSql, [req.params.id], (err, orders) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ ...customer, orders });
    });
  });
});

// Get customer stats
router.get("/:id/stats", (req, res) => {
  const statsSql = `
        SELECT 
            COUNT(*) as total_orders,
            SUM(total) as total_spent,
            AVG(total) as average_order,
            MAX(created_at) as last_order_date,
            MIN(created_at) as first_order_date
        FROM orders WHERE customer_id = ?
    `;

  const monthlySql = `
        SELECT 
            strftime('%Y-%m', created_at) as month,
            COUNT(*) as orders_count,
            SUM(total) as monthly_spent
        FROM orders 
        WHERE customer_id = ?
        GROUP BY strftime('%Y-%m', created_at)
        ORDER BY month DESC
        LIMIT 12
    `;

  db.getDb().get(statsSql, [req.params.id], (err, stats) => {
    if (err) return res.status(500).json({ error: err.message });

    db.getDb().all(monthlySql, [req.params.id], (err, monthly) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ...stats, monthly });
    });
  });
});

// Create or update customer (upsert)
router.post("/", (req, res) => {
  const { name, phone, address } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: "الاسم ورقم الهاتف مطلوبان" });
  }

  // Check if customer exists
  const checkSql = `SELECT id, total_orders, total_spent FROM customers WHERE phone = ?`;

  db.getDb().get(checkSql, [phone], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (existing) {
      // Update existing customer
      const updateSql = `
                UPDATE customers SET 
                    name = ?,
                    address = COALESCE(?, address),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;

      db.getDb().run(updateSql, [name, address, existing.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: existing.id, action: "updated" });
      });
    } else {
      // Create new customer
      const insertSql = `
                INSERT INTO customers (name, phone, address, first_order_date)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `;

      db.getDb().run(insertSql, [name, phone, address], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, action: "created" });
      });
    }
  });
});

// Update customer
router.put("/:id", (req, res) => {
  const { name, phone, address, notes } = req.body;

  const sql = `
        UPDATE customers SET 
            name = ?,
            phone = ?,
            address = ?,
            notes = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `;

  db.getDb().run(
    sql,
    [name, phone, address, notes, req.params.id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "العميل غير موجود" });
      }
      res.json({ success: true });
    },
  );
});

// Link order to customer and update stats
router.post("/:id/link-order", (req, res) => {
  const { order_id, total } = req.body;

  const updateOrderSql = `UPDATE orders SET customer_id = ? WHERE id = ?`;
  const updateCustomerSql = `
        UPDATE customers SET 
            total_orders = total_orders + 1,
            total_spent = total_spent + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `;

  db.getDb().serialize(() => {
    db.getDb().run(updateOrderSql, [req.params.id, order_id], (err) => {
      if (err) console.error("Error linking order:", err);
    });

    db.getDb().run(updateCustomerSql, [total || 0, req.params.id], (err) => {
      if (err) console.error("Error updating customer stats:", err);
    });
  });

  res.json({ success: true });
});

// Delete customer
router.delete("/:id", (req, res) => {
  const sql = `DELETE FROM customers WHERE id = ?`;

  db.getDb().run(sql, [req.params.id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "العميل غير موجود" });
    }
    res.json({ success: true });
  });
});

module.exports = router;
