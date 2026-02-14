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

// Role based access control for mutations
// router.use(requireRole("owner")); // REMOVED GLOBAL RESTRICTION

// Configure Multer Storage
const uploadDir = getUploadsDir();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Get all products
router.get("/", (req, res) => {
  const { category_id, available, branch_id } = req.query;

  let sql = `
    SELECT p.*, c.name as category_name, c.color as category_color
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
  `;
  const params = [];
  const conditions = [];

  if (category_id) {
    conditions.push("p.category_id = ?");
    params.push(category_id);
  }

  if (available !== undefined) {
    conditions.push("p.available = ?");
    params.push(available === "true" ? 1 : 0);
  }

  if (branch_id) {
    conditions.push("(p.branch_id = ? OR p.branch_id IS NULL)");
    params.push(branch_id);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  // Default: Filter out non-menu items unless specifically requested (e.g. for inventory linking)
  const includeHidden = req.query.include_hidden === "true";
  if (!includeHidden) {
    if (conditions.length > 0)
      sql += " AND (p.is_menu_item = 1 OR p.is_menu_item IS NULL)";
    else sql += " WHERE (p.is_menu_item = 1 OR p.is_menu_item IS NULL)";
  }

  sql += " ORDER BY p.name";

  db.getDb().all(sql, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    const products = rows;
    if (products.length === 0) return res.json([]);

    const productIds = products.map((p) => p.id).join(",");
    const variationsSql = `SELECT * FROM product_variations WHERE product_id IN (${productIds})`;

    db.getDb().all(variationsSql, [], (err, variations) => {
      if (err) return res.json(products);

      const productsWithVariations = products.map((p) => ({
        ...p,
        variations: variations.filter((v) => v.product_id === p.id),
      }));

      res.json(productsWithVariations);
    });
  });
});

// Get Combos
router.get("/combos", (req, res) => {
  const { branch_id } = req.query;
  let sql = `SELECT * FROM combos WHERE is_active = 1`;
  let params = [];

  // Temporary fix: ignore branch_id if table schema is not updated
  // if (branch_id) {
  //   sql += ` AND (branch_id = ? OR branch_id IS NULL)`;
  //   params.push(branch_id);
  // }

  db.getDb().all(sql, params, (err, combos) => {
    if (err) return res.status(500).json({ error: err.message });
    if (combos.length === 0) return res.json([]);

    const comboIds = combos.map((c) => c.id).join(",");
    const itemsSql = `
            SELECT ci.*, p.name as product_name 
            FROM combo_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.combo_id IN (${comboIds})
        `;

    db.getDb().all(itemsSql, [], (err, items) => {
      if (err) return res.json(combos);

      const combosWithItems = combos.map((c) => ({
        ...c,
        type: "combo",
        items: items.filter((i) => i.combo_id === c.id),
      }));
      res.json(combosWithItems);
    });
  });
});

// Create product (Owner and Products Manager)
router.post(
  "/",
  requireRole("owner", "products_manager"),
  upload.single("image"),
  (req, res) => {
    let {
      name,
      description,
      price,
      cost_price,
      category_id,
      available,
      branch_id,
      variations,
      allow_spicy,
      custom_options,
    } = req.body;

    // Validation: Negative Values
    if (price < 0 || (cost_price && cost_price < 0)) {
      return res
        .status(400)
        .json({ error: "لا يمكن أن يكون السعر أو التكلفة بالسالب" });
    }

    // Handle image
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    // Handle variations (might be stringified JSON)
    let parsedVariations = [];
    try {
      if (typeof variations === "string") {
        parsedVariations = JSON.parse(variations);
      } else if (Array.isArray(variations)) {
        parsedVariations = variations;
      }
    } catch (e) {
      console.error("Error parsing variations", e);
    }

    const hasVariations = parsedVariations.length > 0 ? 1 : 0;

    if (
      hasVariations &&
      parsedVariations.some(
        (v) => v.price < 0 || (v.cost_price && v.cost_price < 0),
      )
    ) {
      return res
        .status(400)
        .json({ error: "لا يمكن أن تكون أسعار الاختيارات بالسالب" });
    }

    const sql = `
    INSERT INTO products (name, description, price, cost_price, category_id, image, available, branch_id, has_variations, allow_spicy, custom_options)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    db.getDb().run(
      sql,
      [
        name,
        description,
        price,
        cost_price || 0,
        category_id,
        image,
        available == "1" ||
        available == 1 ||
        available === "true" ||
        available === true
          ? 1
          : 0,
        branch_id,
        hasVariations,
        allow_spicy == "1" ||
        allow_spicy == 1 ||
        allow_spicy === "true" ||
        allow_spicy === true
          ? 1
          : 0,
        custom_options || null,
      ],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const productId = this.lastID;

        if (hasVariations) {
          const stmt = db
            .getDb()
            .prepare(
              `INSERT INTO product_variations (product_id, name, price, cost_price) VALUES (?, ?, ?, ?)`,
            );
          parsedVariations.forEach((v) => {
            stmt.run(productId, v.name, v.price, v.cost_price || 0);
          });
          // stmt.finalize() not needed for better-sqlite3
        }

        const newProduct = {
          id: productId,
          name,
          description,
          price,
          cost_price,
          category_id,
          image,
          available:
            available === "true" ||
            available === true ||
            available === 1 ||
            available === "1"
              ? 1
              : 0,
          branch_id,
          has_variations: hasVariations,
          allow_spicy: allow_spicy === "true" || allow_spicy === true ? 1 : 0,
          custom_options,
          variations: parsedVariations,
        };

        res.status(201).json(newProduct);
      },
    );
  },
);

// Update product (Owner and Products Manager)
router.put(
  "/:id",
  requireRole("owner", "products_manager"),
  upload.single("image"),
  (req, res) => {
    console.log(
      `[PUT /products/${req.params.id}] Body:`,
      req.body,
      "File:",
      req.file,
    );
    let {
      name,
      description,
      price,
      cost_price,
      category_id,
      available,
      branch_id,
      variations,
      existing_image,
      allow_spicy,
      custom_options,
    } = req.body;

    // Validation
    if (price < 0 || (cost_price && cost_price < 0)) {
      return res
        .status(400)
        .json({ error: "لا يمكن أن يكون السعر أو التكلفة بالسالب" });
    }

    // Handle image
    const image = req.file ? `/uploads/${req.file.filename}` : existing_image;

    // Handle variations
    let parsedVariations = [];
    try {
      if (typeof variations === "string") {
        parsedVariations = JSON.parse(variations);
      } else if (Array.isArray(variations)) {
        parsedVariations = variations;
      }
    } catch (e) {
      console.error("Error parsing variations", e);
    }

    const hasVariations = parsedVariations.length > 0 ? 1 : 0;

    if (
      hasVariations &&
      parsedVariations.some(
        (v) => v.price < 0 || (v.cost_price && v.cost_price < 0),
      )
    ) {
      return res
        .status(400)
        .json({ error: "لا يمكن أن تكون أسعار الاختيارات بالسالب" });
    }

    const sql = `
        UPDATE products
        SET name = ?, description = ?, price = ?, cost_price = ?, category_id = ?,
            available = ?, branch_id = ?, has_variations = ?, allow_spicy = ?, custom_options = ?
            ${req.file ? ", image = ?" : ""}
        WHERE id = ?
    `;

    const params = [
      name,
      description,
      price,
      cost_price || 0,
      category_id,
      available == "1" ||
      available == 1 ||
      available === "true" ||
      available === true
        ? 1
        : 0,
      branch_id,
      hasVariations,
      allow_spicy == "1" ||
      allow_spicy == 1 ||
      allow_spicy === "true" ||
      allow_spicy === true
        ? 1
        : 0,
      custom_options || null,
    ];

    if (req.file) {
      params.push(image);
    }

    params.push(req.params.id);

    db.getDb().run(sql, params, function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // Update variations: Delete old ones and insert new ones
      // Only if variations were actually sent in the request (to avoid accidental deletion if not sent)
      // But typically we send full list.
      if (variations) {
        db.getDb().run(
          `DELETE FROM product_variations WHERE product_id = ?`,
          [req.params.id],
          (err) => {
            if (err) console.error("Error deleting old variations", err);

            if (hasVariations) {
              const stmt = db
                .getDb()
                .prepare(
                  `INSERT INTO product_variations (product_id, name, price, cost_price) VALUES (?, ?, ?, ?)`,
                );
              parsedVariations.forEach((v) => {
                stmt.run(req.params.id, v.name, v.price, v.cost_price || 0);
              });
              // stmt.finalize() not needed for better-sqlite3
            }
          },
        );
      }

      res.json({ message: "Product updated successfully" });
    });
  },
);

// Delete product (Owner and Products Manager)
router.delete("/:id", requireRole("owner", "products_manager"), (req, res) => {
  const forceDelete = req.query.force === "true";

  // First check if product is referenced in order_items
  db.getDb().get(
    "SELECT COUNT(*) as count FROM order_items WHERE product_id = ?",
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });

      // If product has history and force not requested, hide instead of hard delete
      if (row.count > 0 && !forceDelete) {
        db.getDb().run(
          "UPDATE products SET available = 0, is_menu_item = 0 WHERE id = ?",
          [req.params.id],
          (updateErr) => {
            if (updateErr) {
              return res.status(500).json({ error: updateErr.message });
            }
            return res.json({
              message:
                "تم إخفاء المنتج لأنه مرتبط بطلبات سابقة. لن يظهر في القائمة بعد الآن.",
              hidden: true,
              orderCount: row.count,
            });
          },
        );
        return;
      }

      // If force delete, remove order_items first
      if (row.count > 0 && forceDelete) {
        const orderCount = row.count;

        db.getDb().run(
          "DELETE FROM order_items WHERE product_id = ?",
          [req.params.id],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });

            // Then delete the product
            db.getDb().run(
              "DELETE FROM products WHERE id = ?",
              [req.params.id],
              function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({
                  message: "تم حذف المنتج نهائياً مع جميع الطلبات المرتبطة",
                  id: req.params.id,
                  deletedOrders: orderCount,
                });
              },
            );
          },
        );
        return;
      }

      // If no references, proceed with normal deletion
      const sql = "DELETE FROM products WHERE id = ?";
      db.getDb().run(sql, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "تم حذف المنتج بنجاح", id: req.params.id });
      });
    },
  );
});

module.exports = router;
