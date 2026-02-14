// Fetch interceptor for API calls
import { API_BASE_URL } from "./config";

const originalFetch = window.fetch;
const isDev = import.meta.env.DEV;

// Override global fetch for API calls
window.fetch = function (url, options) {
  // Only intercept API calls (those starting with /api/)
  if (typeof url === "string" && url.startsWith("/api/")) {
    // In production, prepend the backend URL
    const fullUrl = API_BASE_URL ? `${API_BASE_URL}${url}` : url;

    const method = (options?.method || "GET").toUpperCase();

    // Don't override signal if already provided
    const enhancedOptions = {
      ...options,
    };

    // Only add timeout signal if none provided and AbortSignal.timeout exists
    if (!enhancedOptions.signal && typeof AbortSignal.timeout === "function") {
      const method = (options?.method || "GET").toUpperCase();
      const timeout = method === "GET" ? 15000 : 30000;
      enhancedOptions.signal = AbortSignal.timeout(timeout);
    }

    if (isDev) {
      console.log(`[API] ${method} ${url} -> ${fullUrl}`);
    }

    return originalFetch(fullUrl, enhancedOptions).catch((error) => {
      if (isDev) {
        console.error(`[API Error] ${url}:`, error.message);
      }
      throw error;
    });
  }

  // For all other requests, use original fetch
  return originalFetch(url, options);
};

if (isDev) {
  console.log("✅ API fetch interceptor initialized");
  console.log(`📡 API Base URL: ${API_BASE_URL || "relative (dev mode)"}`);
}
