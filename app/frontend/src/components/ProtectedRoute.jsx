import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner-large"></div>
        <p>جاري التحميل...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Role-based Redirect Logic
  if (roles && !roles.some(role => hasRole(role))) {
    if (user.role === 'cashier') return <Navigate to="/pos" replace />;
    if (user.role === 'products_manager' || user.role === 'offers_manager') return <Navigate to="/products" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
