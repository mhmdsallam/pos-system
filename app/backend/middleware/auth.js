const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "restaurant-pos-secret-key-2024";

// تعريف الأدوار
const ROLES = [
  "owner",
  "cashier",
  "products_manager", // الشخص المسؤول عن المنتجات والعروض
];

// تعريف الصلاحيات المتاحة
const PERMISSIONS = {
  // المنتجات
  "products.view": "عرض المنتجات",
  "products.add": "إضافة منتجات",
  "products.edit": "تعديل منتجات",
  "products.delete": "حذف منتجات",
  "products.prices": "تعديل أسعار",

  // الفئات
  "categories.manage": "إدارة الفئات",

  // العروض
  "offers.view": "عرض العروض",
  "offers.add": "إضافة عروض",
  "offers.edit": "تعديل عروض",
  "offers.delete": "حذف عروض",

  // الطلبات
  "orders.view": "عرض الطلبات",
  "orders.create": "إنشاء طلبات",
  "orders.edit": "تعديل حالة الطلبات", // لتحديث الحالة
  "orders.cancel": "إلغاء طلبات",
  "orders.refund": "استرداد طلبات",

  // المبيعات
  "sales.view": "عرض المبيعات",
  "sales.discount": "خضم ومجاملات",

  // المصروفات (تم إضافتها للكاشير)
  "expenses.view": "عرض المصروفات",
  "expenses.add": "إضافة مصروفات",
  "expenses.edit": "تعديل مصروفات",
  "expenses.delete": "حذف مصروفات",

  // المخزون
  "inventory.view": "عرض المخزون",
  "inventory.edit": "تعديل المخزون",
  "inventory.adjust": "تسوية المخزون",

  // الموظفين
  "employees.view": "عرض الموظفين",
  "employees.add": "إضافة موظفين",
  "employees.edit": "تعديل موظفين",
  "employees.delete": "حذف موظفين",
  "employees.salary": "رواتب الموظفين",

  // الرواتب
  "payroll.view": "عرض كشف الرواتب",
  "payroll.process": "صرف الرواتب",

  // التقارير
  "reports.view": "عرض التقارير",
  "reports.export": "تصدير التقارير",
  "reports.daily": "التقارير اليومية",
  "reports.monthly": "التقارير الشهرية",
  "reports.yearly": "التقارير السنوية",

  // المستخدمين
  "users.view": "عرض المستخدمين",
  "users.add": "إضافة مستخدمين",
  "users.edit": "تعديل مستخدمين",
  "users.delete": "حذف مستخدمين",
  "users.permissions": "إدارة صلاحيات",

  // الإعدادات
  "settings.view": "عرض الإعدادات",
  "settings.edit": "تعديل الإعدادات",
  "settings.branches": "إدارة الفروع", // بدلا من branches.manage
};

// الأدوار الافتراضية وصلاحياتها
const ROLE_PERMISSIONS = {
  owner: Object.keys(PERMISSIONS), // كل الصلاحيات

  cashier: [
    "orders.create",     // لفتح الـ POS
    "orders.view",       // لمراجعة الطلبات
    "orders.edit",       // لتحديث الحالة
    "sales.view",        // لرؤية مبيعاته
    "sales.discount",    // للخصم (إذا مسموح)
    "expenses.view",     // لرؤية المصروفات
    "expenses.add",      // لإضافة مصروف
    "reports.daily",     // لطباعة تقرير الوردية
  ],

  products_manager: [
    // إدارة كاملة للمنتجات والعروض والمخزون
    "products.view", "products.add", "products.edit", "products.delete", "products.prices",
    "categories.manage",
    "offers.view", "offers.add", "offers.edit", "offers.delete",
    "inventory.view", "inventory.edit", "inventory.adjust",
  ],
};

// Auth middleware for protected routes
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "غير مصرح بالوصول" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "رمز الدخول غير صالح" });
  }
};

// Role-based access control middleware
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "غير مصرح" });
    }

    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "ليس لديك صلاحية للوصول لهذه الصفحة" });
    }

    next();
  };
};

// Permission-based access control middleware
const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "غير مصرح" });
    }

    // Owner له كل الصلاحيات
    if (req.user.role === "owner") {
      return next();
    }

    // جلب صلاحيات المستخدم من قاعدة البيانات
    const userPermissions =
      req.user.permissions || ROLE_PERMISSIONS[req.user.role] || [];

    const hasPermission = permissions.some((p) => userPermissions.includes(p));

    if (!hasPermission) {
      return res.status(403).json({ error: "ليس لديك صلاحية لهذه العملية" });
    }

    next();
  };
};

// Helper function to check if user has permission
const hasPermission = (user, permission) => {
  if (user.role === "owner") return true;
  const userPermissions = user.permissions || ROLE_PERMISSIONS[user.role] || [];
  return userPermissions.includes(permission);
};

// Helper function to check if user has any of the permissions
const hasAnyPermission = (user, permissions) => {
  if (user.role === "owner") return true;
  const userPermissions = user.permissions || ROLE_PERMISSIONS[user.role] || [];
  return permissions.some((p) => userPermissions.includes(p));
};

module.exports = {
  authMiddleware,
  requireRole,
  requirePermission,
  hasPermission,
  hasAnyPermission,
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  JWT_SECRET,
};
