const express = require("express");
const router = express.Router();
const db = require("../database/db");

// Import auth middleware
const { authMiddleware, requireRole } = require("../middleware/auth");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Only owner can access payroll
router.use(requireRole("owner"));

// Get payroll status for a specific month
router.get("/status", (req, res) => {
  const { month, year } = req.query;
  if (!month || !year)
    return res.status(400).json({ error: "الشهر والسنة مطلوبان" });

  const monthStr = `${year}-${month.toString().padStart(2, "0")}`;

  // 1. Get all active employees
  const empSql = `SELECT * FROM employees WHERE is_active = 1`;

  db.getDb().all(empSql, [], async (err, employees) => {
    if (err) return res.status(500).json({ error: err.message });

    const payrolls = [];

    // For each employee, calculate status
    for (const emp of employees) {
      // Check if already paid
      const paidSql = `SELECT * FROM payrolls WHERE employee_id = ? AND month = ? AND year = ?`;

      const paidRecord = await new Promise((resolve, reject) => {
        db.getDb().get(
          paidSql,
          [emp.id, month.toString(), year.toString()],
          (err, row) => {
            if (err) {
              console.error("Payroll query error:", err.message);
              resolve(null);
            } else resolve(row);
          },
        );
      });

      if (paidRecord) {
        payrolls.push({
          ...emp,
          status: "paid",
          details: paidRecord,
        });
      } else {
        // Calculate pending amount
        // Get pending advances
        const advSql = `SELECT SUM(amount) as total FROM advances WHERE employee_id = ? AND status = 'pending'`;
        const advances = await new Promise((resolve, reject) => {
          db.getDb().get(advSql, [emp.id], (err, row) => {
            if (err) {
              console.error("Advances query error:", err.message);
              resolve(0);
            } else resolve(row?.total || 0);
          });
        });

        payrolls.push({
          ...emp,
          status: "pending",
          details: {
            base_salary: emp.salary,
            itemized_advances: advances,
            net_salary: emp.salary - advances,
          },
        });
      }
    }

    res.json(payrolls);
  });
});

// Pay salary
router.post("/pay", (req, res) => {
  const {
    employee_id,
    month,
    year,
    base_salary,
    bonuses,
    deductions,
    advances_deducted,
    net_salary,
  } = req.body;

  // Prevent duplicate payments for the same employee/month/year
  const checkSql = `SELECT id FROM payrolls WHERE employee_id = ? AND month = ? AND year = ?`;
  
  // First check hire date validation
  const empSql = `SELECT name, hire_date FROM employees WHERE id = ?`;
  db.getDb().get(empSql, [employee_id], (empErr, employee) => {
    if (empErr) return res.status(500).json({ error: empErr.message });
    if (!employee) return res.status(404).json({ error: "الموظف غير موجود" });

    // Validate hire date - prevent payment for months before hire
    if (employee.hire_date) {
      const hireDate = new Date(employee.hire_date);
      const hireYear = hireDate.getFullYear();
      const hireMonth = hireDate.getMonth() + 1; // 1-based
      const payYear = parseInt(year);
      const payMonth = parseInt(month);

      if (payYear < hireYear || (payYear === hireYear && payMonth < hireMonth)) {
        return res.status(400).json({
          error: `لا يمكن صرف راتب شهر ${payMonth}/${payYear} للموظف "${employee.name}" لأن تاريخ تعيينه هو ${hireMonth}/${hireYear}`
        });
      }
    }

  db.getDb().get(
    checkSql,
    [employee_id, month.toString(), year.toString()],
    (checkErr, existing) => {
      if (checkErr) return res.status(500).json({ error: checkErr.message });
      if (existing)
        return res
          .status(400)
          .json({ error: "تم صرف راتب هذا الموظف لهذا الشهر بالفعل" });

      const sql = `
        INSERT INTO payrolls (employee_id, month, year, base_salary, bonuses, deductions, advances_deducted, net_salary, payment_date, status)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'paid'
        WHERE NOT EXISTS (SELECT 1 FROM payrolls WHERE employee_id = ? AND month = ? AND year = ?)
    `;

      db.getDb().run(
        sql,
        [
          employee_id,
          month,
          year,
          base_salary,
          bonuses || 0,
          deductions || 0,
          advances_deducted || 0,
          net_salary,
          employee_id,
          month,
          year
        ],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          
          if (this.changes === 0) {
             return res.status(400).json({ error: "تم صرف راتب هذا الموظف لهذا الشهر بالفعل (مكرر)" });
          }

          const payrollId = this.lastID;

          // Mark advances as deducted
          if (advances_deducted > 0) {
            const updateAdvSql = `
                UPDATE advances SET status = 'deducted', payroll_id = ? 
                WHERE employee_id = ? AND status = 'pending'
            `;
            db.getDb().run(updateAdvSql, [payrollId, employee_id], (err) => {
              if (err) console.error("Error updating advances:", err.message);
            });
          }

          // Record as expense with user attribution
          const expenseSql = `
            INSERT INTO expenses (category, amount, description, date, user_id)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
        `;
          db.getDb().run(
            expenseSql,
            [
              "رواتب",
              net_salary,
              `راتب شهر ${month}/${year} - موظف #${employee_id}`,
              req.user ? req.user.id : null,
            ],
            (err) => {
              if (err)
                console.error("Error recording salary expense:", err.message);
            },
          );

          res.json({ message: "تم تسجيل الراتب بنجاح" });
        },
      );
    },
  );
  }); // close empSql hire date check callback
});

// Get history
router.get("/history", (req, res) => {
  const sql = `
        SELECT p.*, e.name 
        FROM payrolls p
        JOIN employees e ON p.employee_id = e.id
        ORDER BY p.payment_date DESC
        LIMIT 50
    `;
  db.getDb().all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

module.exports = router;
