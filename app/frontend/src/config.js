// API Configuration
const isDev = import.meta.env.DEV;

// In development, use relative paths (Vite proxy handles it)
// In production (Electron), use direct backend URL
export const API_BASE_URL = isDev ? "" : "http://localhost:3001";

export const API_ENDPOINTS = {
  login: `${API_BASE_URL}/api/users/login`,
  users: `${API_BASE_URL}/api/users`,
  categories: `${API_BASE_URL}/api/categories`,
  products: `${API_BASE_URL}/api/products`,
  orders: `${API_BASE_URL}/api/orders`,
  customers: `${API_BASE_URL}/api/customers`,
  settings: `${API_BASE_URL}/api/settings`,
  expenses: `${API_BASE_URL}/api/expenses`,
  dashboard: `${API_BASE_URL}/api/dashboard`,
  employees: `${API_BASE_URL}/api/employees`,
  payroll: `${API_BASE_URL}/api/payroll`,
  reports: `${API_BASE_URL}/api/reports`,
  combos: `${API_BASE_URL}/api/combos`,
  inventory: `${API_BASE_URL}/api/inventory`,
  shifts: `${API_BASE_URL}/api/shifts`,
};

// Helper function to get API URL
export const getApiUrl = (endpoint) => {
  return `${API_BASE_URL}${endpoint}`;
};
