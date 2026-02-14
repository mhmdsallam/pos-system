// API Utility - Centralized fetch wrapper
import { API_BASE_URL } from "./config";

/**
 * Wrapper around fetch that automatically handles API base URL
 * In development: uses relative paths (Vite proxy)
 * In production: uses full URL with http://localhost:3001
 */
export const apiFetch = (endpoint, options = {}) => {
  // Ensure endpoint starts with /
  const url = endpoint.startsWith("/")
    ? `${API_BASE_URL}${endpoint}`
    : `${API_BASE_URL}/${endpoint}`;

  return fetch(url, options);
};

/**
 * Get full API URL for an endpoint
 */
export const getApiUrl = (endpoint) => {
  return endpoint.startsWith("/")
    ? `${API_BASE_URL}${endpoint}`
    : `${API_BASE_URL}/${endpoint}`;
};
