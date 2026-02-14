const express = require("express");
const router = express.Router();
const db = require("../database/db");

// Import auth middleware
const { authMiddleware, requireRole } = require("../middleware/auth");

// Apply auth middleware to all routes
router.use(authMiddleware);

// --- 1. Get Inventory Summary (Main Page) ---
router.get("/", (req, res) => {
  const { filter, search, category_id } = req.query; // filter: 'low', 'out', 'expired', 'expiring'

  let sql = `
    SELECT i.*, p.name as product_name, p.category_id as product_category_id, c.name as product_category_name, p.image,
           ic.name as inventory_category_name, ic.color as inventory_category_color, ic.icon as inventory_category_icon,
           (SELECT COUNT(*) FROM inventory_batches b WHERE b.product_id = i.product_id AND b.quantity > 0 AND b.expiry_date < date('now')) as expired_batches_count,
           (SELECT COUNT(*) FROM inventory_batches b WHERE b.product_id = i.product_id AND b.quantity > 0 AND b.expiry_date BETWEEN date('now') AND date('now', '+7 days')) as expiring_batches_count
    FROM inventory i
    JOIN products p ON i.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN inventory_categories ic ON i.category_id = ic.id
    WHERE 1=1
  `;

  const params = [];

  if (search) {
    sql += ` AND (p.name LIKE ? OR c.name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  if (category_id) {
    sql += ` AND i.category_id = ?`;
    params.push(category_id);
  }

  if (filter === "low") {
    sql += ` AND i.quantity <= i.min_quantity AND i.quantity > 0`;
  } else if (filter === "out") {
    sql += ` AND i.quantity = 0`;
  }
  // For 'expired' and 'expiring', we filter in JS or allow all and let frontend filter based on counts

  sql += ` ORDER BY ic.sort_order ASC, p.name ASC`;

  db.getDb().all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Post-processing for expired filter if needed strictly from DB,
    // but here we just pass the flags.
    res.json(rows);
  });
});

// --- 2. Get Batches for a Product ---
router.get("/:product_id/batches", (req, res) => {
  const sql = `
    SELECT * FROM inventory_batches 
    WHERE product_id = ? AND quantity > 0
    ORDER BY expiry_date ASC, received_date ASC
  `;
  db.getDb().all(sql, [req.params.product_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- 3. Add New Batch (Owner and Products Manager) ---
router.post("/batch", requireRole("owner", "products_manager"), (req, res) => {
  const {
    product_id,
    product_name,
    quantity,
    cost_price,
    expiry_date,
    supplier,
    notes,
    category_id,
  } = req.body;

  if (
    (!product_id && !product_name) ||
    quantity === undefined ||
    quantity === null ||
    quantity === "" ||
    cost_price === undefined ||
    cost_price === null ||
    cost_price === ""
  ) {
    return res
      .status(400)
      .json({ error: "البيانات الأساسية مطلوبة (المنتج، الكمية، التكلفة)" });
  }

  // Validate expiry date - prevent adding expired products
  if (expiry_date) {
    const expiryDateObj = new Date(expiry_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day

    if (expiryDateObj < today) {
      return res.status(400).json({
        error: "لا يمكن إضافة منتج صلاحيته منتهية",
        message: "Cannot add expired product",
        expiryDate: expiry_date,
      });
    }
  }

  const dbInstance = db.getDb();

  dbInstance.serialize(() => {
    dbInstance.run("BEGIN TRANSACTION");

    const proceedWithBatch = (finalProductId) => {
      // 1. Add to batches
      const batchSql = `
          INSERT INTO inventory_batches (product_id, quantity, original_quantity, cost_price, expiry_date, supplier, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

      dbInstance.run(
        batchSql,
        [
          finalProductId,
          quantity,
          quantity,
          cost_price,
          expiry_date,
          supplier,
          notes,
        ],
        function (err) {
          if (err) {
            dbInstance.run("ROLLBACK");
            return res.status(500).json({ error: err.message });
          }

          // 2. Update Summary Table (Inventory)
          // Check if exists first
          dbInstance.get(
            "SELECT quantity, avg_cost FROM inventory WHERE product_id = ?",
            [finalProductId],
            (err, row) => {
              if (err) {
                dbInstance.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
              }

              if (row) {
                // Update logic: New Weighted Average Cost
                const oldQty = row.quantity;
                const oldAvg = row.avg_cost || 0;
                const newTotalQty = oldQty + parseInt(quantity);
                const newAvgCost =
                  newTotalQty > 0
                    ? (oldQty * oldAvg +
                        parseInt(quantity) * parseFloat(cost_price)) /
                      newTotalQty
                    : parseFloat(cost_price);

                let updateSQL =
                  "UPDATE inventory SET quantity = ?, avg_cost = ?, last_updated = CURRENT_TIMESTAMP";
                let updateParams = [newTotalQty, newAvgCost];

                if (category_id) {
                  updateSQL += ", category_id = ?";
                  updateParams.push(category_id);
                }

                updateSQL += " WHERE product_id = ?";
                updateParams.push(finalProductId);

                dbInstance.run(updateSQL, updateParams, (err) => {
                  if (err) {
                    dbInstance.run("ROLLBACK");
                    return res.status(500).json({ error: err.message });
                  }
                  dbInstance.run("COMMIT");
                  res.json({
                    message: "تم إضافة الدفعة بنجاح",
                    product_id: finalProductId,
                  });
                });
              } else {
                // Insert new
                dbInstance.run(
                  "INSERT INTO inventory (product_id, quantity, avg_cost, min_quantity, category_id) VALUES (?, ?, ?, 5, ?)",
                  [finalProductId, quantity, cost_price, category_id || null],
                  (err) => {
                    if (err) {
                      dbInstance.run("ROLLBACK");
                      return res.status(500).json({ error: err.message });
                    }
                    dbInstance.run("COMMIT");
                    res.json({
                      message: "تم إضافة الدفعة بنجاح",
                      product_id: finalProductId,
                    });
                  },
                );
              }
            },
          );
        },
      );
    };

    if (product_id) {
      proceedWithBatch(product_id);
    } else {
      // Create new PRODUCT for inventory (Available for POS)
      dbInstance.run(
        `INSERT INTO products (name, price, cost_price, available, description, category_id, is_menu_item) VALUES (?, ?, ?, 1, 'New Inventory Item', NULL, 0)`,
        [product_name, cost_price, cost_price],
        function (err) {
          if (err) {
            dbInstance.run("ROLLBACK");
            return res
              .status(500)
              .json({ error: "Failed to create new product: " + err.message });
          }
          proceedWithBatch(this.lastID);
        },
      );
    }
  });
});

// --- 4. Deduct Logic (Used by Orders internally or Manual Adjustment) ---
// This is exposed as an API for Manual Adjustment (Loss/Damage/Correction)
router.post("/deduct", requireRole("owner", "products_manager"), (req, res) => {
  const { product_id, quantity, reason } = req.body; // quantity here is amount to REMOVE (positive number)

  if (!product_id || !quantity)
    return res.status(400).json({ error: "بيانات ناقصة" });

  const dbInstance = db.getDb();

  dbInstance.serialize(() => {
    dbInstance.run("BEGIN TRANSACTION");

    // Fetch batches FIFO
    dbInstance.all(
      "SELECT * FROM inventory_batches WHERE product_id = ? AND quantity > 0 ORDER BY expiry_date ASC, received_date ASC",
      [product_id],
      (err, batches) => {
        if (err) {
          dbInstance.run("ROLLBACK");
          return res.status(500).json({ error: err.message });
        }

        let remainingToDeduct = parseInt(quantity);
        let totalCostDeducted = 0; // if we want to track loss value

        const batchUpdates = [];

        for (const batch of batches) {
          if (remainingToDeduct <= 0) break;

          const deductFromBatch = Math.min(batch.quantity, remainingToDeduct);
          remainingToDeduct -= deductFromBatch;
          totalCostDeducted += deductFromBatch * batch.cost_price;

          batchUpdates.push(
            new Promise((resolve, reject) => {
              dbInstance.run(
                "UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?",
                [deductFromBatch, batch.id],
                (err) => (err ? reject(err) : resolve()),
              );
            }),
          );
        }

        if (remainingToDeduct > 0) {
          // Not enough stock
          dbInstance.run("ROLLBACK");
          return res
            .status(400)
            .json({ error: "الكمية المطلوبة أكبر من المتوفر في المخزون" });
        }

        Promise.all(batchUpdates)
          .then(() => {
            // Update Summary
            dbInstance.run(
              "UPDATE inventory SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP WHERE product_id = ?",
              [quantity, product_id],
              (err) => {
                if (err) {
                  dbInstance.run("ROLLBACK");
                  return res.status(500).json({ error: err.message });
                }
                dbInstance.run("COMMIT");
                res.json({ message: "تم خصم الكمية بنجاح" });
              },
            );
          })
          .catch((err) => {
            dbInstance.run("ROLLBACK");
            res.status(500).json({ error: err.message });
          });
      },
    );
  });
});

// --- 5. Alerts Endpoint (Enhanced) ---
router.get("/alerts", (req, res) => {
  const sql = `
    SELECT 
        i.product_id, p.name as product_name, i.quantity as total_quantity, i.min_quantity,
        (SELECT MIN(expiry_date) FROM inventory_batches b WHERE b.product_id = i.product_id AND b.quantity > 0) as nearest_expiry,
        CASE 
            WHEN i.quantity = 0 THEN 'out_of_stock'
            WHEN i.quantity <= i.min_quantity THEN 'low_stock'
            ELSE 'ok'
        END as stock_status
    FROM inventory i
    JOIN products p ON i.product_id = p.id
    WHERE i.quantity <= i.min_quantity 
       OR EXISTS (SELECT 1 FROM inventory_batches b WHERE b.product_id = i.product_id AND b.quantity > 0 AND b.expiry_date <= date('now', '+7 days'))
  `;

  db.getDb().all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- 5. Export Inventory to CSV (Owner and Products Manager) ---
router.get("/export", requireRole("owner", "products_manager"), (req, res) => {
  const { filter, search, category_id } = req.query;

  let sql = `
    SELECT 
      p.name as 'اسم المنتج',
      c.name as 'الفئة',
      i.quantity as 'الكمية',
      i.unit as 'الوحدة',
      i.avg_cost as 'متوسط التكلفة',
      (i.quantity * i.avg_cost) as 'إجمالي القيمة',
      i.min_quantity as 'الحد الأدنى',
      CASE 
        WHEN i.quantity <= 0 THEN 'نافذ'
        WHEN i.quantity <= i.min_quantity THEN 'منخفض'
        ELSE 'مستقر'
      END as 'الحالة',
      (SELECT COUNT(*) FROM inventory_batches b WHERE b.product_id = i.product_id AND b.quantity > 0 AND b.expiry_date < date('now')) as 'دفعات منتهية',
      (SELECT COUNT(*) FROM inventory_batches b WHERE b.product_id = i.product_id AND b.quantity > 0 AND b.expiry_date BETWEEN date('now') AND date('now', '+7 days')) as 'دفعات تنتهي قريباً'
    FROM inventory i
    JOIN products p ON i.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN inventory_categories ic ON i.category_id = ic.id
    WHERE 1=1
  `;

  const params = [];

  if (search) {
    sql += ` AND (p.name LIKE ? OR c.name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  if (category_id) {
    sql += ` AND i.category_id = ?`;
    params.push(category_id);
  }

  if (filter === "low") {
    sql += ` AND i.quantity <= i.min_quantity AND i.quantity > 0`;
  } else if (filter === "out") {
    sql += ` AND i.quantity <= 0`;
  } else if (filter === "expired") {
    sql += ` AND (SELECT COUNT(*) FROM inventory_batches b WHERE b.product_id = i.product_id AND b.quantity > 0 AND b.expiry_date < date('now')) > 0`;
  } else if (filter === "expiring") {
    sql += ` AND (SELECT COUNT(*) FROM inventory_batches b WHERE b.product_id = i.product_id AND b.quantity > 0 AND b.expiry_date BETWEEN date('now') AND date('now', '+7 days')) > 0`;
  }

  sql += ` ORDER BY p.name`;

  db.getDb().all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Convert to CSV
    if (rows.length === 0) {
      return res.status(404).json({ error: "لا توجد بيانات للتصدير" });
    }

    // CSV headers
    const headers = Object.keys(rows[0]);
    let csv = "\uFEFF" + headers.join(",") + "\n"; // BOM for Excel UTF-8

    // CSV rows
    rows.forEach((row) => {
      const values = headers.map((header) => {
        let val = row[header] ?? "";
        // Escape commas and quotes
        if (String(val).includes(",") || String(val).includes('"')) {
          val = `"${String(val).replace(/"/g, '""')}"`;
        }
        return val;
      });
      csv += values.join(",") + "\n";
    });

    // Set headers for download
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=inventory_${new Date().toISOString().split("T")[0]}.csv`,
    );
    res.send(csv);
  });
});

// --- 6. Inventory Categories Management ---

// Get All Inventory Categories
router.get("/categories", (req, res) => {
  const sql =
    "SELECT * FROM inventory_categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC";
  db.getDb().all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create New Category (Owner and Products Manager)
router.post(
  "/categories",
  requireRole("owner", "products_manager"),
  (req, res) => {
    const { name, description, icon, color, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({ error: "اسم الفئة مطلوب" });
    }

    const sql = `
    INSERT INTO inventory_categories (name, description, icon, color, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `;

    db.getDb().run(
      sql,
      [
        name,
        description || null,
        icon || null,
        color || "#6b7280",
        sort_order || 0,
      ],
      function (err) {
        if (err) {
          if (err.message.includes("UNIQUE")) {
            return res.status(400).json({ error: "اسم الفئة موجود مسبقاً" });
          }
          return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, message: "تم إنشاء الفئة بنجاح" });
      },
    );
  },
);

// Update Category (Owner and Products Manager)
router.put(
  "/categories/:id",
  requireRole("owner", "products_manager"),
  (req, res) => {
    const { name, description, icon, color, sort_order, is_active } = req.body;

    const sql = `
    UPDATE inventory_categories 
    SET name = COALESCE(?, name),
        description = COALESCE(?, description),
        icon = COALESCE(?, icon),
        color = COALESCE(?, color),
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active)
    WHERE id = ?
  `;

    db.getDb().run(
      sql,
      [name, description, icon, color, sort_order, is_active, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "تم تحديث الفئة بنجاح" });
      },
    );
  },
);

// Delete Category (Owner and Products Manager)
router.delete(
  "/categories/:id",
  requireRole("owner", "products_manager"),
  (req, res) => {
    db.getDb().run(
      "UPDATE inventory_categories SET is_active = 0 WHERE id = ?",
      [req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "تم حذف الفئة بنجاح" });
      },
    );
  },
);

// Update Inventory Quantity (Owner Only)
router.patch("/:product_id/quantity", requireRole("owner"), (req, res) => {
  const { quantity, reason } = req.body;
  const product_id = req.params.product_id;

  if (quantity === undefined || quantity === null) {
    return res.status(400).json({ error: "الكمية مطلوبة" });
  }

  const newQuantity = parseInt(quantity);
  if (isNaN(newQuantity) || newQuantity < 0) {
    return res.status(400).json({ error: "الكمية غير صحيحة" });
  }

  const dbInstance = db.getDb();

  dbInstance.serialize(() => {
    // Get current inventory
    dbInstance.get(
      "SELECT quantity FROM inventory WHERE product_id = ?",
      [product_id],
      (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row)
          return res.status(404).json({ error: "المنتج غير موجود في المخزون" });

        const oldQuantity = row.quantity;

        // Update inventory quantity
        dbInstance.run(
          "UPDATE inventory SET quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE product_id = ?",
          [newQuantity, product_id],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });

            res.json({
              message: "تم تحديث الكمية بنجاح",
              product_id: product_id,
              oldQuantity: oldQuantity,
              newQuantity: newQuantity,
              difference: newQuantity - oldQuantity,
              reason: reason || "تحديث يدوي",
            });
          },
        );
      },
    );
  });
});

// Delete Inventory Item (Owner Only)
router.delete("/:product_id", requireRole("owner"), (req, res) => {
  const forceDelete = req.query.force === "true";

  // Check if product has any batches
  db.getDb().get(
    "SELECT COUNT(*) as batch_count FROM inventory_batches WHERE product_id = ?",
    [req.params.product_id],
    (err, batchResult) => {
      if (err) return res.status(500).json({ error: err.message });

      if (batchResult.batch_count > 0 && !forceDelete) {
        return res.status(400).json({
          error: "لا يمكن حذف صنف المخزون لأنه يحتوي على دفعات",
          message: "Cannot delete inventory item because it has batches",
          batchCount: batchResult.batch_count,
        });
      }

      // If force delete, remove batches first
      if (batchResult.batch_count > 0 && forceDelete) {
        const batchCount = batchResult.batch_count;

        db.getDb().run(
          "DELETE FROM inventory_batches WHERE product_id = ?",
          [req.params.product_id],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });

            // Then delete inventory record
            db.getDb().run(
              "DELETE FROM inventory WHERE product_id = ?",
              [req.params.product_id],
              function (err) {
                if (err) return res.status(500).json({ error: err.message });
                if (this.changes === 0) {
                  return res
                    .status(404)
                    .json({ error: "صنف المخزون غير موجود" });
                }
                res.json({
                  message: "تم حذف صنف المخزون نهائياً مع جميع الدفعات",
                  product_id: req.params.product_id,
                  deletedBatches: batchCount,
                });
              },
            );
          },
        );
        return;
      }

      // If no batches, proceed with normal deletion
      db.getDb().run(
        "DELETE FROM inventory WHERE product_id = ?",
        [req.params.product_id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          if (this.changes === 0) {
            return res.status(404).json({ error: "صنف المخزون غير موجود" });
          }
          res.json({
            message: "تم حذف صنف المخزون بنجاح",
            product_id: req.params.product_id,
          });
        },
      );
    },
  );
});

// Update Product's Inventory Category (Owner Only)
router.patch("/:product_id/category", requireRole("owner"), (req, res) => {
  const { category_id } = req.body;

  db.getDb().run(
    "UPDATE inventory SET category_id = ?, last_updated = CURRENT_TIMESTAMP WHERE product_id = ?",
    [category_id, req.params.product_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) {
        return res.status(404).json({ error: "المنتج غير موجود في المخزون" });
      }
      res.json({ message: "تم تحديث فئة المنتج بنجاح" });
    },
  );
});

module.exports = router;
