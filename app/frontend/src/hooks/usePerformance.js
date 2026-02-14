/**
 * Performance utility hooks for the POS system.
 * Provides debounce, throttle, and toast notification utilities.
 */

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Debounce hook - delays execution until user stops typing/changing.
 * @param {any} value - The value to debounce
 * @param {number} delay - Debounce delay in ms (default 300ms)
 * @returns {any} - The debounced value
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounced callback hook - returns a stable debounced function.
 * @param {Function} callback - The function to debounce
 * @param {number} delay - Debounce delay in ms
 * @returns {Function} - The debounced function
 */
export function useDebouncedCallback(callback, delay = 300) {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  // Keep callback ref fresh
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedFn = useCallback(
    (...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedFn;
}

/**
 * Toast notification system - lightweight alternative to alert()
 */
let toastContainer = null;
let toastId = 0;

function ensureToastContainer() {
  if (toastContainer && document.body.contains(toastContainer))
    return toastContainer;

  toastContainer = document.createElement("div");
  toastContainer.id = "toast-container";
  toastContainer.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 99999;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  `;
  document.body.appendChild(toastContainer);
  return toastContainer;
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {'success'|'error'|'info'|'warning'} type - Toast type
 * @param {number} duration - Duration in ms (default 3000)
 */
export function showToast(message, type = "success", duration = 3000) {
  const container = ensureToastContainer();
  const id = ++toastId;

  const colors = {
    success: { bg: "#10b981", icon: "✅" },
    error: { bg: "#ef4444", icon: "❌" },
    info: { bg: "#3b82f6", icon: "ℹ️" },
    warning: { bg: "#f59e0b", icon: "⚠️" },
  };

  const { bg, icon } = colors[type] || colors.info;

  const toast = document.createElement("div");
  toast.id = `toast-${id}`;
  toast.style.cssText = `
    background: ${bg};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-family: 'Segoe UI', Tahoma, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    opacity: 0;
    transform: translateY(-20px);
    transition: all 0.3s ease;
    pointer-events: auto;
    cursor: pointer;
    direction: rtl;
    max-width: 400px;
    text-align: center;
  `;
  toast.textContent = `${icon} ${message}`;
  toast.onclick = () => removeToast(toast);

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  // Auto remove
  setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.style.opacity = "0";
  toast.style.transform = "translateY(-20px)";
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 300);
}

/**
 * Hook for button loading state
 * @returns {[boolean, Function]} - [isLoading, withLoading wrapper]
 */
export function useButtonLoading() {
  const [loading, setLoading] = useState(false);

  const withLoading = useCallback(
    async (fn) => {
      if (loading) return;
      setLoading(true);
      try {
        await fn();
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  return [loading, withLoading];
}

/**
 * Hook to close modals on Escape key press.
 * Pass the setter function(s) for modal visibility.
 * @param  {...Function} closeFns - Functions to call on Escape (each called with false)
 */
export function useEscapeClose(...closeFns) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        closeFns.forEach((fn) => fn(false));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, closeFns);
}
