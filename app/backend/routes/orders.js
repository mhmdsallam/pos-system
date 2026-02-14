const express = require("express");
const router = express.Router();
const db = require("../database/db");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// Shift Summary Endpoint - Get active shift summary
router.get("/shift-summary", (req, res) => {
  const userId = req.user.id;

  // First, get the active shift for this cashier (with starting cash)
  const getActiveShiftSQL = `
        SELECT id, starting_cash
        FROM shifts 
        WHERE cashier_id = ? AND status = 'open'
        ORDER BY start_time DESC
        LIMIT 1
    `;

  db.getDb().get(getActiveShiftSQL, [userId], (err, shift) => {
    if (err) return res.status(500).json({ error: err.message });

    // If no active shift, return empty summary
    if (!shift) {
      return res.json({
        total_orders: 0,
        total_sales: 0,
        cash_sales: 0,
        visa_sales: 0,
        total_expenses: 0,
        expenses_details: [],
        net_cash: 0,
        starting_cash: 0,
        shift_id: null,
      });
    }

    const shiftId = shift.id;

    // Get sales data for this specific shift (delivery fees not included in sales)
    const sqlSales = `
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total - COALESCE(delivery_fee, 0)), 0) as total_sales
            FROM orders 
            WHERE shift_id = ? AND status != 'cancelled'
        `;

    const sqlExpenses = `
            SELECT COALESCE(SUM(amount), 0) as total_expenses
            FROM expenses
            WHERE shift_id = ?
        `;

    db.getDb().get(sqlSales, [shiftId], (err, salesRow) => {
      if (err) return res.status(500).json({ error: err.message });

      // Get total expenses for this shift
      db.getDb().get(sqlExpenses, [shiftId], (err, expenseRow) => {
        if (err) return res.status(500).json({ error: err.message });

        const totalExpenses = expenseRow ? expenseRow.total_expenses : 0;

        // Get detailed expenses list for this shift
        const sqlExpensesList = `SELECT id, category, description, amount, date FROM expenses WHERE shift_id = ? ORDER BY date DESC`;
        db.getDb().all(sqlExpensesList, [shiftId], (err, expensesList) => {
          if (err) return res.status(500).json({ error: err.message });

          const startingCash = shift.starting_cash || 0;
          const expectedCash =
            startingCash + (salesRow.cash_sales || 0) - totalExpenses;

          res.json({
            ...salesRow,
            total_expenses: totalExpenses,
            expenses_details: expensesList || [],
            net_cash: expectedCash,
            starting_cash: startingCash,
            shift_id: shiftId,
          });
        });
      });
    });
  });
});

// Get next order number helper
const getNextOrderNumber = () => {
  return new Promise((resolve, reject) => {
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

    db.getDb().get(
      `SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY id DESC LIMIT 1`,
      [`${todayStr}%`],
      (err, row) => {
        if (err) return reject(err);

        if (row && row.order_number) {
          // Extract sequence number
          const currentSeq = parseInt(row.order_number.slice(8));
          const nextSeq = currentSeq + 1;
          resolve(`${todayStr}${nextSeq.toString().padStart(4, "0")}`);
        } else {
          // Start new sequence for today
          resolve(`${todayStr}0001`);
        }
      },
    );
  });
};

// Customer Lookup Endpoint (Used by POS for auto-complete)
router.get("/customers/lookup", (req, res) => {
  const { phone } = req.query;

  if (!phone || phone.length < 4) {
    return res
      .status(400)
      .json({ error: "رقم الهاتف يجب أن يكون 4 أرقام على الأقل" });
  }

  db.getDb().get(
    "SELECT name, phone, address FROM customers WHERE phone LIKE ? ORDER BY total_orders DESC LIMIT 1",
    [`%${phone}%`],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row)
        return res.status(404).json({ error: "لا يوجد عميل بهذا الرقم" });
      res.json(row);
    },
  );
});

// Create New Order (Main POS Function)
router.post("/", async (req, res) => {
  const {
    items,
    table_number,
    order_type,
    payment_method,
    cashier_id,
    shift_id,
    branch_id,
    discount_percentage,
    discount_amount,
    delivery_fee,
    notes,
    customer_name,
    customer_phone,
    customer_address,
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "لا توجد منتجات في الطلب" });
  }

  // Validation: Check for negative values
  if (items.some((item) => item.quantity <= 0)) {
    return res.status(400).json({ error: "الكمية يجب أن تكون أكبر من صفر" });
  }
  if (
    (discount_percentage && discount_percentage < 0) ||
    (discount_amount && discount_amount < 0) ||
    (delivery_fee && delivery_fee < 0)
  ) {
    return res
      .status(400)
      .json({ error: "لا يمكن استخدام قيم سالبة للخصم أو التوصيل" });
  }

  // Helper to enable await/async with sqlite
  const runAsync = (sql, params) =>
    new Promise((resolve, reject) => {
      db.getDb().run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  const getAsync = (sql, params) =>
    new Promise((resolve, reject) =>
      db.getDb().get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }),
    );
  const allAsync = (sql, params) =>
    new Promise((resolve, reject) =>
      db.getDb().all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }),
    );

  try {
    const orderNumber = await getNextOrderNumber();

    // Calculate Totals again on server side for security (optional but recommended)
    // For now, we trust frontend calculations passed in request or just recalculate basics if needed.
    // We will respect total passed from frontend usually or recalculate.
    // Let's assume frontend sends correct totals for simple POS logic.

    // However, we need to handle subtotal
    const subtotal =
      req.body.subtotal ||
      items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const finalDiscountAmount =
      discount_amount || (subtotal * (discount_percentage || 0)) / 100;
    const finalDeliveryFee = delivery_fee || 0;
    const total = Math.max(
      0,
      subtotal - finalDiscountAmount + finalDeliveryFee,
    );

    // Determine Initial Status & Completion Time
    // For POS, we start as 'pending' to allow kitchen workflow.
    // Sales are counted immediately as long as it's not cancelled.
    const initialStatus = req.body.status || "pending";
    const completedAt =
      initialStatus === "completed" ? new Date().toISOString() : null;

    // 1. Insert Order
    const orderResult = await runAsync(
      `INSERT INTO orders (
                order_number, table_number, subtotal, discount_percentage, discount_amount, 
                delivery_fee, total, status, completed_at, payment_method, cashier_id, shift_id, notes, branch_id, 
                order_type, customer_name, customer_phone, customer_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        table_number || null,
        subtotal,
        discount_percentage || 0,
        finalDiscountAmount,
        finalDeliveryFee,
        total,
        initialStatus,
        completedAt,
        payment_method,
        cashier_id,
        shift_id || null,
        notes,
        branch_id || 1,
        order_type || "dine_in",
        customer_name,
        customer_phone,
        customer_address,
      ],
    );

    const orderId = orderResult.lastID;

    // 2. Process Items (FIFO & Costing)
    for (const item of items) {
      let quantityToDeduct = item.quantity;
      let totalItemCost = 0;
      let finalUnitCost = 0; // Cost Price Per Unit for this sale

      if (item.product_id && !item.is_combo) {
        // Only deduct for real products
        // Get batches FIFO
        const batches = await allAsync(
          "SELECT * FROM inventory_batches WHERE product_id = ? AND quantity > 0 ORDER BY expiry_date ASC, received_date ASC",
          [item.product_id],
        );

        if (batches && batches.length > 0) {
          for (const batch of batches) {
            if (quantityToDeduct <= 0) break;
            const deduct = Math.min(batch.quantity, quantityToDeduct);

            await runAsync(
              "UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?",
              [deduct, batch.id],
            );

            totalItemCost += deduct * batch.cost_price;
            quantityToDeduct -= deduct;
          }

          // Update Summary
          await runAsync(
            "UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?",
            [item.quantity, item.product_id],
          );

          if (quantityToDeduct > 0) {
            // Stock shortage covered by "unknown" cost (use avg or last known or 0)
            const summary = await getAsync(
              "SELECT avg_cost FROM inventory WHERE product_id = ?",
              [item.product_id],
            );
            const fallbackCost = summary ? summary.avg_cost : 0;
            totalItemCost += quantityToDeduct * fallbackCost;
          }
        } else {
          // No batches - use product cost_price or inventory avg_cost
          const productCost = await getAsync(
            `SELECT 
              COALESCE(i.avg_cost, p.cost_price, 0) as cost 
             FROM products p 
             LEFT JOIN inventory i ON p.id = i.product_id 
             WHERE p.id = ?`,
            [item.product_id],
          );
          const fallbackCost = productCost ? productCost.cost : 0;
          totalItemCost = item.quantity * fallbackCost;

          // Still update inventory (allows negative stock for POS)
          await runAsync(
            "UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?",
            [item.quantity, item.product_id],
          );
        }

        // Calculate weighted average cost for this specific item line
        finalUnitCost = item.quantity > 0 ? totalItemCost / item.quantity : 0;
      } else if (item.is_combo && item.combo_id) {
        // For combos, calculate cost from combo items
        const comboItems = await allAsync(
          `SELECT ci.quantity, p.cost_price 
           FROM combo_items ci 
           JOIN products p ON ci.product_id = p.id 
           WHERE ci.combo_id = ?`,
          [item.combo_id],
        );

        if (comboItems && comboItems.length > 0) {
          const comboCost = comboItems.reduce(
            (sum, ci) => sum + ci.cost_price * ci.quantity,
            0,
          );
          finalUnitCost = comboCost * item.quantity;
          totalItemCost = finalUnitCost;
        }
      }

      // Insert Order Item
      const isComboItem = item.is_combo || false;
      const productId = isComboItem ? null : item.product_id || item.id;
      const comboId = isComboItem ? item.combo_id || item.id : null;

      await runAsync(
        `INSERT INTO order_items (order_id, product_id, combo_id, quantity, price, cost_price, notes, variation_id, is_combo, is_spicy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          productId,
          comboId,
          item.quantity,
          item.price,
          item.cost_price || finalUnitCost,
          item.notes,
          item.variation_id || null,
          isComboItem ? 1 : 0,
          item.is_spicy ? 1 : 0,
        ],
      );
    }

    // 3. Handle Customer Data
    if (customer_phone) {
      const existing = await getAsync(
        "SELECT id FROM customers WHERE phone = ?",
        [customer_phone],
      );
      if (existing) {
        await runAsync(
          `UPDATE customers SET 
                        name = ?, address = COALESCE(?, address), 
                        total_orders = total_orders + 1, total_spent = total_spent + ?, 
                        updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?`,
          [customer_name, customer_address, total, existing.id],
        );
        await runAsync("UPDATE orders SET customer_id = ? WHERE id = ?", [
          existing.id,
          orderId,
        ]);
      } else {
        const newCust = await runAsync(
          `INSERT INTO customers (name, phone, address, first_order_date, total_orders, total_spent) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1, ?)`,
          [
            customer_name || "عميل جديد",
            customer_phone,
            customer_address,
            total,
          ],
        );
        await runAsync("UPDATE orders SET customer_id = ? WHERE id = ?", [
          newCust.lastID,
          orderId,
        ]);
      }
    }

    res.status(201).json({
      message: "تم إنشاء الطلب بنجاح",
      order_id: orderId,
      order_number: orderNumber,
    });
  } catch (err) {
    console.error("Order Creation Error:", err);
    res.status(500).json({ error: "فشل إنشاء الطلب: " + err.message });
  }
});

// Get Orders List
router.get("/", (req, res) => {
  const { status, date, search } = req.query;
  let sql = `
        SELECT o.*, u.full_name as cashier_name 
        FROM orders o 
        LEFT JOIN users u ON o.cashier_id = u.id 
        WHERE 1=1
    `;
  const params = [];

  if (status) {
    sql += " AND o.status = ?";
    params.push(status);
  }

  if (date) {
    sql += " AND o.created_at >= ? AND o.created_at <= ?";
    params.push(date + " 00:00:00", date + " 23:59:59");
  }

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    sql +=
      " AND (" +
      "LOWER(o.order_number) LIKE LOWER(?) OR " +
      "LOWER(IFNULL(o.customer_name, '')) LIKE LOWER(?) OR " +
      "IFNULL(o.customer_phone, '') LIKE ? OR " +
      "CAST(IFNULL(o.table_number, '') AS TEXT) LIKE ?" +
      ")";
    params.push(term, term, term, term);
  }

  sql += " ORDER BY o.id DESC LIMIT 100";

  db.getDb().all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!rows || rows.length === 0) return res.json([]);

    // Batch-fetch ALL items for ALL orders in a single query (eliminates N+1)
    const orderIds = rows.map((o) => o.id);
    const placeholders = orderIds.map(() => "?").join(",");
    const itemsSql = `
      SELECT oi.*, p.name as product_name, p.image, pv.name as variation_name 
      FROM order_items oi 
      LEFT JOIN products p ON oi.product_id = p.id 
      LEFT JOIN product_variations pv ON oi.variation_id = pv.id 
      WHERE oi.order_id IN (${placeholders})
    `;

    db.getDb().all(itemsSql, orderIds, (err2, allItems) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // Group items by order_id
      const itemsByOrder = {};
      (allItems || []).forEach((item) => {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
        itemsByOrder[item.order_id].push(item);
      });

      const ordersWithItems = rows.map((order) => ({
        ...order,
        items: JSON.stringify(itemsByOrder[order.id] || []),
      }));
      res.json(ordersWithItems);
    });
  });
});

// Update Order Status
router.patch("/:id/status", async (req, res) => {
  const { status } = req.body;
  const orderId = req.params.id;

  try {
    // 1. Get current order status
    const currentOrder = await new Promise((resolve, reject) => {
      db.getDb().get(
        "SELECT status FROM orders WHERE id = ?",
        [orderId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        },
      );
    });

    if (!currentOrder)
      return res.status(404).json({ error: "Order not found" });

    // If trying to cancel, and it wasn't cancelled before
    if (status === "cancelled" && currentOrder.status !== "cancelled") {
      // Restore Stock
      const items = await new Promise((resolve, reject) => {
        db.getDb().all(
          "SELECT * FROM order_items WHERE order_id = ?",
          [orderId],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          },
        );
      });

      for (const item of items) {
        if (item.product_id) {
          // Only real products
          await new Promise((resolve, reject) => {
            db.getDb().run(
              "UPDATE inventory SET quantity = quantity + ? WHERE product_id = ?",
              [item.quantity, item.product_id],
              (err) => {
                if (err) reject(err);
                else resolve();
              },
            );
          });
        }
      }
    }

    // 2. Update Status
    db.getDb().run(
      "UPDATE orders SET status = ?, completed_at = ? WHERE id = ?",
      [
        status,
        status === "completed" ? new Date().toISOString() : null, // If completed, set time
        orderId,
      ],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Order status updated" });
      },
    );
  } catch (err) {
    console.error("Error updating order status:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get Order Details
router.get("/:id", (req, res) => {
  const sql = `
        SELECT o.*, u.full_name as cashier_name
        FROM orders o
        LEFT JOIN users u ON o.cashier_id = u.id
        WHERE o.id = ?
    `;

  db.getDb().get(sql, [req.params.id], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: "Order not found" });

    const itemsSql = `
            SELECT oi.*, p.name as product_name, p.image, pv.name as variation_name
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            LEFT JOIN product_variations pv ON oi.variation_id = pv.id
            WHERE oi.order_id = ?
        `;

    db.getDb().all(itemsSql, [req.params.id], (err, items) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ...order, items });
    });
  });
});

module.exports = router;
