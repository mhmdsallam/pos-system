import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    DollarSign, Calendar, Filter, Plus, Trash2, Edit2,
    Search, User, FileText, ChevronDown, ChevronUp, BarChart2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { showToast, useEscapeClose } from '../hooks/usePerformance';
import './Expenses.css';

const Expenses = () => {
    const { token, hasRole, user } = useAuth();
    const [expenses, setExpenses] = useState([]);
    const [stats, setStats] = useState({ today_total: 0, month_total: 0 });
    const [monthlySummary, setMonthlySummary] = useState([]);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]); // For filtering by user

    // Filters
    const [filters, setFilters] = useState({
        start_date: '',
        end_date: '',
        month: new Date().toLocaleDateString('en-CA').slice(0, 7), // Default current month
        category: 'all',
        user_id: ''
    });

    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentExpense, setCurrentExpense] = useState(null);
    const deleteConfirmRef = useRef(null);

    // ESC to close modals
    useEscapeClose(setShowModal);
    const [formData, setFormData] = useState({
        category: '',
        amount: '',
        description: '',
        date: new Date().toLocaleDateString('en-CA')
    });

    const categories = [
        'كهرباء', 'إيجار', 'خامات', 'رواتب', 'صيانة', 'نثرية', 'أخرى'
    ];

    // Fetch static data once on mount (users, monthly summary)
    const usersLoaded = useRef(false);
    useEffect(() => {
        if (!usersLoaded.current) {
            usersLoaded.current = true;
            fetchMonthlySummary();
            if (hasRole('owner')) {
                fetchUsers();
            }
        }
    }, []);

    // Debounce filter changes - only fetch expenses & stats when filters change
    const filterTimerRef = useRef(null);
    useEffect(() => {
        if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
        filterTimerRef.current = setTimeout(() => {
            fetchExpenses();
            fetchStats();
        }, 300);
        return () => { if (filterTimerRef.current) clearTimeout(filterTimerRef.current); };
    }, [filters]);

    const fetchExpenses = async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            if (filters.month) queryParams.append('month', filters.month);
            if (filters.start_date && filters.end_date) {
                queryParams.append('start_date', filters.start_date);
                queryParams.append('end_date', filters.end_date);
            }
            if (filters.category && filters.category !== 'all') queryParams.append('category', filters.category);
            if (filters.user_id) queryParams.append('user_id', filters.user_id);

            const res = await fetch(`/api/expenses?${queryParams}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch expenses');

            const data = await res.json();
            setExpenses(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/expenses/stats', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setStats(data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchMonthlySummary = async () => {
        try {
            const res = await fetch('/api/expenses/monthly-summary', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            // Format for chart
            const formatted = data.map(item => ({
                month: item.month,
                total: item.total,
                name: new Date(item.month + '-01').toLocaleDateString('en-GB', { month: 'short' })
            }));
            setMonthlySummary(formatted);
        } catch (err) {
            console.error("Failed to fetch monthly summary", err);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/users', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (err) {
            console.error("Failed to fetch users for filter", err);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const url = isEditing ? `/api/expenses/${currentExpense.id}` : '/api/expenses';
        const method = isEditing ? 'PUT' : 'POST';

        fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        }).then((res) => {
            if (!res.ok) throw new Error('فشل حفظ المصروف');
            setShowModal(false);
            setFormData({ category: '', amount: '', description: '', date: new Date().toISOString().slice(0, 10) });
            showToast('تم حفظ المصروف بنجاح', 'success');
            fetchExpenses();
            fetchStats();
        }).catch((err) => {
            showToast(err.message, 'error');
        });
    };

    const handleDelete = (id) => {
        if (deleteConfirmRef.current !== id) {
            deleteConfirmRef.current = id;
            showToast('اضغط حذف مرة أخرى خلال 5 ثوان للتأكيد', 'warning');
            setTimeout(() => {
                if (deleteConfirmRef.current === id) deleteConfirmRef.current = null;
            }, 5000);
            return;
        }
        deleteConfirmRef.current = null;
        fetch(`/api/expenses/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        }).then((res) => {
            if (!res.ok) throw new Error('فشل الحذف');
            showToast('تم حذف المصروف', 'success');
            fetchExpenses();
            fetchStats();
        }).catch((err) => {
            showToast(err.message, 'error');
        });
    };

    const openEditModal = (expense) => {
        setIsEditing(true);
        setCurrentExpense(expense);
        setFormData({
            category: expense.category,
            amount: expense.amount,
            description: expense.description || '',
            date: expense.date.slice(0, 10)
        });
        setShowModal(true);
    };

    const openAddModal = () => {
        setIsEditing(false);
        setFormData({
            category: '',
            amount: '',
            description: '',
            date: new Date().toLocaleDateString('en-CA')
        });
        setShowModal(true);
    };

    return (
        <div className="expenses-page p-6 bg-bg-primary min-h-screen">
            {/* Header & Stats */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
                        <DollarSign className="text-warning" size={28} />
                        إدارة المصروفات
                    </h1>
                    <p className="text-secondary text-sm mt-1">متابعة المصروفات اليومية والشهرية والسجلات المالية</p>
                </div>

                <div className="flex gap-4 w-full md:w-auto">
                    <div className="card p-4 flex-1 min-w-[180px] relative overflow-hidden flex items-center gap-4">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-warning-soft rounded-bl-full -mr-2 -mt-2"></div>
                        <div className="w-12 h-12 rounded-full bg-warning-soft flex items-center justify-center text-warning flex-shrink-0 relative z-10">
                            <DollarSign size={24} />
                        </div>
                        <div className="relative z-10">
                            <div className="text-secondary text-xs font-semibold mb-1">مصروفات اليوم</div>
                            <div className="text-2xl font-bold text-primary">{stats.today_total.toLocaleString()} ج.م</div>
                        </div>
                    </div>
                    <div className="card p-4 flex-1 min-w-[180px] relative overflow-hidden flex items-center gap-4">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-accent-soft rounded-bl-full -mr-2 -mt-2"></div>
                        <div className="w-12 h-12 rounded-full bg-accent-soft flex items-center justify-center text-accent flex-shrink-0 relative z-10">
                            <Calendar size={24} />
                        </div>
                        <div className="relative z-10">
                            <div className="text-secondary text-xs font-semibold mb-1">مصروفات الشهر</div>
                            <div className="text-2xl font-bold text-primary">{stats.month_total.toLocaleString()} ج.م</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Monthly Chart (Collapsible or Always Visible) */}
            <div className="card p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-primary flex items-center gap-2">
                        <BarChart2 size={18} className="text-accent" />
                        ملخص المصروفات الشهرية
                    </h3>
                </div>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%" minHeight={200} minWidth={0}>
                        <BarChart data={monthlySummary}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} tickFormatter={(val) => `ج.م ${val}`} />
                            <Tooltip
                                cursor={{ fill: 'var(--color-bg-hover)' }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                            />
                            <Bar dataKey="total" fill="var(--color-accent)" radius={[4, 4, 0, 0]} name="المصروفات" barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Filters Bar removed from here as it was already handled in previous step (wait, previous step *replaced* filters bar, so I need to make sure I don't duplicate or overwrite wrong section. Actually the chart is BEFORE filters in file.) */}
            {/* Wait, my previous ReplaceFileContent targeted lines 271-315 (Filters Bar). This new replacement targets 247-268 (Chart) and 318-387 (Table). */}
            {/* I will split this into two chunks to successfully target the Chart and Table separately, skipping the already-updated Filters Bar. */}

            {/* Filters Bar */}
            <div className="card p-4 mb-6 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-secondary mb-1 block">الشهر</label>
                    <input
                        type="month"
                        value={filters.month}
                        onChange={(e) => setFilters({ ...filters, month: e.target.value, start_date: '', end_date: '' })}
                        className="input-field w-full"
                    />
                </div>

                <div className="flex-1 min-w-[150px]">
                    <label className="text-xs text-secondary mb-1 block">نوع المصروف</label>
                    <select
                        value={filters.category}
                        onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                        className="input-field w-full"
                    >
                        <option value="all">الكل</option>
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </div>

                {(hasRole('owner')) && (
                    <div className="flex-1 min-w-[150px]">
                        <label className="text-xs text-secondary mb-1 block">المستخدم</label>
                        <select
                            value={filters.user_id}
                            onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
                            className="input-field w-full"
                        >
                            <option value="">الكل</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                        </select>
                    </div>
                )}

                <button
                    onClick={openAddModal}
                    className="btn btn-primary flex items-center gap-2 h-[42px]"
                >
                    <Plus size={18} />
                    <span>إضافة مصروف</span>
                </button>
            </div>

            {/* Expenses Table */}
            <div className="card overflow-hidden">
                <table className="w-full text-right">
                    <thead className="bg-bg-elevated border-b border-border">
                        <tr>
                            <th className="p-4 text-xs font-medium text-secondary">التاريخ</th>
                            <th className="p-4 text-xs font-medium text-secondary">الفئة</th>
                            <th className="p-4 text-xs font-medium text-secondary">الوصف</th>
                            <th className="p-4 text-xs font-medium text-secondary">المبلغ</th>
                            <th className="p-4 text-xs font-medium text-secondary">بواسطة</th>
                            {(hasRole('owner')) && (
                                <th className="p-4 text-xs font-medium text-secondary">إجراءات</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {expenses.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="p-8 text-center text-muted">
                                    لا توجد مصروفات في هذه الفترة
                                </td>
                            </tr>
                        ) : (
                            expenses.map(expense => (
                                <tr key={expense.id} className="hover:bg-bg-hover transition-colors">
                                    <td className="p-4 text-sm text-secondary">
                                        {new Date(expense.date).toLocaleDateString('en-GB')}
                                    </td>
                                    <td className="p-4">
                                        <span className="badge badge-info">
                                            {expense.category}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm text-secondary max-w-xs truncate">
                                        {expense.description || '-'}
                                    </td>
                                    <td className="p-4 text-sm font-bold text-primary">
                                        {expense.amount.toLocaleString()} ج.م
                                    </td>
                                    <td className="p-4 text-sm text-muted">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-bg-elevated flex items-center justify-center text-xs">
                                                <User size={12} />
                                            </div>
                                            {expense.user_name || 'غير معروف'}
                                        </div>
                                    </td>
                                    {(hasRole('owner')) && (
                                        <td className="p-4 flex gap-2">
                                            <button
                                                onClick={() => openEditModal(expense)}
                                                className="btn-icon"
                                                title="تعديل"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(expense.id)}
                                                className="btn-icon btn-icon-danger"
                                                title="حذف"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="card rounded-2xl w-full max-w-md shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
                        <div className="p-4 border-b border-border flex justify-between items-center">
                            <h2 className="text-lg font-bold text-primary">
                                {isEditing ? 'تعديل مصروف' : 'إضافة مصروف جديد'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-secondary hover:text-primary">
                                <span className="text-xl">×</span>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-primary mb-1">نوع المصروف *</label>
                                <select
                                    required
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    className="input-field w-full"
                                    autoFocus
                                >
                                    <option value="">اختر الفئة</option>
                                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-primary mb-1">المبلغ *</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        required
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        className="input-field w-full pr-8"
                                        onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
                                    />
                                    <span className="absolute right-3 top-2.5 text-muted text-xs">ج.م</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-primary mb-1">التاريخ</label>
                                <input
                                    type="date"
                                    required
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    className="input-field w-full"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-primary mb-1">ملاحظات</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="input-field w-full min-h-[80px]"
                                    placeholder="تفاصيل إضافية..."
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="btn btn-secondary flex-1"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary flex-1"
                                >
                                    {isEditing ? 'حفظ التغييرات' : 'إضافة المصروف'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Expenses;
