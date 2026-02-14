const express = require("express");
const router = express.Router();
const db = require("../database/db");

// Import auth middleware
const { authMiddleware, requireRole } = require("../middleware/auth");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Monthly Summary Endpoint (Must be before general routes)
router.get("/monthly-summary", (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const sql = `
        SELECT 
            strftime('%Y-%m', date) as month,
            SUM(amount) as total
        FROM expenses
        WHERE strftime('%Y', date) = ?
        GROUP BY strftime('%Y-%m', date)
        ORDER BY month
    `;

  db.getDb().all(sql, [year.toString()], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get all expenses with filters and user details
router.get("/", (req, res) => {
  const { start_date, end_date, month, user_id, category } = req.query;

  let sql = `
        SELECT e.*, u.full_name as user_name, u.role as user_role
        FROM expenses e
        LEFT JOIN users u ON e.user_id = u.id
        WHERE 1=1
    `;

  const params = [];

  if (month) {
    // Filter by specific month (YYYY-MM)
    sql += " AND strftime('%Y-%m', e.date) = ?";
    params.push(month);
  } else if (start_date && end_date) {
    sql += " AND DATE(e.date) BETWEEN DATE(?) AND DATE(?)";
    params.push(start_date, end_date);
  }

  if (user_id) {
    sql += " AND e.user_id = ?";
    params.push(user_id);
  }

  if (category && category !== "all") {
    sql += " AND e.category = ?";
    params.push(category);
  }

  sql += " ORDER BY e.date DESC";

  db.getDb().all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Add new expense
router.post("/", (req, res) => {
  const { category, amount, description, date } = req.body;
  const user_id = req.user.id; // From authMiddleware

  if (!category || !amount) {
    return res.status(400).json({ error: "الفئة والمبلغ مطلوبان" });
  }

  if (amount < 0) {
    return res.status(400).json({ error: "المبلغ لا يمكن أن يكون بالسالب" });
  }

  // Normalize date to YYYY-MM-DD format
  let expenseDate = date;
  if (!expenseDate) {
    expenseDate = new Date().toISOString().slice(0, 10);
  } else {
    // If it's a timestamp (number), convert it
    if (typeof expenseDate === "number" || /^\d+$/.test(expenseDate)) {
      expenseDate = new Date(parseInt(expenseDate)).toISOString().slice(0, 10);
    }
  }

  // Get the active shift for this user
  const getActiveShiftSQL = `
        SELECT id FROM shifts 
        WHERE cashier_id = ? AND status = 'open'
        ORDER BY start_time DESC
        LIMIT 1
    `;

  db.getDb().get(getActiveShiftSQL, [user_id], (err, shift) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const shiftId = shift ? shift.id : null;

    const sql = `
            INSERT INTO expenses (category, amount, description, date, user_id, shift_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

    db.getDb().run(
      sql,
      [category, amount, description, expenseDate, user_id, shiftId],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({
          id: this.lastID,
          category,
          amount,
          description,
          date: expenseDate,
          user_id,
          shift_id: shiftId,
        });
      },
    );
  });
});

// Update expense (Owner only)
router.put("/:id", requireRole("owner"), (req, res) => {
  const { category, amount, description, date } = req.body;
  const { id } = req.params;

  if (amount < 0) {
    return res.status(400).json({ error: "المبلغ لا يمكن أن يكون بالسالب" });
  }

  const sql = `
        UPDATE expenses 
        SET category = ?, amount = ?, description = ?, date = ?
        WHERE id = ?
    `;

  // Normalize date
  let expenseDate = date;
  if (typeof expenseDate === "number" || /^\d+$/.test(expenseDate)) {
    expenseDate = new Date(parseInt(expenseDate)).toISOString().slice(0, 10);
  }

  db.getDb().run(
    sql,
    [category, amount, description, expenseDate, id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "المصروف غير موجود" });
      }
      res.json({
        message: "تم تحديث المصروف بنجاح",
        id,
        category,
        amount,
        date: expenseDate,
      });
    },
  );
});

// Delete expense (Owner only)
router.delete("/:id", requireRole("owner"), (req, res) => {
  const sql = "DELETE FROM expenses WHERE id = ?";
  db.getDb().run(sql, [req.params.id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "تم حذف المصروف" });
  });
});

// Get expenses stats (today + monthly)
router.get("/stats", (req, res) => {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Get today's expenses
  const todaySql = `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date LIKE ?`;

  // Get current month expenses
  const monthSql = `
        SELECT 
            COALESCE(SUM(amount), 0) as total,
            category
        FROM expenses 
        WHERE date LIKE ?
        GROUP BY category
    `;

  db.getDb().get(todaySql, [`${today}%`], (err, todayRow) => {
    if (err) {
      console.error("Today query error:", err.message);
      return res.status(500).json({ error: err.message });
    }

    db.getDb().all(monthSql, [`${currentMonth}%`], (err, monthRows) => {
      if (err) {
        console.error("Month query error:", err.message);
        return res.status(500).json({ error: err.message });
      }

      const monthTotal =
        monthRows.length > 0
          ? monthRows.reduce(
              (sum, row) => sum + (parseFloat(row.total) || 0),
              0,
            )
          : 0;

      res.json({
        today_total: todayRow?.total || 0,
        month_total: monthTotal,
        month_breakdown: monthRows,
      });
    });
  });
});

module.exports = router;
