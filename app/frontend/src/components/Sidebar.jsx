import { NavLink, useNavigate } from 'react-router-dom'
import {
    LayoutDashboard,
    ShoppingCart,
    Package,
    Receipt,
    Settings,
    Store,
    LogOut,
    ChefHat,
    DollarSign,
    Briefcase,
    CreditCard,
    FileText,
    Tag,
    Archive,
    Moon,
    Sun,
    AlertTriangle
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import './Sidebar.css'
import { useState, useEffect, useRef } from 'react'

export default function Sidebar() {
    const { user, token, logout, hasRole, hasPermission, hasAnyPermission } = useAuth()
    const navigate = useNavigate()
    const [lowStockCount, setLowStockCount] = useState(0)
    const lowStockIntervalRef = useRef(null)
    const [isDarkMode, setIsDarkMode] = useState(() => {
        // Read from DOM state first (it's more reliable), then fall back to localStorage
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
        if (isDark !== null) return isDark
        // Only check localStorage if DOM state is not set
        return localStorage.getItem('theme-mode') === 'dark' ||
            window.matchMedia('(prefers-color-scheme: dark)').matches
    })

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.setAttribute('data-theme', 'dark')
            document.body.style.backgroundColor = '#0f172a'
        } else {
            document.documentElement.removeAttribute('data-theme')
            document.body.style.backgroundColor = '#f8fafc'
        }
        localStorage.setItem('theme-mode', isDarkMode ? 'dark' : 'light')
    }, [isDarkMode])

    // Play low stock warning sound using Web Audio API
    const playLowStockSound = () => {
        try {
            const soundSaved = localStorage.getItem('soundSettings');
            if (soundSaved) {
                const sp = JSON.parse(soundSaved);
                if (sp.lowStockSound === false) return;
            }
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            // Warning tone: descending pitch
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.setValueAtTime(400, ctx.currentTime + 0.15);
            osc.frequency.setValueAtTime(600, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.45);
        } catch (e) { /* silent */ }
    }

    const prevLowStockRef = useRef(0);

    // Fetch low stock count for notification badge
    useEffect(() => {
        if (!token || !hasRole('owner')) return
        const fetchLowStock = async () => {
            try {
                const res = await fetch('/api/inventory', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (res.ok) {
                    const data = await res.json()
                    if (Array.isArray(data)) {
                        const count = data.filter(i => i.quantity <= i.min_quantity && i.quantity > 0).length
                        // Play sound only when count increases (new low stock detected)
                        if (count > 0 && count > prevLowStockRef.current) {
                            playLowStockSound();
                        }
                        prevLowStockRef.current = count;
                        setLowStockCount(count)
                    }
                }
            } catch (e) { /* silent */ }
        }
        fetchLowStock()
        lowStockIntervalRef.current = setInterval(fetchLowStock, 5 * 60 * 1000) // every 5 minutes
        return () => { if (lowStockIntervalRef.current) clearInterval(lowStockIntervalRef.current) }
    }, [token])

    const toggleTheme = () => {
        setIsDarkMode(prev => !prev)
    }

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    const getRoleLabel = (role) => {
        switch (role) {
            case 'owner': return 'المالك'
            case 'cashier': return 'كاشير'
            case 'products_manager': return 'مدير منتجات'
            default: return role
        }
    }

    const getInitials = (name) => {
        return name ? name.charAt(0).toUpperCase() : '?'
    }

    const navItems = [
        { path: '/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم', permissions: ['reports.view'] },
        { path: '/pos', icon: ShoppingCart, label: 'نقطة البيع', permissions: ['orders.create'] },
        { path: '/orders', icon: Receipt, label: 'الطلبات', permissions: ['orders.view'] },
        { path: '/expenses', icon: DollarSign, label: 'المصروفات', permissions: ['expenses.view'] },
        { path: '/products', icon: Package, label: 'المنتجات', permissions: ['products.view'] },
        { path: '/combos', icon: Tag, label: 'العروض', permissions: ['offers.view'] },
        { path: '/inventory', icon: Archive, label: 'المخزون', permissions: ['inventory.view'] },
        { path: '/employees', icon: Briefcase, label: 'الموظفين', permissions: ['employees.view'] },
        { path: '/payroll', icon: CreditCard, label: 'الرواتب', permissions: ['payroll.view'] },
        { path: '/reports', icon: FileText, label: 'التقارير السنوية', permissions: ['reports.view'] },
        { path: '/settings', icon: Settings, label: 'الإعدادات', permissions: ['settings.view'] },
    ]

    const filteredNavItems = navItems.filter(item => {
        // Strict filter for Cashier to ensure unwanted items are hidden immediately
        if (user && user.role === 'cashier') {
            const allowedPaths = ['/pos', '/orders', '/expenses'];
            return allowedPaths.includes(item.path);
        }
        return hasAnyPermission(item.permissions)
    })

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="logo-icon-wrapper">
                    <Store size={32} className="logo-icon" />
                </div>
                <div className="logo-texts">
                    <h2 className="logo-text">مطعم عجلان للمشويات</h2>
                    <span className="logo-subtext">نظام POS</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                {filteredNavItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `nav-item ${isActive ? 'nav-item-active' : ''}`
                        }
                    >
                        <item.icon size={22} strokeWidth={1.5} />
                        <span>{item.label}</span>
                        {item.path === '/inventory' && lowStockCount > 0 && (
                            <span className="nav-badge" title={`${lowStockCount} منتج مخزون منخفض`}>{lowStockCount}</span>
                        )}
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="user-info">
                    <div className="user-avatar">
                        {getInitials(user?.full_name || 'م')}
                    </div>
                    <div className="user-details">
                        <span className="user-name">{user?.full_name || 'مستخدم'}</span>
                        <span className="user-role">{getRoleLabel(user?.role)}</span>
                    </div>
                </div>
                <div className="footer-buttons">
                    <button
                        className="theme-toggle-btn"
                        onClick={toggleTheme}
                        title={isDarkMode ? 'وضع فاتح' : 'وضع داكن'}
                    >
                        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                    <button className="logout-btn" onClick={handleLogout} title="تسجيل الخروج">
                        <LogOut size={20} />
                    </button>
                </div>
            </div>
        </aside>
    )
}
