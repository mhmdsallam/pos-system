const express = require("express");
const router = express.Router();
const db = require("../database/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { getUploadsDir } = require("../utils/paths");

// Import auth middleware
const { authMiddleware, requireRole } = require("../middleware/auth");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Configure Multer Storage (write to external uploads dir to work in packaged app)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = getUploadsDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Get all active combos
router.get("/", (req, res) => {
  const { is_active } = req.query;

  let sql = `SELECT * FROM combos`;
  const params = [];

  if (is_active !== undefined) {
    sql += ` WHERE is_active = ?`;
    params.push(is_active === "true" ? 1 : 0);
  }

  sql += ` ORDER BY created_at DESC`;

  db.getDb().all(sql, params, (err, combos) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (combos.length === 0) {
      return res.json([]);
    }

    // Get combo items for each combo
    const comboIds = combos.map((c) => c.id).join(",");
    const itemsSql = `
      SELECT ci.*, p.name as product_name, p.image, p.price as product_price
      FROM combo_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.combo_id IN (${comboIds})
    `;

    db.getDb().all(itemsSql, [], (err, items) => {
      if (err) {
        return res.json(combos);
      }

      const combosWithItems = combos.map((c) => ({
        ...c,
        items: items.filter((i) => i.combo_id === c.id),
      }));

      res.json(combosWithItems);
    });
  });
});

// Get single combo
router.get("/:id", (req, res) => {
  const comboSql = `SELECT * FROM combos WHERE id = ?`;

  db.getDb().get(comboSql, [req.params.id], (err, combo) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!combo) {
      return res.status(404).json({ error: "العرض غير موجود" });
    }

    const itemsSql = `
      SELECT ci.*, p.name as product_name, p.image, p.price as product_price
      FROM combo_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.combo_id = ?
    `;

    db.getDb().all(itemsSql, [req.params.id], (err, items) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ ...combo, items });
    });
  });
});

// Create combo (Owner and Products Manager)
router.post(
  "/",
  requireRole("owner", "products_manager"),
  upload.single("image"),
  (req, res) => {
    let {
      name,
      description,
      price,
      original_price,
      discount_percentage,
      start_date,
      end_date,
      is_active,
      items,
    } = req.body;

    const image = req.file ? `/uploads/${req.file.filename}` : null;

    // Parse items if it's a string
    let parsedItems = [];
    try {
      if (typeof items === "string") {
        parsedItems = JSON.parse(items);
      } else if (Array.isArray(items)) {
        parsedItems = items;
      }
    } catch (e) {
      return res.status(400).json({ error: "خطأ في تنسيق المنتجات" });
    }

    if (!parsedItems || parsedItems.length === 0) {
      return res.status(400).json({ error: "يجب إضافة منتجات للعرض" });
    }

    // Calculate discount percentage if not provided
    if (!discount_percentage && original_price && price) {
      discount_percentage = ((original_price - price) / original_price) * 100;
    }

    const sql = `
    INSERT INTO combos (name, description, price, original_price, discount_percentage, image, is_active, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    db.getDb().run(
      sql,
      [
        name,
        description,
        price,
        original_price || price,
        discount_percentage || 0,
        image,
        is_active === "true" || is_active === true ? 1 : 0,
        start_date || null,
        end_date || null,
      ],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const comboId = this.lastID;

        // Insert combo items
        const itemStmt = db
          .getDb()
          .prepare(
            `INSERT INTO combo_items (combo_id, product_id, quantity) VALUES (?, ?, ?)`,
          );

        parsedItems.forEach((item) => {
          itemStmt.run(comboId, item.product_id, item.quantity || 1);
        });

        // itemStmt.finalize() not needed for better-sqlite3

        res.json({
          id: comboId,
          message: "تم إضافة العرض بنجاح",
          combo: { id: comboId, name, price, image },
        });
      },
    );
  },
);

// Update combo (Owner and Products Manager)
router.put(
  "/:id",
  requireRole("owner", "products_manager"),
  upload.single("image"),
  (req, res) => {
    let {
      name,
      description,
      price,
      original_price,
      discount_percentage,
      start_date,
      end_date,
      is_active,
      items,
      existing_image,
    } = req.body;

    const image = req.file ? `/uploads/${req.file.filename}` : existing_image;

    // Parse items
    let parsedItems = [];
    try {
      if (typeof items === "string") {
        parsedItems = JSON.parse(items);
      } else if (Array.isArray(items)) {
        parsedItems = items;
      }
    } catch (e) {
      return res.status(400).json({ error: "خطأ في تنسيق المنتجات" });
    }

    if (!discount_percentage && original_price && price) {
      discount_percentage = ((original_price - price) / original_price) * 100;
    }

    const sql = `
    UPDATE combos 
    SET name = ?, description = ?, price = ?, original_price = ?, discount_percentage = ?, 
        image = ?, is_active = ?, start_date = ?, end_date = ?
    WHERE id = ?
  `;

    db.getDb().run(
      sql,
      [
        name,
        description,
        price,
        original_price || price,
        discount_percentage || 0,
        image,
        is_active === "true" || is_active === true ? 1 : 0,
        start_date || null,
        end_date || null,
        req.params.id,
      ],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        // Delete existing items
        db.getDb().run(
          `DELETE FROM combo_items WHERE combo_id = ?`,
          [req.params.id],
          (err) => {
            if (parsedItems && parsedItems.length > 0) {
              const itemStmt = db
                .getDb()
                .prepare(
                  `INSERT INTO combo_items (combo_id, product_id, quantity) VALUES (?, ?, ?)`,
                );

              parsedItems.forEach((item) => {
                itemStmt.run(
                  req.params.id,
                  item.product_id,
                  item.quantity || 1,
                );
              });

              // itemStmt.finalize() not needed for better-sqlite3
            }

            res.json({
              id: req.params.id,
              message: "تم تحديث العرض بنجاح",
              image,
            });
          },
        );
      },
    );
  },
);

// Delete combo (Owner and Products Manager)
router.delete("/:id", requireRole("owner", "products_manager"), (req, res) => {
  db.getDb().serialize(() => {
    // Delete combo items first
    db.getDb().run(
      `DELETE FROM combo_items WHERE combo_id = ?`,
      [req.params.id],
      (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        // Delete combo
        db.getDb().run(
          `DELETE FROM combos WHERE id = ?`,
          [req.params.id],
          function (err) {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
              return res.status(404).json({ error: "العرض غير موجود" });
            }
            res.json({ message: "تم حذف العرض بنجاح" });
          },
        );
      },
    );
  });
});

// Toggle combo status (Owner and Products Manager)
router.patch(
  "/:id/toggle",
  requireRole("owner", "products_manager"),
  (req, res) => {
    const { is_active } = req.body;

    db.getDb().run(
      `UPDATE combos SET is_active = ? WHERE id = ?`,
      [is_active ? 1 : 0, req.params.id],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: "العرض غير موجود" });
        }
        res.json({ message: "تم تحديث حالة العرض بنجاح" });
      },
    );
  },
);

module.exports = router;
