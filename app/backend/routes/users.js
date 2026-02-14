const express = require("express");
const router = express.Router();
const db = require("../database/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authMiddleware, requirePermission, ROLE_PERMISSIONS, PERMISSIONS } = require("../middleware/auth");

const JWT_SECRET = process.env.JWT_SECRET || "restaurant-pos-secret-key-2024";

// Get available permissions
router.get("/permissions", authMiddleware, (req, res) => {
  res.json({
    permissions: PERMISSIONS,
    rolePermissions: ROLE_PERMISSIONS,
  });
});

// Login
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
  }

  const sql = "SELECT * FROM users WHERE username = ? AND active = 1";

  db.getDb().get(sql, [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: "خطأ في الخادم" });
    }

    if (!user) {
      return res
        .status(401)
        .json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res
        .status(401)
        .json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }

    // جلب صلاحيات المستخدم من قاعدة البيانات أو من ROLE_PERMISSIONS
    let userPermissions = [];
    try {
      if (user.custom_permissions && user.custom_permissions.trim() !== "") {
        userPermissions = JSON.parse(user.custom_permissions);
      } else {
        userPermissions = ROLE_PERMISSIONS[user.role] || [];
      }
    } catch (e) {
      userPermissions = ROLE_PERMISSIONS[user.role] || [];
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        permissions: userPermissions,
      },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        permissions: userPermissions,
        force_password_reset: !!user.force_password_reset,
      },
    });
  });
});

// Get current user
router.get("/me", (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "غير مصرح" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const sql =
      "SELECT id, username, full_name, role, created_at, force_password_reset, custom_permissions FROM users WHERE id = ? AND active = 1";

    db.getDb().get(sql, [decoded.id], (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: "المستخدم غير موجود" });
      }

      // جلب الصلاحيات
      let permissions = [];
      try {
        if (user.custom_permissions && user.custom_permissions.trim() !== "") {
          permissions = JSON.parse(user.custom_permissions);
        } else {
          permissions = ROLE_PERMISSIONS[user.role] || [];
        }
      } catch (e) {
        permissions = ROLE_PERMISSIONS[user.role] || [];
      }

      res.json({
        ...user,
        permissions,
        custom_permissions: undefined,
      });
    });
  } catch (err) {
    res.status(401).json({ error: "رمز غير صالح" });
  }
});

// Get all users (users.view permission required)
router.get("/", authMiddleware, requirePermission("users.view"), (req, res) => {
  const sql =
    "SELECT id, username, full_name, role, active, created_at, custom_permissions FROM users ORDER BY created_at DESC";

  db.getDb().all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // تحويل الصلاحيات لكل مستخدم
    const users = rows.map((user) => {
      let permissions = [];
      try {
        if (user.custom_permissions && user.custom_permissions.trim() !== "") {
          permissions = JSON.parse(user.custom_permissions);
        } else {
          permissions = ROLE_PERMISSIONS[user.role] || [];
        }
      } catch (e) {
        permissions = ROLE_PERMISSIONS[user.role] || [];
      }
      return { ...user, permissions, custom_permissions: undefined };
    });

    res.json(users);
  });
});

// Create user (users.add permission required)
router.post("/", authMiddleware, requirePermission("users.add"), async (req, res) => {
  const { username, password, full_name, role, permissions } = req.body;

  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: "جميع الحقول مطلوبة" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const customPermissions = permissions ? JSON.stringify(permissions) : null;
    const sql = `
      INSERT INTO users (username, password, full_name, role, active, force_password_reset, custom_permissions)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `;

    // Active defaults to 1 (true) if not provided
    const isActive = req.body.active === undefined ? 1 : (req.body.active ? 1 : 0);

    db.getDb().run(
      sql,
      [username, hashedPassword, full_name, role, isActive, customPermissions],
      function (err) {
        if (err) {
          return res.status(500).json({ error: "خطأ في إنشاء المستخدم" });
        }
        res.json({
          id: this.lastID,
          username,
          full_name,
          role,
          active: isActive,
          permissions: permissions || ROLE_PERMISSIONS[role] || [],
        });
      },
    );
  } catch (err) {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Update user (users.edit permission required)
router.put("/:id", authMiddleware, requirePermission("users.edit"), async (req, res) => {
  const { id } = req.params;
  const { full_name, role, active, password, permissions } = req.body;

  let sql, params;

  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const customPermissions = permissions ? JSON.stringify(permissions) : null;
    sql =
      "UPDATE users SET full_name = ?, role = ?, active = ?, password = ?, force_password_reset = 0, custom_permissions = ? WHERE id = ?";
    params = [full_name, role, active, hashedPassword, customPermissions, id];
  } else {
    const customPermissions = permissions ? JSON.stringify(permissions) : null;
    sql =
      "UPDATE users SET full_name = ?, role = ?, active = ?, custom_permissions = ? WHERE id = ?";
    params = [full_name, role, active, customPermissions, id];
  }

  db.getDb().run(sql, params, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "تم تحديث المستخدم بنجاح" });
  });
});

// Change own password
router.post("/change-password", authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  const userId = req.user.id;

  if (!current_password || !new_password) {
    return res
      .status(400)
      .json({ error: "يرجى إدخال كلمة المرور الحالية والجديدة" });
  }

  try {
    const user = await new Promise((resolve, reject) => {
      db.getDb().get(
        "SELECT * FROM users WHERE id = ? AND active = 1",
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        },
      );
    });

    if (!user) {
      return res.status(404).json({ error: "المستخدم غير موجود" });
    }

    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await new Promise((resolve, reject) => {
      db.getDb().run(
        "UPDATE users SET password = ?, force_password_reset = 0 WHERE id = ?",
        [hashed, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    res.json({
      message: "تم تغيير كلمة المرور بنجاح",
      force_password_reset: false,
    });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// Delete user (users.delete permission required)
router.delete("/:id", authMiddleware, requirePermission("users.delete"), (req, res) => {
  const { id } = req.params;

  db.getDb().run("DELETE FROM users WHERE id = ?", [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "تم حذف المستخدم بنجاح" });
  });
});

module.exports = router;
