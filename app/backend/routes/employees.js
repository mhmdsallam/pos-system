const express = require("express");
const router = express.Router();
const db = require("../database/db");

// Import auth middleware
const { authMiddleware, requireRole } = require("../middleware/auth");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Only owner can access employees
router.use(requireRole("owner"));

// Get all employees
router.get("/", (req, res) => {
  const sql = `SELECT * FROM employees WHERE is_active = 1 ORDER BY name`;
  db.getDb().all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add employee
router.post("/", (req, res) => {
  const { name, position, salary, phone, hire_date } = req.body;

  if (!name || !salary) {
    return res.status(400).json({ error: "الاسم والراتب مطلوبان" });
  }

  const sql = `
        INSERT INTO employees (name, position, salary, phone, hire_date)
        VALUES (?, ?, ?, ?, ?)
    `;

  db.getDb().run(
    sql,
    [
      name,
      position,
      salary,
      phone,
      hire_date || new Date().toISOString().split("T")[0],
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      res.json({
        id: this.lastID,
        name,
        position,
        salary,
        phone,
        hire_date,
      });
    },
  );
});

// Update employee
router.put("/:id", (req, res) => {
  const { name, position, salary, phone } = req.body;
  const sql = `
        UPDATE employees 
        SET name = ?, position = ?, salary = ?, phone = ?
        WHERE id = ?
    `;

  db.getDb().run(
    sql,
    [name, position, salary, phone, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "تم تحديث البيانات" });
    },
  );
});

// Delete employee (Soft delete)
router.delete("/:id", (req, res) => {
  const sql = `UPDATE employees SET is_active = 0 WHERE id = ?`;
  db.getDb().run(sql, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "تم حذف الموظف" });
  });
});

// Get advances for employee
router.get("/:id/advances", (req, res) => {
  const sql = `SELECT * FROM advances WHERE employee_id = ? ORDER BY date DESC`;
  db.getDb().all(sql, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add advance
router.post("/:id/advances", (req, res) => {
  const { amount, description, date } = req.body;

  if (!amount || amount <= 0) {
    return res
      .status(400)
      .json({ error: "المبلغ مطلوب ويجب أن يكون أكبر من صفر" });
  }

  const advanceDate = date || new Date().toISOString();

  const sql = `
        INSERT INTO advances (employee_id, amount, description, date, status)
        VALUES (?, ?, ?, ?, 'pending')
    `;

  db.getDb().run(
    sql,
    [req.params.id, amount, description || "", advanceDate],
    function (err) {
      if (err) {
        console.error("Error inserting advance:", err.message);
        return res.status(500).json({ error: err.message });
      }

      const advanceId = this.lastID;

      // Also record as expense automatically
      const expenseSql = `
            INSERT INTO expenses (category, amount, description, date, user_id)
            VALUES (?, ?, ?, ?, ?)
        `;
      db.getDb().run(
        expenseSql,
        [
          "رواتب",
          amount,
          `سلفة موظف: ${description || "بدون سبب"}`,
          advanceDate,
          req.user ? req.user.id : null,
        ],
        function (expenseErr) {
          if (expenseErr) {
            console.error("Error recording expense:", expenseErr.message);
          }
          // Return success even if expense recording fails
          res.json({
            id: advanceId,
            amount,
            status: "pending",
            message: "تم إضافة السلفة بنجاح",
          });
        },
      );
    },
  );
});

module.exports = router;
