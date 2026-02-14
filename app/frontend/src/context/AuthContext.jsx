import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';

const AuthContext = createContext(null);

// Role-based permissions - must match backend ROLE_PERMISSIONS in auth.js
export const ROLE_PERMISSIONS = {
  products_manager: [
    'products.view', 'products.add', 'products.edit', 'products.delete', 'products.prices',
    'categories.manage',
    'offers.view', 'offers.add', 'offers.edit', 'offers.delete',
    'inventory.view', 'inventory.edit', 'inventory.adjust',
  ],
  cashier: [
    'orders.create', 'orders.view', 'orders.edit', 'sales.view', 'sales.discount',
    'expenses.view', 'expenses.add', 'reports.daily',
  ],
  owner: [], // Owner has all permissions (checked separately)
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  // Always require login - clear any existing session on load
  useEffect(() => {
    // Clear localStorage to force login each time
    localStorage.removeItem('pos_token');
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    try {
      console.log('Attempting login to:', API_ENDPOINTS.login);
      
      const response = await fetch(API_ENDPOINTS.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'حدث خطأ في تسجيل الدخول');
      }

      console.log('Login successful:', data.user.username);
      
      // Don't persist token - require login each time
      setToken(data.token);
      setUser(data.user);
      return data;
    } catch (error) {
      console.error('Login error:', error);
      if (error.message.includes('fetch') || error.name === 'TypeError') {
        throw new Error('تعذر الاتصال بالخادم. يرجى الانتظار قليلاً والمحاولة مرة أخرى.');
      }
      throw error;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const hasRole = (roles) => {
    if (!user) return false;
    if (typeof roles === 'string') return user.role === roles;
    return roles.includes(user.role);
  };

  const hasPermission = (permission) => {
    if (!user) return false;
    // Owner له كل الصلاحيات
    if (user.role === 'owner') return true;
    // التحقق من الصلاحيات المخصصة أولاً
    const userPermissions = user.permissions || [];
    if (userPermissions.includes(permission)) return true;
    // التحقق من صلاحيات الدور
    const rolePerms = ROLE_PERMISSIONS[user.role] || [];
    return rolePerms.includes(permission);
  };

  const hasAnyPermission = (permissions) => {
    if (!user) return false;
    if (user.role === 'owner') return true;
    const userPermissions = user.permissions || [];
    if (permissions.some(p => userPermissions.includes(p))) return true;
    const rolePerms = ROLE_PERMISSIONS[user.role] || [];
    return permissions.some(p => rolePerms.includes(p));
  };

  const isOwner = () => {
    return user?.role === 'owner';
  };

  const isCashier = () => {
    return user?.role === 'cashier';
  };

  const hasFullAccess = () => {
    return user?.role === 'owner';
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      loading, 
      login, 
      logout, 
      hasRole, 
      hasPermission,
      hasAnyPermission,
      isOwner, 
      isCashier, 
      hasFullAccess 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
