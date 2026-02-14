const express = require("express");
const router = express.Router();
const db = require("../database/db");

// Import auth middleware
const { authMiddleware, requireRole } = require("../middleware/auth");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Role based access control for mutations
// router.use(requireRole("owner")); // REMOVED GLOBAL RESTRICTION

// Get all categories
router.get("/", (req, res) => {
  const sql = "SELECT * FROM categories ORDER BY sort_order, name";

  db.getDb().all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get single category
router.get("/:id", (req, res) => {
  const sql = "SELECT * FROM categories WHERE id = ?";

  db.getDb().get(sql, [req.params.id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: "الفئة غير موجودة" });
      return;
    }
    res.json(row);
  });
});

// Create category (Owner and Products Manager)
router.post("/", requireRole("owner", "products_manager"), (req, res) => {
  const { name, color, icon, sort_order } = req.body;
  const sql =
    "INSERT INTO categories (name, color, icon, sort_order) VALUES (?, ?, ?, ?)";

  db.getDb().run(
    sql,
    [name, color, icon || "🍽️", sort_order || 0],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, name, color, icon, sort_order });
    },
  );
});

// Update category (Owner and Products Manager)
router.put("/:id", requireRole("owner", "products_manager"), (req, res) => {
  const { name, color, icon, sort_order } = req.body;
  const sql =
    "UPDATE categories SET name = ?, color = ?, icon = ?, sort_order = ? WHERE id = ?";

  db.getDb().run(
    sql,
    [name, color, icon, sort_order || 0, req.params.id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: req.params.id, name, color, icon, sort_order });
    },
  );
});

// Delete category (Owner and Products Manager)
router.delete("/:id", requireRole("owner", "products_manager"), (req, res) => {
  const categoryId = req.params.id;

  // First, check if there are any products in this category
  const checkSql =
    "SELECT COUNT(*) as count FROM products WHERE category_id = ?";
  db.getDb().get(checkSql, [categoryId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    if (row.count > 0) {
      return res.status(400).json({
        error:
          "لا يمكن حذف الفئة لأنها تحتوي على منتجات. يرجى نقل المنتجات أو حذفها أولاً.",
      });
    }

    // If empty, proceed with deletion
    const deleteSql = "DELETE FROM categories WHERE id = ?";
    db.getDb().run(deleteSql, [categoryId], function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ message: "تم حذف الفئة بنجاح", id: categoryId });
    });
  });
});

module.exports = router;
