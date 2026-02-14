require("dotenv").config();
console.log("Starting backend server script...");
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./database/db");
const { getUploadsDir } = require("./utils/paths");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Content-Disposition", "Content-Type"],
  }),
);
app.use(express.json());
app.use("/uploads", express.static(getUploadsDir()));

// API Routes
const categoriesRouter = require("./routes/categories");
const productsRouter = require("./routes/products");
const ordersRouter = require("./routes/orders");
const settingsRouter = require("./routes/settings");
const usersRouter = require("./routes/users");
const expensesRouter = require("./routes/expenses");
const dashboardRouter = require("./routes/dashboard");
const employeesRouter = require("./routes/employees");
const payrollRouter = require("./routes/payroll");
const reportsRouter = require("./routes/reports");
const customersRouter = require("./routes/customers");
const combosRouter = require("./routes/combos");
const inventoryRouter = require("./routes/inventory");
const shiftsRouter = require("./routes/shifts");

app.use("/api/categories", categoriesRouter);
app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/customers", customersRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/users", usersRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/payroll", payrollRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/combos", combosRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/shifts", shiftsRouter);

// License Routes
const licenseRouter = require("./routes/license");
app.use("/api/system", licenseRouter);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// Initialize database
db.initialize()
  .then(() => {
    console.log("✅ Database initialized successfully");
    console.log("📂 Database location: Check logs above for path");

    // Start server with error handling
    const server = app.listen(PORT, () => {
      console.log(`✅ Backend server running on http://localhost:${PORT}`);
      console.log(`📡 API ready at http://localhost:${PORT}/api`);

      // Send message to parent process (Electron)
      if (process.send) {
        process.send({ type: "ready", port: PORT });
      }
    });

    // Handle port already in use
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use`);
        console.error("   Attempting to kill existing process...");
        process.exit(1);
      } else {
        console.error("❌ Server error:", err);
        process.exit(1);
      }
    });
  })
  .catch((err) => {
    console.error("❌ Failed to initialize database:", err);
    process.exit(1);
  });

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
});

module.exports = app;
