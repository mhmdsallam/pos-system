const express = require("express");
const router = express.Router();
const db = require("../database/db");
const multer = require("multer");
const path = require("path");
const os = require("os");
const fs = require("fs");

// Import auth middleware
const { authMiddleware, requireRole } = require("../middleware/auth");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Only owner can access settings
router.use(requireRole("owner"));

// Upload handler for restore (max 50MB, temp folder)
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Get all settings
router.get("/", (req, res) => {
  const sql = "SELECT * FROM settings";

  db.getDb().all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    // Convert to key-value object
    const settings = {};
    rows.forEach((row) => {
      settings[row.key] = row.value;
    });

    res.json(settings);
  });
});

// Get single setting
router.get("/:key", (req, res) => {
  const sql = "SELECT * FROM settings WHERE key = ?";

  db.getDb().get(sql, [req.params.key], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row || { key: req.params.key, value: null });
  });
});

// Update setting
router.put("/:key", (req, res) => {
  const { value } = req.body;
  const sql = `
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
  `;

  db.getDb().run(sql, [req.params.key, value, value], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ key: req.params.key, value });
  });
});

// Download Database Backup (SQLite file)
router.get("/database/backup", (req, res) => {
  const dbPath = path.join(
    os.homedir(),
    "Documents",
    "RestaurantPOS",
    "pos.db",
  );
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .split("T")[0];
  const filename = `pos_backup_${timestamp}.db`;

  // Check if file exists
  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ error: "Database file not found" });
  }

  // Set proper headers for SQLite file
  res.setHeader("Content-Type", "application/x-sqlite3");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  // Stream the file
  const fileStream = fs.createReadStream(dbPath);
  fileStream.pipe(res);
});

// Restore Database from uploaded SQLite file
router.post("/database/restore", upload.single("dbfile"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "لم يتم رفع أي ملف" });
    }

    const uploadedPath = req.file.path;
    const originalName = req.file.originalname || "";
    if (!originalName.toLowerCase().endsWith(".db")) {
      fs.unlink(uploadedPath, () => {});
      return res
        .status(400)
        .json({ error: "الملف يجب أن يكون بصيغة SQLite (.db)" });
    }

    const targetDir = path.join(os.homedir(), "Documents", "RestaurantPOS");
    const targetPath = path.join(targetDir, "pos.db");

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Backup current DB if exists
    if (fs.existsSync(targetPath)) {
      const backupName = `pos.db.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      const backupPath = path.join(targetDir, backupName);
      fs.copyFileSync(targetPath, backupPath);
    }

    fs.copyFileSync(uploadedPath, targetPath);
    fs.unlink(uploadedPath, () => {});

    return res.json({
      message:
        "تم استعادة قاعدة البيانات بنجاح. يرجى إعادة تشغيل النظام لتطبيق التغييرات.",
      target: targetPath,
    });
  } catch (error) {
    console.error("Restore error:", error);
    return res.status(500).json({ error: "فشل في استعادة قاعدة البيانات" });
  }
});

// Export Complete Data as JSON
router.get("/database/export", async (req, res) => {
  try {
    const database = db.getDb();
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        exportDateArabic: new Date().toLocaleDateString("ar-EG", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        version: "1.0.0",
        systemName: "Restaurant POS System",
      },
      data: {},
    };

    // Categories
    const categories = await new Promise((resolve, reject) => {
      database.all(
        "SELECT * FROM categories ORDER BY sort_order, name",
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });
    exportData.data.categories = categories;

    // Products
    const products = await new Promise((resolve, reject) => {
      database.all(
        `
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN categories c ON p.category_id = c.id 
        ORDER BY p.category_id, p.name
      `,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });
    exportData.data.products = products;

    // Product Variations
    const variations = await new Promise((resolve, reject) => {
      database.all(
        `
        SELECT pv.*, p.name as product_name 
        FROM product_variations pv 
        LEFT JOIN products p ON pv.product_id = p.id 
        ORDER BY pv.product_id, pv.name
      `,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });
    exportData.data.productVariations = variations;

    // Combos
    const combos = await new Promise((resolve) => {
      database.all("SELECT * FROM combos ORDER BY name", [], (err, rows) => {
        if (err) {
          console.log("combos table may not exist:", err.message);
          resolve([]);
        } else {
          resolve(rows);
        }
      });
    });
    exportData.data.combos = combos || [];

    // Combo Items
    const comboItems = await new Promise((resolve) => {
      database.all(
        `
        SELECT ci.*, p.name as product_name, c.name as combo_name 
        FROM combo_items ci 
        LEFT JOIN products p ON ci.product_id = p.id 
        LEFT JOIN combos c ON ci.combo_id = c.id 
        ORDER BY ci.combo_id, ci.product_id
      `,
        [],
        (err, rows) => {
          if (err) {
            console.log("combo_items table may not exist:", err.message);
            resolve([]);
          } else {
            resolve(rows);
          }
        },
      );
    });
    exportData.data.comboItems = comboItems || [];

    // Orders
    const orders = await new Promise((resolve, reject) => {
      database.all(
        `
        SELECT o.*, u.full_name as cashier_name 
        FROM orders o 
        LEFT JOIN users u ON o.cashier_id = u.id 
        ORDER BY o.created_at DESC
      `,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });
    exportData.data.orders = orders;

    // Order Items
    const orderItems = await new Promise((resolve, reject) => {
      database.all(
        `
        SELECT oi.*, p.name as product_name, o.order_number 
        FROM order_items oi 
        LEFT JOIN products p ON oi.product_id = p.id 
        LEFT JOIN orders o ON oi.order_id = o.id 
        ORDER BY oi.order_id, oi.id
      `,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });
    exportData.data.orderItems = orderItems;

    // Customers
    const customers = await new Promise((resolve, reject) => {
      database.all("SELECT * FROM customers ORDER BY name", [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    exportData.data.customers = customers;

    // Users (without passwords)
    const users = await new Promise((resolve, reject) => {
      database.all(
        "SELECT id, username, full_name, role, active, created_at FROM users ORDER BY id",
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });
    exportData.data.users = users;

    // Employees
    const employees = await new Promise((resolve) => {
      database.all("SELECT * FROM employees ORDER BY name", [], (err, rows) => {
        if (err) {
          console.log("employees table may not exist:", err.message);
          resolve([]);
        } else {
          resolve(rows);
        }
      });
    });
    exportData.data.employees = employees || [];

    // Expenses
    const expenses = await new Promise((resolve) => {
      database.all(
        "SELECT * FROM expenses ORDER BY date DESC",
        [],
        (err, rows) => {
          if (err) {
            console.log("expenses table may not exist:", err.message);
            resolve([]);
          } else {
            resolve(rows);
          }
        },
      );
    });
    exportData.data.expenses = expenses || [];

    // Payrolls
    const payrolls = await new Promise((resolve) => {
      database.all(
        `
        SELECT p.*, e.name as employee_name 
        FROM payrolls p 
        LEFT JOIN employees e ON p.employee_id = e.id 
        ORDER BY p.payment_date DESC
      `,
        [],
        (err, rows) => {
          if (err) {
            console.log("payrolls table may not exist:", err.message);
            resolve([]);
          } else {
            resolve(rows);
          }
        },
      );
    });
    exportData.data.payrolls = payrolls || [];

    // Advances
    const advances = await new Promise((resolve) => {
      database.all(
        `
        SELECT a.*, e.name as employee_name 
        FROM advances a 
        LEFT JOIN employees e ON a.employee_id = e.id 
        ORDER BY a.date DESC
      `,
        [],
        (err, rows) => {
          if (err) {
            console.log("advances table may not exist:", err.message);
            resolve([]);
          } else {
            resolve(rows);
          }
        },
      );
    });
    exportData.data.advances = advances || [];

    // Inventory Categories
    const inventoryCategories = await new Promise((resolve) => {
      database.all(
        "SELECT * FROM inventory_categories ORDER BY sort_order, name",
        [],
        (err, rows) => {
          if (err) {
            console.log(
              "inventoryCategories table may not exist:",
              err.message,
            );
            resolve([]);
          } else {
            resolve(rows);
          }
        },
      );
    });
    exportData.data.inventoryCategories = inventoryCategories || [];

    // Inventory
    const inventory = await new Promise((resolve) => {
      database.all(
        `
        SELECT i.*, p.name as product_name 
        FROM inventory i 
        LEFT JOIN products p ON i.product_id = p.id 
        ORDER BY i.product_id
      `,
        [],
        (err, rows) => {
          if (err) {
            console.log("inventory table may not exist:", err.message);
            resolve([]);
          } else {
            resolve(rows);
          }
        },
      );
    });
    exportData.data.inventory = inventory || [];

    // Inventory Batches
    const inventoryBatches = await new Promise((resolve) => {
      database.all(
        `
        SELECT ib.*, p.name as product_name 
        FROM inventory_batches ib 
        LEFT JOIN products p ON ib.product_id = p.id 
        ORDER BY ib.received_date DESC
      `,
        [],
        (err, rows) => {
          if (err) {
            console.log("inventory_batches table may not exist:", err.message);
            resolve([]);
          } else {
            resolve(rows);
          }
        },
      );
    });
    exportData.data.inventoryBatches = inventoryBatches || [];

    // Settings
    const settings = await new Promise((resolve) => {
      database.all("SELECT * FROM settings", [], (err, rows) => {
        if (err) {
          console.log("settings table may not exist:", err.message);
          resolve([]);
        } else {
          resolve(rows);
        }
      });
    });
    exportData.data.settings = settings || [];

    // Statistics
    const stats = await new Promise((resolve) => {
      database.get(
        `
        SELECT 
          COUNT(DISTINCT id) as total_orders,
          SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END) as total_revenue,
          COUNT(DISTINCT CASE WHEN status = 'completed' THEN id END) as completed_orders
        FROM orders
      `,
        [],
        (err, row) => {
          if (err) {
            console.log("Error getting statistics:", err.message);
            resolve({ total_orders: 0, total_revenue: 0, completed_orders: 0 });
          } else {
            resolve(row);
          }
        },
      );
    });
    exportData.statistics = stats;

    // Set response headers for JSON download
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .substring(0, 19);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="restaurant_backup_${timestamp}.json"`,
    );
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
