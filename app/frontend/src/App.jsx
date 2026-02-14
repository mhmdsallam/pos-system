import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import { lazy, Suspense, useEffect } from 'react'
import Activation from './pages/Activation' // New Activation Page

// Lazy-load heavy pages for faster startup and lower memory
const Dashboard = lazy(() => import('./pages/Dashboard'))
const POS = lazy(() => import('./pages/POS'))
const Orders = lazy(() => import('./pages/Orders'))
const Products = lazy(() => import('./pages/Products'))
const Combos = lazy(() => import('./pages/Combos'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Settings = lazy(() => import('./pages/Settings'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Employees = lazy(() => import('./pages/Employees'))
const Payroll = lazy(() => import('./pages/Payroll'))
const AnnualReport = lazy(() => import('./pages/AnnualReport'))
const Customers = lazy(() => import('./pages/Customers'))

// Lightweight loading fallback
const PageLoader = () => (
  <div style={{
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    height: '60vh', direction: 'rtl'
  }}>
    <div style={{ textAlign: 'center' }}>
      <div className="spinner-large" style={{ margin: '0 auto 12px' }}></div>
      <span style={{ color: '#94a3b8', fontSize: '14px' }}>جاري التحميل...</span>
    </div>
  </div>
)

function App() {
  useEffect(() => {
    // Initialize dark mode from localStorage on app load
    const isDarkMode = localStorage.getItem('theme-mode') === 'dark' ||
      window.matchMedia('(prefers-color-scheme: dark)').matches

    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.body.style.backgroundColor = '#0f172a'
    } else {
      document.documentElement.removeAttribute('data-theme')
      document.body.style.backgroundColor = '#f8fafc'
    }

    // License Check
    const checkLicense = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/system/status');
        const data = await res.json();
        if (!data.valid && window.location.hash !== '#/activation') {
          window.location.hash = '/activation';
        }
      } catch (e) {
        console.error("License check failed", e);
      }
    };
    checkLicense();
  }, [])

  return (
    <AuthProvider>
      <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/activation" element={<Activation />} />
            <Route path="/login" element={<Login />} />

            <Route path="/pos" element={
              <ProtectedRoute roles={['owner', 'cashier']}>
                <POS />
              </ProtectedRoute>
            } />

            {/* Main Layout for Dashboard & Admin Pages */}
            <Route path="/" element={<Layout />}>
              {/* Default redirect to login */}
              <Route index element={<Navigate to="/login" replace />} />

              <Route path="dashboard" element={
                <ProtectedRoute roles={['owner']}>
                  <Dashboard />
                </ProtectedRoute>
              } />

              <Route path="orders" element={
                <ProtectedRoute roles={['owner', 'cashier']}>
                  <Orders />
                </ProtectedRoute>
              } />

              <Route path="customers" element={
                <ProtectedRoute roles={['owner']}>
                  <Customers />
                </ProtectedRoute>
              } />

              <Route path="products" element={
                <ProtectedRoute roles={['owner', 'products_manager']}>
                  <Products />
                </ProtectedRoute>
              } />

              <Route path="combos" element={
                <ProtectedRoute roles={['owner', 'products_manager']}>
                  <Combos />
                </ProtectedRoute>
              } />

              <Route path="inventory" element={
                <ProtectedRoute roles={['owner', 'products_manager']}>
                  <Inventory />
                </ProtectedRoute>
              } />

              {/* Settings page with tabs */}
              <Route path="settings" element={
                <ProtectedRoute roles={['owner']}>
                  <Settings />
                </ProtectedRoute>
              } />

              <Route path="expenses" element={
                <ProtectedRoute roles={['owner', 'cashier']}>
                  <Expenses />
                </ProtectedRoute>
              } />

              <Route path="payroll" element={
                <ProtectedRoute roles={['owner']}>
                  <Payroll />
                </ProtectedRoute>
              } />

              <Route path="reports" element={
                <ProtectedRoute roles={['owner']}>
                  <AnnualReport />
                </ProtectedRoute>
              } />

              <Route path="employees" element={
                <ProtectedRoute roles={['owner']}>
                  <Employees />
                </ProtectedRoute>
              } />
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  )
}

export default App
