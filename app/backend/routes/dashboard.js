const express = require("express");
const router = express.Router();
const db = require("../database/db");

// Import auth middleware
const { authMiddleware, requireRole } = require("../middleware/auth");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Only owner can access dashboard
router.use(requireRole("owner"));

// Helper to get stats for a date range (uses range comparisons for index efficiency)
const getStatsForRange = (startDate, endDate) => {
  // Convert to range bounds: startDate 00:00:00 to endDate 23:59:59
  const rangeStart = startDate + " 00:00:00";
  const rangeEnd = endDate + " 23:59:59";

  return new Promise((resolve, reject) => {
    const statsSql = `
      SELECT 
        COALESCE(SUM(total - delivery_fee), 0) as total_sales,
        COALESCE(SUM(delivery_fee), 0) as total_delivery_fees,
        COALESCE(COUNT(*), 0) as total_orders
      FROM orders
      WHERE created_at >= ? AND created_at <= ?
      AND status != 'cancelled'
    `;

    const cogsSql = `
      SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0) as total_cogs
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= ? AND o.created_at <= ?
      AND o.status != 'cancelled'
    `;

    const expensesSql = `
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE date >= ? AND date <= ?
    `;

    db.getDb().get(statsSql, [rangeStart, rangeEnd], (err, stats) => {
      if (err) return reject(err);

      db.getDb().get(cogsSql, [rangeStart, rangeEnd], (err, cogs) => {
        if (err) return reject(err);

        db.getDb().get(
          expensesSql,
          [startDate, endDate + "T23:59:59"],
          (err, expenses) => {
            if (err) return reject(err);

            const netSales = stats.total_sales || 0;
            const deliveryFees = stats.total_delivery_fees || 0;
            const totalRevenue = netSales + deliveryFees;
            const cogsValue = cogs ? cogs.total_cogs : 0;
            const expensesValue = expenses ? expenses.total_expenses : 0;

            resolve({
              sales: netSales,
              orders: stats.total_orders,
              cogs: cogsValue,
              expenses: expensesValue,
              net_profit: totalRevenue - cogsValue - expensesValue,
            });
          },
        );
      });
    });
  });
};

const getDateRange = (period, offset = 0) => {
  const now = new Date();
  let start = new Date();
  let end = new Date();

  if (period === "day") {
    start.setDate(now.getDate() - offset);
    end.setDate(now.getDate() - offset);
  } else if (period === "week") {
    const day = now.getDay(); // 0 is Sunday
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    start.setDate(diff - offset * 7);
    end = new Date(start);
    end.setDate(end.getDate() + 6);
  } else if (period === "month") {
    start.setMonth(now.getMonth() - offset, 1);
    end.setMonth(now.getMonth() - offset + 1, 0);
  }

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
};

router.get("/summary", async (req, res) => {
  try {
    // Current Ranges
    const today = getDateRange("day", 0);
    const yesterday = getDateRange("day", 1);

    // Weekly Ranges
    const thisWeek = getDateRange("week", 0);
    const lastWeek = getDateRange("week", 1);

    // Monthly Ranges
    const thisMonth = getDateRange("month", 0);
    const lastMonth = getDateRange("month", 1);

    const [
      todayStats,
      yesterdayStats,
      weekStats,
      lastWeekStats,
      monthStats,
      lastMonthStats,
    ] = await Promise.all([
      getStatsForRange(today.start, today.end),
      getStatsForRange(yesterday.start, yesterday.end),
      getStatsForRange(thisWeek.start, thisWeek.end),
      getStatsForRange(lastWeek.start, lastWeek.end),
      getStatsForRange(thisMonth.start, thisMonth.end),
      getStatsForRange(lastMonth.start, lastMonth.end),
    ]);

    res.json({
      day: { current: todayStats, previous: yesterdayStats },
      week: { current: weekStats, previous: lastWeekStats },
      month: { current: monthStats, previous: lastMonthStats },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/top-items", (req, res) => {
  const limit = 5;
  const { period } = req.query; // 'day', 'week', 'month', 'all'

  // Base query part
  let dateCondition = "";
  let params = [];

  if (period && period !== "all") {
    const range = getDateRange(period);
    dateCondition = "AND DATE(o.created_at) BETWEEN DATE(?) AND DATE(?)";
    params.push(range.start, range.end);
  }

  const sql = `
    SELECT 
      p.name,
      p.image,
      COUNT(*) as order_count,
      SUM(oi.quantity) as total_quantity,
      SUM(oi.price * oi.quantity) as total_revenue,
      SUM((oi.price - oi.cost_price) * oi.quantity) as total_profit
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    WHERE o.status != 'cancelled' ${dateCondition}
    GROUP BY p.id
  `;

  db.getDb().all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const topSelling = [...rows]
      .sort((a, b) => b.total_quantity - a.total_quantity)
      .slice(0, limit);
    const topProfitable = [...rows]
      .sort((a, b) => b.total_profit - a.total_profit)
      .slice(0, limit);

    res.json({
      topSelling,
      topProfitable,
    });
  });
});

router.get("/sales-chart", (req, res) => {
  // Get last 30 days sales (excluding delivery fees)
  const sql = `
    SELECT 
      DATE(created_at) as date,
      SUM(total - COALESCE(delivery_fee, 0)) as sales
    FROM orders
    WHERE DATE(created_at) >= DATE('now', '-30 days')
    AND status != 'cancelled'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `;

  db.getDb().all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

/**
 * GET /api/dashboard/payment-breakdown
 * Get payment method breakdown for a period
 */
router.get("/payment-breakdown", (req, res) => {
  const { period } = req.query; // 'day', 'week', 'month', 'all'

  let dateCondition = "";
  let params = [];

  if (period && period !== "all") {
    const range = getDateRange(period);
    dateCondition = "AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)";
    params.push(range.start, range.end);
  }

  const sql = `
    SELECT 
      payment_method,
      COUNT(*) as count,
      SUM(total - COALESCE(delivery_fee, 0)) as total_amount
    FROM orders
    WHERE status != 'cancelled' ${dateCondition}
    GROUP BY payment_method
    ORDER BY total_amount DESC
  `;

  db.getDb().all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const data = rows || [];
    const grandTotal = data.reduce((sum, r) => sum + (r.total_amount || 0), 0);
    const result = data.map(r => ({
      ...r,
      percentage: grandTotal > 0 ? ((r.total_amount / grandTotal) * 100).toFixed(1) : '0.0'
    }));
    res.json(result);
  });
});

/**
 * GET /api/dashboard/cashier-performance
 * Get performance comparison for all cashiers
 */
router.get("/cashier-performance", (req, res) => {
  const { period } = req.query; // 'day', 'week', 'month', 'all'

  let dateCondition = "";
  let params = [];

  if (period && period !== "all") {
    const range = getDateRange(period);
    dateCondition = "AND DATE(o.created_at) BETWEEN DATE(?) AND DATE(?)";
    params.push(range.start, range.end);
  }

  const sql = `
    SELECT 
      u.id,
      u.full_name,
      COUNT(DISTINCT o.id) as total_orders,
      COALESCE(SUM(DISTINCT o.id * 0 + o.total - COALESCE(o.delivery_fee, 0)), 0) as total_sales_raw,
      COALESCE((SELECT SUM(oi2.cost_price * oi2.quantity) FROM order_items oi2 JOIN orders o2 ON oi2.order_id = o2.id WHERE o2.cashier_id = u.id AND o2.status != 'cancelled' ${dateCondition.replace(/o\./g, "o2.")}), 0) as total_cost,
      ROUND(AVG(o.total - COALESCE(o.delivery_fee, 0)), 2) as avg_order_value,
      COUNT(DISTINCT DATE(o.created_at)) as days_worked,
      (SELECT COUNT(*) FROM shifts WHERE cashier_id = u.id AND status = 'closed') as shifts_count
    FROM users u
    LEFT JOIN orders o ON u.id = o.cashier_id AND o.status != 'cancelled' ${dateCondition}
    WHERE u.role = 'cashier'
    GROUP BY u.id
    ORDER BY total_sales_raw DESC
  `;

  // We use the same date placeholders in main query and subquery, so duplicate params
  const queryParams = [...params, ...params];

  db.getDb().all(sql, queryParams, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // Post-process to calculate correct fields
    const result = (rows || []).map((r) => ({
      ...r,
      total_sales: r.total_sales_raw || 0,
      total_profit: (r.total_sales_raw || 0) - (r.total_cost || 0),
    }));
    res.json(result);
  });
});

/**
 * GET /api/dashboard/product-analysis
 * Enhanced product analysis with profit margins and categorization
 */
router.get("/product-analysis", (req, res) => {
  const { period, category } = req.query;

  let dateCondition = "";
  let categoryCondition = "";
  let params = [];

  if (period && period !== "all") {
    const range = getDateRange(period);
    dateCondition = "AND DATE(o.created_at) BETWEEN DATE(?) AND DATE(?)";
    params.push(range.start, range.end);
  }

  if (category) {
    categoryCondition = "AND p.category_id = ?";
    params.push(category);
  }

  const sql = `
    SELECT 
      p.id,
      p.name,
      p.image,
      c.name as category_name,
      p.price,
      p.cost_price,
      COUNT(DISTINCT oi.order_id) as order_count,
      SUM(oi.quantity) as total_quantity,
      SUM(oi.price * oi.quantity) as total_revenue,
      SUM(oi.cost_price * oi.quantity) as total_cost,
      SUM((oi.price - oi.cost_price) * oi.quantity) as total_profit,
      ROUND((SUM((oi.price - oi.cost_price) * oi.quantity) * 100.0 / NULLIF(SUM(oi.price * oi.quantity), 0)), 2) as profit_margin_pct,
      ROUND(AVG(oi.price), 2) as avg_selling_price
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.id ${dateCondition}
    WHERE (o.status != 'cancelled' OR o.id IS NULL) ${categoryCondition}
    GROUP BY p.id
    HAVING order_count > 0
    ORDER BY total_revenue DESC
  `;

  db.getDb().all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Categorize products by performance
    const analysis = {
      topSelling: rows.slice(0, 10),
      topProfitable: [...rows]
        .sort((a, b) => b.total_profit - a.total_profit)
        .slice(0, 10),
      highMargin: [...rows]
        .filter((p) => p.profit_margin_pct > 50)
        .sort((a, b) => b.profit_margin_pct - a.profit_margin_pct)
        .slice(0, 10),
      lowMargin: [...rows]
        .filter((p) => p.profit_margin_pct < 20 && p.profit_margin_pct > 0)
        .sort((a, b) => a.profit_margin_pct - b.profit_margin_pct)
        .slice(0, 10),
      underperforming: [...rows]
        .filter((p) => p.total_quantity < 5)
        .sort((a, b) => a.total_quantity - b.total_quantity)
        .slice(0, 10),
      all: rows,
    };

    res.json(analysis);
  });
});

/**
 * GET /api/dashboard/shift-comparison
 * Compare recent shifts performance
 */
router.get("/shift-comparison", (req, res) => {
  const { limit = 10 } = req.query;

  const sql = `
    SELECT 
      s.*,
      DATE(s.start_time) as shift_date,
      TIME(s.start_time) as start_hour,
      TIME(s.end_time) as end_hour,
      ROUND((JULIANDAY(s.end_time) - JULIANDAY(s.start_time)) * 24, 2) as duration_hours,
      ROUND(s.total_revenue / NULLIF(s.total_orders, 0), 2) as avg_order_value,
      ROUND((s.total_profit * 100.0) / NULLIF(s.total_revenue, 0), 2) as profit_margin_pct
    FROM shifts s
    WHERE s.status = 'closed'
    ORDER BY s.start_time DESC
    LIMIT ?
  `;

  db.getDb().all(sql, [parseInt(limit)], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

/**
 * GET /api/dashboard/forecast
 * Sales/profit forecasting based on historical data
 * Query params: type (monthly, quarterly, yearly)
 */
router.get("/forecast", (req, res) => {
  const { type = "monthly" } = req.query;

  // Get historical data for forecasting
  let historicalSql = "";
  let multiplier = 1;
  let periodName = "";

  if (type === "monthly") {
    // Get last 3 months data for daily average
    historicalSql = `
      SELECT 
        DATE(created_at) as date,
        SUM(total - COALESCE(delivery_fee, 0)) as daily_sales
      FROM orders
      WHERE created_at >= DATE('now', '-3 months')
      AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;
    multiplier = 30; // days in month
    periodName = "شهر";
  } else if (type === "quarterly") {
    // Get last 6 months for weekly average
    historicalSql = `
      SELECT 
        DATE(created_at) as date,
        SUM(total - COALESCE(delivery_fee, 0)) as daily_sales
      FROM orders
      WHERE created_at >= DATE('now', '-6 months')
      AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;
    multiplier = 90; // days in quarter
    periodName = "ربع سنة";
  } else if (type === "yearly") {
    // Get last 12 months for monthly average
    historicalSql = `
      SELECT 
        strftime('%Y-%m', created_at) as month,
        SUM(total - COALESCE(delivery_fee, 0)) as monthly_sales
      FROM orders
      WHERE created_at >= DATE('now', '-12 months')
      AND status != 'cancelled'
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month ASC
    `;
    multiplier = 12; // months in year
    periodName = "سنة";
  }

  db.getDb().all(historicalSql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!rows || rows.length === 0) {
      return res.json({
        forecast: null,
        message: "لا توجد بيانات تاريخية كافية للتنبؤ",
      });
    }

    // Calculate statistics
    const values = rows.map((r) => r.daily_sales || r.monthly_sales);
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const stdDev = Math.sqrt(
      values.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / values.length,
    );

    // Projected values
    const projectedTotal = avg * multiplier;
    const projectedMin = min * multiplier;
    const projectedMax = max * multiplier;
    const projectedConservative = (avg - stdDev) * multiplier; // Conservative estimate (avg - 1 std dev)
    const projectedOptimistic = (avg + stdDev) * multiplier; // Optimistic estimate (avg + 1 std dev)

    // Growth trend (simple linear regression)
    let growthRate = 0;
    if (values.length >= 2) {
      const firstHalf = values.slice(0, Math.floor(values.length / 2));
      const secondHalf = values.slice(Math.floor(values.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg =
        secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      growthRate = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
    }

    // Adjust projection based on growth trend
    const adjustedProjection = projectedTotal * (1 + growthRate / 100);

    res.json({
      forecast: {
        period: periodName,
        projected: {
          total: Math.round(projectedTotal),
          conservative: Math.round(Math.max(0, projectedConservative)),
          optimistic: Math.round(projectedOptimistic),
          adjusted: Math.round(adjustedProjection),
        },
        averages: {
          daily: Math.round(avg),
          weekly: Math.round(avg * 7),
          monthly: Math.round(avg * 30),
        },
        range: {
          min: Math.round(projectedMin),
          max: Math.round(projectedMax),
        },
        growthRate: growthRate.toFixed(1),
        confidence:
          values.length >= 30 ? "high" : values.length >= 10 ? "medium" : "low",
        dataPoints: values.length,
      },
      historical: rows.slice(-30), // Last 30 data points
    });
  });
});

module.exports = router;
