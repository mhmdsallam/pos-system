/**
 * Shifts Management Routes
 * Handles cashier shift opening, tracking, and closing
 */

const express = require("express");
const router = express.Router();
const db = require("../database/db");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

/**
 * GET /api/shifts/active
 * Get current active shift for the logged-in cashier
 */
router.get("/active", (req, res) => {
  const cashierId = req.user.id;

  const sql = `
        SELECT * FROM shifts 
        WHERE cashier_id = ? AND status = 'open'
        ORDER BY start_time DESC
        LIMIT 1
    `;

  db.getDb().get(sql, [cashierId], (err, shift) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ shift: shift || null });
  });
});

/**
 * POST /api/shifts/start
 * Start a new shift for the cashier
 */
router.post("/start", (req, res) => {
  const { starting_cash } = req.body;
  const cashierId = req.user?.id;
  const cashierName = req.user?.full_name || req.user?.username || "كاشير";

  // Validate user_id to prevent NOT NULL constraint errors
  if (!cashierId) {
    return res.status(401).json({
      error: "لم يتم التعرف على المستخدم. يرجى تسجيل الدخول مرة أخرى.",
    });
  }

  // Check if there's already an open shift
  const checkSql = `
        SELECT id FROM shifts 
        WHERE cashier_id = ? AND status = 'open'
    `;

  db.getDb().get(checkSql, [cashierId], (err, existingShift) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (existingShift) {
      return res.status(400).json({
        error: "لديك وردية مفتوحة بالفعل. يجب إغلاقها أولاً.",
        shift: existingShift // Return the existing shift so frontend can sync
      });
    }

    // Create new shift
    const insertSql = `
            INSERT INTO shifts (
                user_id, cashier_id, cashier_name, status, starting_cash, start_time
            ) VALUES (?, ?, ?, 'open', ?, DATETIME('now', 'localtime'))
        `;

    db.getDb().run(
      insertSql,
      [cashierId, cashierId, cashierName, starting_cash || 0],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        // Return the newly created shift
        db.getDb().get(
          "SELECT * FROM shifts WHERE id = ?",
          [this.lastID],
          (err, shift) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({
              message: "تم بدء الوردية بنجاح",
              shift,
            });
          },
        );
      },
    );
  });
});

/**
 * GET /api/shifts/history
 * Get shift history (for managers/owners)
 * NOTE: Must be defined BEFORE /:id routes to prevent Express matching "history" as an ID
 */
router.get("/history", (req, res) => {
  const { cashier_id, start_date, end_date, status, limit = 50 } = req.query;

  let sql = `SELECT * FROM shifts WHERE 1=1`;
  const params = [];

  if (cashier_id) {
    sql += ` AND cashier_id = ?`;
    params.push(cashier_id);
  }

  if (start_date) {
    sql += ` AND DATE(start_time) >= DATE(?)`;
    params.push(start_date);
  }

  if (end_date) {
    sql += ` AND DATE(start_time) <= DATE(?)`;
    params.push(end_date);
  }

  if (status) {
    sql += ` AND status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY start_time DESC LIMIT ?`;
  params.push(parseInt(limit));

  db.getDb().all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ shifts: rows });
  });
});

/**
 * GET /api/shifts/:id/summary
 * Get detailed summary for a specific shift
 */
router.get("/:id/summary", async (req, res) => {
  const shiftId = req.params.id;

  try {
    // Get shift details
    const shift = await new Promise((resolve, reject) => {
      db.getDb().get(
        "SELECT * FROM shifts WHERE id = ?",
        [shiftId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        },
      );
    });

    if (!shift) {
      return res.status(404).json({ error: "الوردية غير موجودة" });
    }

    // Get orders for this shift
    const orders = await new Promise((resolve, reject) => {
      db.getDb().all(
        `SELECT 
                    o.*,
                    COUNT(oi.id) as items_count
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.shift_id = ? AND o.status != 'cancelled'
                GROUP BY o.id
                ORDER BY o.created_at DESC`,
        [shiftId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    // Get payment method breakdown
    const paymentBreakdown = await new Promise((resolve, reject) => {
      db.getDb().all(
        `SELECT 
                    payment_method,
                    COUNT(*) as count,
                    SUM(total) as total
                FROM orders
                WHERE shift_id = ? AND status != 'cancelled'
                GROUP BY payment_method`,
        [shiftId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    // Get top products sold in this shift
    const topProducts = await new Promise((resolve, reject) => {
      db.getDb().all(
        `SELECT 
                    p.name,
                    p.image,
                    SUM(oi.quantity) as quantity,
                    SUM(oi.price * oi.quantity) as revenue,
                    SUM((oi.price - oi.cost_price) * oi.quantity) as profit
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                JOIN orders o ON oi.order_id = o.id
                WHERE o.shift_id = ? AND o.status != 'cancelled'
                GROUP BY p.id
                ORDER BY quantity DESC
                LIMIT 10`,
        [shiftId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    // Calculate real-time totals from orders (separate queries to avoid JOIN inflation)
    const orderAgg = await new Promise((resolve, reject) => {
      db.getDb().get(
        `SELECT 
                    COUNT(*) as total_orders,
                    COALESCE(SUM(total), 0) as total_revenue,
                    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_sales
                FROM orders
                WHERE shift_id = ? AND status != 'cancelled'`,
        [shiftId],
        (err, row) => {
          if (err) reject(err);
          else
            resolve(
              row || { total_orders: 0, total_revenue: 0, cash_sales: 0 },
            );
        },
      );
    });

    const costAgg = await new Promise((resolve, reject) => {
      db.getDb().get(
        `SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0) as total_cost
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                WHERE o.shift_id = ? AND o.status != 'cancelled'`,
        [shiftId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { total_cost: 0 });
        },
      );
    });

    const expenseAgg = await new Promise((resolve, reject) => {
      db.getDb().get(
        `SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE shift_id = ?`,
        [shiftId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { total_expenses: 0 });
        },
      );
    });

    const expenseDetails = await new Promise((resolve, reject) => {
      db.getDb().all(
        `SELECT id, category, description, amount, date FROM expenses WHERE shift_id = ? ORDER BY date DESC`,
        [shiftId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    const totals = {
      total_orders: orderAgg.total_orders,
      total_revenue: orderAgg.total_revenue,
      total_cost: costAgg.total_cost,
      cash_sales: orderAgg.cash_sales,
      total_expenses: expenseAgg.total_expenses,
    };

    // Calculate profit
    const total_profit = totals.total_revenue - totals.total_cost;

    // Merge calculated totals with shift data
    const shiftWithTotals = {
      ...shift,
      total_orders: totals.total_orders,
      total_revenue: totals.total_revenue,
      total_cost: totals.total_cost,
      total_profit: total_profit,
      cash_sales: totals.cash_sales,
      total_expenses: totals.total_expenses,
      net_cash:
        (shift.starting_cash || 0) + totals.cash_sales - totals.total_expenses,
    };

    res.json({
      shift: shiftWithTotals,
      orders,
      paymentBreakdown,
      topProducts,
      total_expenses: totals.total_expenses,
      expenses_details: expenseDetails,
      net_cash: shiftWithTotals.net_cash,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/shifts/:id/close
 * Close a shift and lock the data
 */
router.post("/:id/close", async (req, res) => {
  const shiftId = req.params.id;
  const { ending_cash, notes } = req.body;
  const closedBy = req.user.id;

  // Defensive: ensure required columns exist (legacy DBs may miss migrations)
  try {
    const requiredColumns = [
      "total_orders",
      "total_revenue",
      "total_cost",
      "total_profit",
      "cash_sales",
      "instapay_sales",
      "vodafone_cash_sales",
      "visa_sales",
      "total_expenses",
      "net_cash",
      "ending_cash",
      "cash_variance",
      "notes",
      "closed_by",
      "updated_at",
    ];

    const shiftColumns = await new Promise((resolve, reject) => {
      db.getDb().all("PRAGMA table_info(shifts)", [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows.map((r) => r.name));
      });
    });

    for (const col of requiredColumns) {
      if (!shiftColumns.includes(col)) {
        try {
          const type =
            col === "notes" || col === "closed_by"
              ? "TEXT"
              : col === "updated_at"
                ? "DATETIME DEFAULT CURRENT_TIMESTAMP"
                : "REAL DEFAULT 0";
          db.getDb().exec(`ALTER TABLE shifts ADD COLUMN ${col} ${type}`);
          if (col === "updated_at") {
            db.getDb().exec(
              "UPDATE shifts SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL",
            );
          }
        } catch (e) {
          console.warn(`shift column add skipped: ${col}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.warn("shift column check failed:", e.message);
  }

  try {
    // Get shift details
    const shift = await new Promise((resolve, reject) => {
      db.getDb().get(
        "SELECT * FROM shifts WHERE id = ?",
        [shiftId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        },
      );
    });

    if (!shift) {
      return res.status(404).json({ error: "الوردية غير موجودة" });
    }

    if (shift.status === "closed") {
      return res.status(400).json({ error: "الوردية مغلقة بالفعل" });
    }

    // Calculate shift totals - use separate queries to avoid JOIN inflation
    const orderTotals = await new Promise((resolve, reject) => {
      db.getDb().get(
        `SELECT 
                    COUNT(*) as total_orders,
                    COALESCE(SUM(total), 0) as total_revenue,
                    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_sales,
                    COALESCE(SUM(CASE WHEN payment_method = 'instapay' THEN total ELSE 0 END), 0) as instapay_sales,
                    COALESCE(SUM(CASE WHEN payment_method = 'vodafone' THEN total ELSE 0 END), 0) as vodafone_cash_sales,
                    COALESCE(SUM(CASE WHEN payment_method = 'visa' THEN total ELSE 0 END), 0) as visa_sales
                FROM orders
                WHERE shift_id = ? AND status != 'cancelled'`,
        [shiftId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        },
      );
    });

    const costTotals = await new Promise((resolve, reject) => {
      db.getDb().get(
        `SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0) as total_cost
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                WHERE o.shift_id = ? AND o.status != 'cancelled'`,
        [shiftId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        },
      );
    });

    const expenseTotals = await new Promise((resolve, reject) => {
      db.getDb().get(
        `SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE shift_id = ?`,
        [shiftId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { total_expenses: 0 });
        },
      );
    });

    const totals = {
      total_orders: orderTotals.total_orders,
      total_revenue: orderTotals.total_revenue,
      total_cost: costTotals.total_cost,
      cash_sales: orderTotals.cash_sales,
      instapay_sales: orderTotals.instapay_sales,
      vodafone_cash_sales: orderTotals.vodafone_cash_sales,
      visa_sales: orderTotals.visa_sales,
      total_expenses: expenseTotals.total_expenses,
    };

    const totalProfit = totals.total_revenue - totals.total_cost;
    const cashVariance =
      (ending_cash || 0) -
      ((shift.starting_cash || 0) +
        (totals.cash_sales || 0) -
        (totals.total_expenses || 0));
    const netCash =
      (shift.starting_cash || 0) +
      (totals.cash_sales || 0) -
      totals.total_expenses;

    // Update shift with final calculations
    const updateSql = `
            UPDATE shifts SET
                status = 'closed',
                end_time = DATETIME('now', 'localtime'),
                total_orders = ?,
                total_revenue = ?,
                total_cost = ?,
                total_profit = ?,
                cash_sales = ?,
                instapay_sales = ?,
                vodafone_cash_sales = ?,
                visa_sales = ?,
                total_expenses = ?,
                net_cash = ?,
                ending_cash = ?,
                cash_variance = ?,
                notes = ?,
                closed_by = ?,
                updated_at = DATETIME('now', 'localtime')
            WHERE id = ?
        `;

    await new Promise((resolve, reject) => {
      db.getDb().run(
        updateSql,
        [
          totals.total_orders,
          totals.total_revenue,
          totals.total_cost,
          totalProfit,
          totals.cash_sales,
          totals.instapay_sales,
          totals.vodafone_cash_sales,
          totals.visa_sales,
          totals.total_expenses,
          netCash,
          ending_cash || 0,
          cashVariance,
          notes,
          closedBy,
          shiftId,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    // Get updated shift
    const closedShift = await new Promise((resolve, reject) => {
      db.getDb().get(
        "SELECT * FROM shifts WHERE id = ?",
        [shiftId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        },
      );
    });

    res.json({
      message: "تم إغلاق الوردية بنجاح",
      shift: closedShift,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
