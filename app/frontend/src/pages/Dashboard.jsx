import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, DollarSign, ShoppingBag, Clock, RefreshCw, ShoppingCart, ArrowUpRight, ArrowDownRight, CreditCard, Users, Clock3, Activity, Calendar } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'
import { useAuth } from '../context/AuthContext'
import './Dashboard.css'

// Move utility functions and components outside to avoid re-creation
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ar-EG', {
        style: 'currency',
        currency: 'EGP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0)
}

const calculateGrowth = (current, previous) => {
    if (!previous || previous === 0) return { value: 0, isPositive: true }
    const growth = ((current - previous) / previous) * 100
    return { value: Math.abs(growth).toFixed(1), isPositive: growth >= 0 }
}

const StatCard = memo(({ title, value, previousValue, icon: Icon, color, bgColor, prefix = '' }) => {
    const growth = calculateGrowth(value, previousValue)

    return (
        <div className="stat-card card">
            <div className="stat-card-header">
                <div className="stat-icon-wrapper" style={{ backgroundColor: bgColor, color: color }}>
                    <Icon size={24} />
                </div>
                {growth.value > 0 && (
                    <div className={`growth-badge ${growth.isPositive ? 'positive' : 'negative'}`}>
                        {growth.isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                        <span>{growth.value}%</span>
                    </div>
                )}
            </div>
            <div className="stat-card-content">
                <p className="stat-title">{title}</p>
                <h3 className="stat-value">{prefix}{typeof value === 'number' ? formatCurrency(value) : value}</h3>
            </div>
            <div className="stat-card-footer">
                <span className="text-secondary text-sm">مقارنة بالفترة السابقة</span>
            </div>
        </div>
    )
})

export default function Dashboard() {
    const { user, token } = useAuth()
    const navigate = useNavigate()
    const mountedRef = useRef(true)

    // Safe initial states with proper structure
    const [summary, setSummary] = useState({
        day: {
            current: { sales: 0, orders: 0, net_profit: 0, expenses: 0 },
            previous: { sales: 0, orders: 0, net_profit: 0, expenses: 0 }
        },
        week: {
            current: { sales: 0, orders: 0, net_profit: 0, expenses: 0 },
            previous: { sales: 0, orders: 0, net_profit: 0, expenses: 0 }
        },
        month: {
            current: { sales: 0, orders: 0, net_profit: 0, expenses: 0 },
            previous: { sales: 0, orders: 0, net_profit: 0, expenses: 0 }
        }
    })
    const [topItems, setTopItems] = useState({ topSelling: [], topProfitable: [] })
    const [salesChart, setSalesChart] = useState([])
    const [paymentBreakdown, setPaymentBreakdown] = useState([])
    const [cashierPerformance, setCashierPerformance] = useState([])
    const [shiftComparison, setShiftComparison] = useState([])

    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    useEffect(() => {
        mountedRef.current = true
        fetchDashboardData()
        return () => { mountedRef.current = false }
    }, [])

    const fetchDashboardData = async () => {
        try {
            const headers = { 'Authorization': `Bearer ${token}` };

            const [summaryRes, topItemsRes, chartRes, paymentRes, cashierRes, shiftRes] = await Promise.all([
                fetch('/api/dashboard/summary', { headers }),
                fetch('/api/dashboard/top-items?period=month', { headers }),
                fetch('/api/dashboard/sales-chart', { headers }),
                fetch('/api/dashboard/payment-breakdown?period=month', { headers }),
                fetch('/api/dashboard/cashier-performance?period=month', { headers }),
                fetch('/api/dashboard/shift-comparison?limit=10', { headers })
            ])

            // Helper to safely parse response with fallback
            const safeJson = async (response, fallback) => {
                if (!response.ok) {
                    console.warn(`API error: ${response.status} - ${response.url}`);
                    return fallback;
                }
                try {
                    return await response.json();
                } catch (err) {
                    console.error('Failed to parse JSON:', err);
                    return fallback;
                }
            };

            const summaryData = await safeJson(summaryRes, {
                day: {
                    current: { sales: 0, orders: 0, net_profit: 0, expenses: 0 },
                    previous: { sales: 0, orders: 0, net_profit: 0, expenses: 0 }
                },
                week: {
                    current: { sales: 0, orders: 0, net_profit: 0, expenses: 0 },
                    previous: { sales: 0, orders: 0, net_profit: 0, expenses: 0 }
                },
                month: {
                    current: { sales: 0, orders: 0, net_profit: 0, expenses: 0 },
                    previous: { sales: 0, orders: 0, net_profit: 0, expenses: 0 }
                }
            });
            const topItemsData = await safeJson(topItemsRes, { topSelling: [], topProfitable: [] });
            const chartData = await safeJson(chartRes, []);
            const paymentData = await safeJson(paymentRes, []);
            const cashierData = await safeJson(cashierRes, []);
            const shiftData = await safeJson(shiftRes, []);
            setSummary(summaryData)
            setTopItems(topItemsData && topItemsData.topSelling ? topItemsData : { topSelling: [], topProfitable: [] })
            setSalesChart(Array.isArray(chartData) ? chartData : [])
            setPaymentBreakdown(Array.isArray(paymentData) ? paymentData : [])
            setCashierPerformance(Array.isArray(cashierData) ? cashierData : [])
            setShiftComparison(Array.isArray(shiftData) ? shiftData : [])
        } catch (error) {
            console.error('Error fetching dashboard data:', error)
            if (!mountedRef.current) return
            // Set safe fallback values
            setSummary({
                day: {
                    current: { sales: 0, orders: 0, net_profit: 0, expenses: 0 },
                    previous: { sales: 0, orders: 0, net_profit: 0, expenses: 0 }
                },
                week: {
                    current: { sales: 0, orders: 0, net_profit: 0, expenses: 0 },
                    previous: { sales: 0, orders: 0, net_profit: 0, expenses: 0 }
                },
                month: {
                    current: { sales: 0, orders: 0, net_profit: 0, expenses: 0 },
                    previous: { sales: 0, orders: 0, net_profit: 0, expenses: 0 }
                }
            })
            setTopItems({ topSelling: [], topProfitable: [] })
            setSalesChart([])
            setPaymentBreakdown([])
            setCashierPerformance([])
            setShiftComparison([])
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    const handleRefresh = () => {
        setRefreshing(true)
        fetchDashboardData()
    }

    return (
        <div className="dashboard animate-fade-in">
            <div className="dashboard-header mb-8">
                <div>
                    <h1 className="text-2xl font-bold mb-2">لوحة التحكم السريعة</h1>
                    <p className="text-secondary">أهلاً بك، {user?.full_name}</p>
                </div>
                <div className="flex gap-3">
                    <button className="btn btn-secondary" onClick={handleRefresh} disabled={loading || refreshing}>
                        <RefreshCw size={18} className={(loading || refreshing) ? 'spin' : ''} />
                        تحديث البيانات
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/pos')}>
                        <ShoppingCart size={18} />
                        نقطة البيع
                    </button>
                </div>
            </div>

            {/* Daily Stats */}
            <div className="section-title mb-4 flex items-center gap-2">
                <Activity size={20} className="text-primary" />
                <h2 className="text-lg font-bold">ملخص اليوم</h2>
            </div>
            <div className="stats-grid mb-8">
                <StatCard
                    title="مبيعات اليوم"
                    value={summary?.day.current.sales}
                    previousValue={summary?.day.previous.sales}
                    icon={DollarSign}
                    color="#10b981"
                    bgColor="rgba(16, 185, 129, 0.1)"
                />
                <StatCard
                    title="عدد الطلبات"
                    value={summary?.day.current.orders}
                    previousValue={summary?.day.previous.orders}
                    icon={ShoppingBag}
                    color="#3b82f6"
                    bgColor="rgba(59, 130, 246, 0.1)"
                    prefix=""
                />
                <StatCard
                    title="صافي ربح اليوم"
                    value={summary?.day.current.net_profit}
                    previousValue={summary?.day.previous.net_profit}
                    icon={TrendingUp}
                    color="#8b5cf6"
                    bgColor="rgba(139, 92, 246, 0.1)"
                />
                <StatCard
                    title="مصروفات اليوم"
                    value={summary?.day.current.expenses}
                    previousValue={summary?.day.previous.expenses}
                    icon={DollarSign}
                    color="#ef4444"
                    bgColor="rgba(239, 68, 68, 0.1)"
                />
            </div>

            {/* Monthly Stats */}
            <div className="section-title mb-4 flex items-center gap-2">
                <Calendar size={20} className="text-primary" />
                <h2 className="text-lg font-bold">ملخص الشهر</h2>
            </div>
            <div className="stats-grid mb-8">
                <StatCard
                    title="مبيعات الشهر"
                    value={summary?.month.current.sales}
                    previousValue={summary?.month.previous.sales}
                    icon={DollarSign}
                    color="#10b981"
                    bgColor="rgba(16, 185, 129, 0.1)"
                />
                <StatCard
                    title="صافي ربح الشهر"
                    value={summary?.month.current.net_profit}
                    previousValue={summary?.month.previous.net_profit}
                    icon={TrendingUp}
                    color="#8b5cf6"
                    bgColor="rgba(139, 92, 246, 0.1)"
                />
                <StatCard
                    title="إجمالي المصروفات"
                    value={summary?.month.current.expenses}
                    previousValue={summary?.month.previous.expenses}
                    icon={DollarSign}
                    color="#ef4444"
                    bgColor="rgba(239, 68, 68, 0.1)"
                />
                <StatCard
                    title="تكلفة البضاعة المباعة"
                    value={summary?.month.current.cogs}
                    previousValue={summary?.month.previous.cogs}
                    icon={ShoppingBag}
                    color="#f59e0b"
                    bgColor="rgba(245, 158, 11, 0.1)"
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="card p-6">
                    <h3 className="text-lg font-bold mb-6">تحليل المبيعات (آخر 30 يوم)</h3>
                    <div style={{ height: 300, minHeight: 300 }}>
                        <ResponsiveContainer width="100%" height="100%" minHeight={250} minWidth={0}>
                            <AreaChart data={salesChart}>
                                <defs>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(str) => new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                    stroke="#9ca3af"
                                />
                                <YAxis stroke="#9ca3af" />
                                <Tooltip
                                    formatter={(value) => [formatCurrency(value), 'المبيعات']}
                                    labelFormatter={(label) => new Date(label).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                />
                                <Area type="monotone" dataKey="sales" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSales)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="card p-6">
                    <h3 className="text-lg font-bold mb-6">أفضل 5 أصناف مبيعاً هذا الشهر</h3>
                    <div style={{ height: 300, minHeight: 300 }}>
                        <ResponsiveContainer width="100%" height="100%" minHeight={250} minWidth={0}>
                            <BarChart data={topItems.topSelling} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                                <XAxis type="number" stroke="#9ca3af" />
                                <YAxis dataKey="name" type="category" width={100} stroke="#9ca3af" fontSize={12} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    formatter={(value) => [value, 'الكمية المباعة']}
                                />
                                <Bar dataKey="total_quantity" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Top Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card">
                    <div className="card-header border-b border-border p-4">
                        <h3 className="font-bold">الأكثر تحقيقاً للأرباح</h3>
                    </div>
                    <div className="p-0">
                        <table className="w-full">
                            <thead className="bg-bg-secondary text-text-secondary text-sm">
                                <tr>
                                    <th className="p-3 text-right">الصنف</th>
                                    <th className="p-3 text-right">صافي الربح</th>
                                    <th className="p-3 text-right">الكمية</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topItems.topProfitable.map((item, i) => (
                                    <tr key={i} className="border-b border-border last:border-0 hover:bg-bg-secondary transition-colors">
                                        <td className="p-3 font-medium">{item.name}</td>
                                        <td className="p-3 text-success font-bold">{formatCurrency(item.total_profit)}</td>
                                        <td className="p-3">{item.total_quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header border-b border-border p-4">
                        <h3 className="font-bold">الأكثر مبيعاً (كميات)</h3>
                    </div>
                    <div className="p-0">
                        <table className="w-full">
                            <thead className="bg-bg-secondary text-text-secondary text-sm">
                                <tr>
                                    <th className="p-3 text-right">الصنف</th>
                                    <th className="p-3 text-right">المبيعات</th>
                                    <th className="p-3 text-right">الكمية</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topItems.topSelling.map((item, i) => (
                                    <tr key={i} className="border-b border-border last:border-0 hover:bg-bg-secondary transition-colors">
                                        <td className="p-3 font-medium">{item.name}</td>
                                        <td className="p-3 text-primary font-bold">{formatCurrency(item.total_revenue)}</td>
                                        <td className="p-3">{item.total_quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Payment Methods Breakdown */}
            <div className="mt-8">
                <div className="card">
                    <div className="card-header border-b border-border p-4">
                        <h3 className="font-bold flex items-center gap-2">
                            <CreditCard size={20} />
                            تفصيل وسائل الدفع (هذا الشهر)
                        </h3>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {paymentBreakdown.map((pm) => (
                                <div key={pm.payment_method} className="payment-method-card">
                                    <div className="payment-method-header">
                                        <CreditCard size={18} />
                                        <span className="payment-method-name">
                                            {pm.payment_method === 'cash' && 'نقدي'}
                                            {pm.payment_method === 'visa' && 'فيزا'}
                                            {pm.payment_method === 'instapay' && 'إنستاباي'}
                                            {pm.payment_method === 'vodafone' && 'فودافون كاش'}
                                        </span>
                                    </div>
                                    <div className="payment-method-amount">
                                        {formatCurrency(pm.total_amount)}
                                    </div>
                                    <div className="payment-method-footer">
                                        <span>{pm.count} طلب</span>
                                        <span className="percentage">{pm.percentage}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Cashier Performance */}
            <div className="mt-8">
                <div className="card">
                    <div className="card-header border-b border-border p-4">
                        <h3 className="font-bold flex items-center gap-2">
                            <Users size={20} />
                            أداء الكاشيرات (هذا الشهر)
                        </h3>
                    </div>
                    <div className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-bg-secondary text-text-secondary text-sm">
                                    <tr>
                                        <th className="p-3 text-right">الاسم</th>
                                        <th className="p-3 text-right">الطلبات</th>
                                        <th className="p-3 text-right">المبيعات</th>
                                        <th className="p-3 text-right">الربح</th>
                                        <th className="p-3 text-right">متوسط الطلب</th>
                                        <th className="p-3 text-right">الورديات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cashierPerformance.map((cashier) => (
                                        <tr key={cashier.id} className="border-b border-border last:border-0 hover:bg-bg-secondary transition-colors">
                                            <td className="p-3 font-medium">{cashier.full_name}</td>
                                            <td className="p-3">{cashier.total_orders}</td>
                                            <td className="p-3 text-primary font-bold">{formatCurrency(cashier.total_sales)}</td>
                                            <td className="p-3 text-success font-bold">{formatCurrency(cashier.total_profit)}</td>
                                            <td className="p-3">{formatCurrency(cashier.avg_order_value)}</td>
                                            <td className="p-3">{cashier.shifts_count} ورديات</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Shift Comparison */}
            <div className="mt-8">
                <div className="card">
                    <div className="card-header border-b border-border p-4">
                        <h3 className="font-bold flex items-center gap-2">
                            <Clock3 size={20} />
                            مقارنة الورديات (آخر 10 ورديات)
                        </h3>
                    </div>
                    <div className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-bg-secondary text-text-secondary text-sm">
                                    <tr>
                                        <th className="p-3 text-right">التاريخ</th>
                                        <th className="p-3 text-right">الكاشير</th>
                                        <th className="p-3 text-right">المدة</th>
                                        <th className="p-3 text-right">الطلبات</th>
                                        <th className="p-3 text-right">المبيعات</th>
                                        <th className="p-3 text-right">التكلفة</th>
                                        <th className="p-3 text-right">صافي الربح</th>
                                        <th className="p-3 text-right">هامش الربح</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shiftComparison.map((shift) => (
                                        <tr key={shift.id} className="border-b border-border last:border-0 hover:bg-bg-secondary transition-colors">
                                            <td className="p-3">
                                                {new Date(shift.shift_date).toLocaleDateString('en-GB')}
                                            </td>
                                            <td className="p-3 font-medium">{shift.cashier_name}</td>
                                            <td className="p-3">{shift.duration_hours} ساعة</td>
                                            <td className="p-3">{shift.total_orders}</td>
                                            <td className="p-3 text-primary">{formatCurrency(shift.total_revenue)}</td>
                                            <td className="p-3 text-error">{formatCurrency(shift.total_cost)}</td>
                                            <td className="p-3 text-success font-bold">{formatCurrency(shift.total_profit)}</td>
                                            <td className="p-3">
                                                <span className={`profit-margin ${shift.profit_margin_pct > 30 ? 'high' : shift.profit_margin_pct > 20 ? 'medium' : 'low'}`}>
                                                    {shift.profit_margin_pct}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
