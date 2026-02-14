const express = require("express");
const router = express.Router();
const db = require("../database/db");

// Import auth middleware
const { authMiddleware, requireRole } = require("../middleware/auth");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Only owner can access reports
router.use(requireRole("owner"));

// Helper to get month index (0-11) from various formats
const getMonthIndex = (monthStr) => {
  if (!monthStr) return -1;
  // If it's a number like "01" or "1"
  if (!isNaN(monthStr)) return parseInt(monthStr) - 1;
  // If it's a name
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  return months.indexOf(monthStr.toLowerCase());
};

router.get("/annual", (req, res) => {
  const year = req.query.year || new Date().getFullYear().toString();

  // Initialize monthly data structure
  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: new Date(0, i).toLocaleString("ar-EG", { month: "long" }),
    sales: 0, // المبيعات الفعلية (excluding delivery fees)
    cost: 0, // تكلفة الإنتاج
    gross_profit: 0, // الربح الإجمالي (sales - cost)
    expenses: 0, // المصروفات
    salaries: 0, // المرتبات
    net_profit: 0, // صافي الربح (excluding delivery fees)
  }));

  // Query 1: Get sales per month (excluding delivery fees)
  const salesQuery = `
    SELECT strftime('%m', created_at) as month, 
           SUM(total - COALESCE(delivery_fee, 0)) as sales
    FROM orders 
    WHERE strftime('%Y', created_at) = ? AND status != 'cancelled' 
    GROUP BY month
  `;

  // Query 2: Get COGS (Cost of Goods Sold) per month
  const costQuery = `
    SELECT strftime('%m', o.created_at) as month, 
           SUM(oi.cost_price * oi.quantity) as total_cost
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE strftime('%Y', o.created_at) = ? AND o.status != 'cancelled'
    GROUP BY month
  `;

  // Query 3: Get expenses per month
  const expensesQuery = `
    SELECT strftime('%m', date) as month, SUM(amount) as total 
    FROM expenses 
    WHERE strftime('%Y', date) = ? 
    GROUP BY month
  `;

  // Query 4: Get salaries per month
  const salariesQuery = `
    SELECT month, SUM(net_salary) as total 
    FROM payrolls 
    WHERE year = ? 
    GROUP BY month
  `;

  // Helper: wrap callback DB query in a Promise
  const queryPromise = (sql, params) =>
    new Promise((resolve, reject) => {
      db.getDb().all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

  // Execute all 4 queries in parallel instead of serial
  Promise.all([
    queryPromise(salesQuery, [year]),
    queryPromise(costQuery, [year]),
    queryPromise(expensesQuery, [year]),
    queryPromise(salariesQuery, [year]),
  ])
    .then(([sales, costs, expenses, salaries]) => {
      // Fill sales data (excluding delivery fees)
      sales.forEach((record) => {
        const monthIdx = parseInt(record.month) - 1;
        if (monthlyData[monthIdx]) {
          monthlyData[monthIdx].sales = record.sales || 0;
        }
      });

      // Fill cost data
      costs.forEach((record) => {
        const monthIdx = parseInt(record.month) - 1;
        if (monthlyData[monthIdx]) {
          monthlyData[monthIdx].cost = record.total_cost || 0;
        }
      });

      // Fill expenses data
      expenses.forEach((record) => {
        const monthIdx = parseInt(record.month) - 1;
        if (monthlyData[monthIdx]) {
          monthlyData[monthIdx].expenses = record.total || 0;
        }
      });

      // Fill salaries data
      salaries.forEach((record) => {
        let monthIdx = -1;
        if (!isNaN(record.month)) {
          monthIdx = parseInt(record.month) - 1;
        } else {
          const mDate = new Date(`${record.month} 1, 2000`);
          if (!isNaN(mDate)) monthIdx = mDate.getMonth();
        }
        if (monthlyData[monthIdx]) {
          monthlyData[monthIdx].salaries = record.total || 0;
        }
      });

      // Calculate profits (excluding delivery fees from all calculations)
      let annualTotals = {
        sales: 0,
        cost: 0,
        gross_profit: 0,
        expenses: 0,
        salaries: 0,
        net_profit: 0,
      };

      let bestMonth = { month: "", value: -Infinity };
      let worstMonth = { month: "", value: Infinity };

      monthlyData.forEach((m) => {
        m.sales = parseFloat(m.sales) || 0;
        m.cost = parseFloat(m.cost) || 0;
        m.expenses = parseFloat(m.expenses) || 0;
        m.salaries = parseFloat(m.salaries) || 0;

        m.gross_profit = m.sales - m.cost;
        m.net_profit = m.gross_profit - m.expenses - m.salaries;

        annualTotals.sales += m.sales;
        annualTotals.cost += m.cost;
        annualTotals.gross_profit += m.gross_profit;
        annualTotals.expenses += m.expenses;
        annualTotals.salaries += m.salaries;
        annualTotals.net_profit += m.net_profit;

        if (m.net_profit > bestMonth.value) {
          bestMonth = { month: m.monthName, value: m.net_profit };
        }
        if (m.net_profit < worstMonth.value) {
          worstMonth = { month: m.monthName, value: m.net_profit };
        }
      });

      res.json({
        year,
        monthlyData,
        totals: {
          ...annualTotals,
          sales: annualTotals.sales,
          gross_profit: annualTotals.gross_profit,
          net_profit: annualTotals.net_profit,
        },
        insights: {
          bestMonth,
          worstMonth,
          profit_margin:
            annualTotals.sales > 0
              ? ((annualTotals.net_profit / annualTotals.sales) * 100).toFixed(
                  2,
                )
              : 0,
        },
      });
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});

// Cashier Performance Report
router.get("/cashier-performance", (req, res) => {
  const { start_date, end_date } = req.query;

  // Base SQL parts
  let dateFilter = "";
  const params = [];

  if (start_date && end_date) {
    dateFilter = " AND date(created_at) BETWEEN date(?) AND date(?)";
    params.push(start_date, end_date);
  }

  // 1. Get Sales per User (excluding delivery fees)
  const salesQuery = `
        SELECT 
            u.id as user_id,
            u.full_name,
            u.role,
            COUNT(o.id) as total_orders,
            COALESCE(SUM(o.total - COALESCE(o.delivery_fee, 0)), 0) as total_sales
        FROM users u
        LEFT JOIN orders o ON u.id = o.cashier_id ${dateFilter}
        WHERE 1=1
        GROUP BY u.id
        ORDER BY total_sales DESC
    `;

  // 2. Get Expenses added by User
  let expenseDateFilter = "";
  const expenseParams = [];
  if (start_date && end_date) {
    expenseDateFilter = " AND date(date) BETWEEN date(?) AND date(?)";
    expenseParams.push(start_date, end_date);
  }

  const expensesQuery = `
        SELECT 
            user_id, 
            COALESCE(SUM(amount), 0) as total_expenses_added
        FROM expenses
        WHERE user_id IS NOT NULL ${expenseDateFilter}
        GROUP BY user_id
    `;

  db.getDb().all(salesQuery, params, (err, salesRows) => {
    if (err)
      return res
        .status(500)
        .json({ error: "Sales Query Error: " + err.message });

    db.getDb().all(expensesQuery, expenseParams, (err, expenseRows) => {
      if (err)
        return res
          .status(500)
          .json({ error: "Expenses Query Error: " + err.message });

      // Merge Data
      const report = salesRows.map((user) => {
        const expenseData = expenseRows.find((e) => e.user_id === user.user_id);
        return {
          ...user,
          total_expenses_added: expenseData
            ? expenseData.total_expenses_added
            : 0,
        };
      });

      res.json(report);
    });
  });
});

module.exports = router;
