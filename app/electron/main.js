const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { fork } = require("child_process");

// ===== Performance Flags =====
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=512");

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log("⚠️  Another instance is already running. Exiting...");
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow;
let splashWindow;
let backendProcess;

// ===== PRINT WINDOW MANAGEMENT =====
let printWindow = null;

/**
 * Create a hidden window for printing
 * This prevents the main window from freezing during print operations
 */
function createPrintWindow() {
  if (printWindow && !printWindow.isDestroyed()) {
    return printWindow;
  }

  printWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    frame: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: false,
    },
  });

  printWindow.on("closed", () => {
    printWindow = null;
  });

  return printWindow;
}

/**
 * Print HTML content using a hidden window
 * This is the production-safe way to print in Electron
 */
// ... existing code ...
/**
 * Print HTML content using a hidden window
 * This is the production-safe way to print in Electron
 */
function printHTML(htmlContent, title = "Print") {
  return new Promise((resolve, reject) => {
    try {
      // Create a hidden window for printing
      let win = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      // Load the HTML content directly
      // htmlContent is expected to be a full HTML document from the renderer
      const encodedHtml = encodeURIComponent(htmlContent);
      win.loadURL(`data:text/html;charset=utf-8,${encodedHtml}`);

      // Wait for page to load, then print
      win.webContents.on("did-finish-load", () => {
        // Give extra time for styles/images to render
        setTimeout(() => {
          try {
            // Check if window still exists
            if (!win || win.isDestroyed()) return;

            win.webContents.print(
              {
                silent: true, // Print directly to default printer
                printBackground: true,
                deviceName: "", // Empty string = default printer
                margins: {
                  marginType: "none",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                },
                scaleFactor: 100,
                pagesPerSheet: 1,
                collate: false,
                copies: 1,
                header: ' ', 
                footer: ' ' 
              },
              (success, errorType) => {
                // Clean up window after print
                if (!success) {
                  console.error(`Print failed: ${errorType}`);
                  reject(new Error(`Print failed: ${errorType}`));
                } else {
                  console.log("Print successful");
                  resolve({ success: true });
                }
                
                // Close window after a short delay to ensure print job is sent
                setTimeout(() => {
                  try {
                    if (win && !win.isDestroyed()) {
                      win.close();
                    }
                    win = null;
                  } catch (e) {
                    // Ignore close errors
                  }
                }, 500);
              },
            );
          } catch (e) {
            console.error("Print execution error:", e);
            reject(e);
            if (win && !win.isDestroyed()) win.close();
          }
        }, 500); // 500ms delay for rendering
      });

      // Safety timeout - resolve after 15 seconds if no response
      setTimeout(() => {
        try {
          if (win && !win.isDestroyed()) {
            win.close();
          }
          win = null;
        } catch (e) {
          // Ignore close errors
        }
        resolve({ success: false, timeout: true });
      }, 15000);

    } catch (e) {
      console.error("Print setup error:", e);
      reject(e);
    }
  });
}
// ... existing code ...

// ===== BACKEND MANAGEMENT =====
function startBackend() {
  const userDataPath = app.getPath("userData");
  console.log("Electron userData path:", userDataPath);

  const backendEnv = Object.assign({}, process.env, {
    ELECTRON_USER_DATA_PATH: userDataPath,
  });

  backendProcess = fork(path.join(__dirname, "../backend/server.js"), [], {
    env: backendEnv,
  });

  backendProcess.on("message", (msg) => {
    console.log("Backend message:", msg);
    if (msg.type === "ready") {
      console.log(`✅ Backend ready on port ${msg.port}`);
    }
  });

  backendProcess.on("error", (err) => {
    console.error("❌ Backend error:", err);
  });

  backendProcess.on("exit", (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

// ===== WINDOW CREATION =====
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.loadURL(`data:text/html;charset=utf-8,
    <!DOCTYPE html>
    <html dir="rtl">
    <head><meta charset="UTF-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #0a0a0a; color: white; font-family: 'Segoe UI', Tahoma, sans-serif;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        height: 100vh; overflow: hidden; }
      .logo { font-size: 48px; margin-bottom: 20px; }
      .title { font-size: 24px; font-weight: bold; margin-bottom: 8px; color: #fff; }
      .subtitle { font-size: 14px; color: #888; margin-bottom: 30px; }
      .loader { width: 50px; height: 50px; border: 3px solid #333; border-top: 3px solid #3b82f6;
        border-radius: 50%; animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .status { margin-top: 20px; font-size: 12px; color: #666; }
    </style></head>
    <body>
      <div class="logo">🍽️</div>
      <div class="title">Restaurant POS</div>
      <div class="subtitle">جاري تشغيل النظام...</div>
      <div class="loader"></div>
      <div class="status">يرجى الانتظار</div>
    </body></html>
  `);

  splashWindow.center();
  splashWindow.show();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    fullscreen: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
      spellcheck: false,
    },
    backgroundColor: "#0a0a0a",
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../frontend/dist/index.html"));
  }

  const showTimeout = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    }
  }, 8000);

  mainWindow.once("ready-to-show", () => {
    clearTimeout(showTimeout);
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    splashWindow = null;
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ===== BACKEND HEALTH CHECK =====
async function waitForBackend(maxAttempts = 30, delay = 300) {
  const http = require("http");
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.get("http://localhost:3001/api/health", (res) => {
          resolve(res.statusCode);
        });
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("timeout"));
        });
        req.setTimeout(800);
      });

      if (response === 200) {
        console.log(`✅ Backend is ready! (attempt ${i + 1})`);
        return true;
      }
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  console.error("❌ Backend failed to start after maximum attempts");
  return false;
}

// ===== APP LIFECYCLE =====
app.whenReady().then(async () => {
  // Register IPC handlers BEFORE creating windows
  registerIPCHandlers();

  if (!isDev) {
    createSplashWindow();
    startBackend();
    console.log("⏳ Waiting for backend to start...");
    const backendReady = await waitForBackend();
    if (backendReady) {
      createWindow();
    } else {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      dialog.showErrorBox(
        "خطأ في التشغيل",
        "فشل تشغيل الخادم الداخلي.\nحاول إعادة تشغيل البرنامج.",
      );
      app.quit();
    }
  } else {
    createWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  gracefulShutdown();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  gracefulShutdown();
});

function gracefulShutdown() {
  // Close print window first
  if (printWindow && !printWindow.isDestroyed()) {
    try {
      printWindow.close();
    } catch (e) {
      // Ignore
    }
  }

  if (backendProcess && !backendProcess.killed) {
    try {
      backendProcess.send({ type: "shutdown" });
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          backendProcess.kill("SIGKILL");
        }
      }, 2000);
    } catch (e) {
      try {
        backendProcess.kill();
      } catch (e2) {
        /* ignore */
      }
    }
  }
}

// ===== IPC HANDLERS =====
function registerIPCHandlers() {
  // Get app path
  ipcMain.handle("get-app-path", () => {
    return app.getPath("documents");
  });

  // Print IPC handler - PRODUCTION SAFE
  ipcMain.handle("print-html", async (event, htmlContent, title) => {
    try {
      const result = await printHTML(htmlContent, title || "Print");
      return result;
    } catch (error) {
      console.error("Print IPC error:", error);
      throw error;
    }
  });

  // Show dialog for saving files
  ipcMain.handle("show-save-dialog", async (event, options) => {
    const result = await dialog.showSaveDialog({
      ...options,
      createDirectory: true,
      securityScopedBookmarks: false,
    });
    return result;
  });
}
