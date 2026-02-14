// System initialization checker
import { API_BASE_URL } from "./config";

let systemReady = false;
let checkAttempts = 0;
const maxAttempts = 30; // 15 seconds max wait

// Check if backend is ready
async function checkBackendHealth() {
  try {
    const url = API_BASE_URL ? `${API_BASE_URL}/api/health` : "/api/health";
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });

    if (response.ok) {
      console.log("✅ Backend health check passed");
      return true;
    }
  } catch (error) {
    console.warn(
      `⏳ Backend not ready yet (attempt ${checkAttempts + 1}/${maxAttempts})`,
    );
  }
  return false;
}

// Wait for system to be ready
export async function waitForSystem() {
  console.log("🚀 Starting system initialization...");
  console.log(`📡 API Base URL: ${API_BASE_URL || "relative"}`);

  while (checkAttempts < maxAttempts && !systemReady) {
    systemReady = await checkBackendHealth();

    if (!systemReady) {
      checkAttempts++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (systemReady) {
    console.log("✅ System ready!");
    return true;
  } else {
    console.error("❌ System failed to initialize");
    return false;
  }
}

// Auto-check on module load only in production
if (API_BASE_URL) {
  console.log("⏳ System starting in production mode...");
  // In production (Electron), check backend immediately
  setTimeout(() => {
    checkBackendHealth().then((ready) => {
      if (ready) {
        systemReady = true;
        document.dispatchEvent(new Event("system-ready"));
      }
    });
  }, 100);
}
