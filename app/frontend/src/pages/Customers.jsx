import { useState, useEffect, useRef } from 'react'
import { Search, Plus, User, Phone, MapPin, History, Clock, DollarSign, ShoppingBag, Eye, X, Edit, Trash2, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useDebounce, showToast } from '../hooks/usePerformance'
import './Customers.css'

export default function Customers() {
    const { user, token, hasRole } = useAuth()
    const [customers, setCustomers] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState(null)
    const [showModal, setShowModal] = useState(false)
    const [showAddModal, setShowAddModal] = useState(false)
    const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' })
    const mountedRef = useRef(true)

    // Debounce search term to avoid API call per keystroke
    const debouncedSearch = useDebounce(searchTerm, 300)

    useEffect(() => {
        mountedRef.current = true
        return () => { mountedRef.current = false }
    }, [])

    useEffect(() => {
        fetchCustomers()
    }, [debouncedSearch])

    const fetchCustomers = async () => {
        try {
            const headers = { 'Authorization': `Bearer ${token}` };
            const url = debouncedSearch
                ? `/api/customers?search=${encodeURIComponent(debouncedSearch)}`
                : '/api/customers'
            const response = await fetch(url, { headers })
            const data = await response.json()
            if (mountedRef.current) setCustomers(data)
        } catch (error) {
            console.error('Error fetching customers:', error)
        } finally {
            if (mountedRef.current) setLoading(false)
        }
    }

    const viewCustomer = async (customer) => {
        try {
            const headers = { 'Authorization': `Bearer ${token}` };
            const response = await fetch(`/api/customers/${customer.id}`, { headers })
            const data = await response.json()
            setSelectedCustomer(data)
            setShowModal(true)
        } catch (error) {
            console.error('Error fetching customer:', error)
        }
    }

    const addCustomer = async () => {
        try {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };
            const response = await fetch('/api/customers', {
                method: 'POST',
                headers,
                body: JSON.stringify(newCustomer)
            })

            if (response.ok) {
                setShowAddModal(false)
                setNewCustomer({ name: '', phone: '', address: '' })
                fetchCustomers()
                showToast('تم إضافة العميل بنجاح', 'success')
            } else {
                const errData = await response.json()
                showToast(errData.error || 'خطأ في إضافة العميل', 'error')
            }
        } catch (error) {
            console.error('Error adding customer:', error)
            showToast('خطأ في إضافة العميل', 'error')
        }
    }

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ar-EG', {
            style: 'currency',
            currency: 'EGP'
        }).format(amount)
    }

    const formatDate = (dateString) => {
        if (!dateString) return '-'
        const date = new Date(dateString)
        return date.toLocaleDateString('en-GB')
    }

    return (
        <div className="customers-page animate-fade-in">
            {loading && (
                <div className="flex justify-center items-center" style={{ minHeight: '200px' }}>
                    <div className="spinner-large"></div>
                </div>
            )}
            {!loading && <>
                <div className="page-header">
                    <div>
                        <h1>العملاء</h1>
                        <p className="text-secondary">إدارة بيانات العملاء وتاريخ طلباتهم</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        <Plus size={20} />
                        إضافة عميل جديد
                    </button>
                </div>

                <div className="filters-bar">
                    <div className="search-box">
                        <Search size={20} className="text-muted" />
                        <input
                            type="text"
                            placeholder="بحث بالاسم أو رقم الهاتف..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                            dir="ltr"
                        />
                    </div>
                </div>

                <div className="customers-grid">
                    {customers.length === 0 ? (
                        <div className="empty-state">
                            <User size={64} className="text-muted" />
                            <h3>لا يوجد عملاء</h3>
                            <p className="text-secondary">لم يتم إضافة أي عملاء بعد</p>
                        </div>
                    ) : (
                        customers.map(customer => (
                            <div
                                key={customer.id}
                                className="customer-card"
                                onClick={() => viewCustomer(customer)}
                            >
                                <div className="customer-header">
                                    <div className="customer-avatar">
                                        <User size={24} />
                                    </div>
                                    <div className="customer-info">
                                        <h3>{customer.name}</h3>
                                        <span className="customer-phone" dir="ltr">{customer.phone}</span>
                                    </div>
                                    <ChevronRight size={20} className="chevron" />
                                </div>
                                <div className="customer-stats-row">
                                    <div className="stat-item">
                                        <ShoppingBag size={16} />
                                        <span>{customer.total_orders || 0} طلبات</span>
                                    </div>
                                    <div className="stat-item">
                                        <DollarSign size={16} />
                                        <span>{formatCurrency(customer.total_spent || 0)}</span>
                                    </div>
                                </div>
                                <div className="customer-dates">
                                    <div className="date-item">
                                        <Clock size={14} />
                                        <span>أول طلب: {formatDate(customer.first_order_date)}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Customer Details Modal */}
                {showModal && selectedCustomer && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)} onKeyDown={e => e.key === 'Escape' && setShowModal(false)}>
                        <div className="modal customer-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>ملف العميل</h2>
                                <button className="modal-close" onClick={() => setShowModal(false)}>
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="customer-profile-header">
                                    <div className="profile-avatar">
                                        <User size={40} />
                                    </div>
                                    <div className="profile-info">
                                        <h3>{selectedCustomer.name}</h3>
                                        <span className="profile-phone" dir="ltr">{selectedCustomer.phone}</span>
                                        {selectedCustomer.address && (
                                            <span className="profile-address">
                                                <MapPin size={14} />
                                                {selectedCustomer.address}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="profile-stats">
                                    <div className="profile-stat-card">
                                        <ShoppingBag size={24} />
                                        <div className="stat-content">
                                            <span className="stat-value">{selectedCustomer.total_orders || 0}</span>
                                            <span className="stat-label">إجمالي الطلبات</span>
                                        </div>
                                    </div>
                                    <div className="profile-stat-card">
                                        <DollarSign size={24} />
                                        <div className="stat-content">
                                            <span className="stat-value">{formatCurrency(selectedCustomer.total_spent || 0)}</span>
                                            <span className="stat-label">إجمالي المبالغ</span>
                                        </div>
                                    </div>
                                    <div className="profile-stat-card">
                                        <History size={24} />
                                        <div className="stat-content">
                                            <span className="stat-value">{formatCurrency((selectedCustomer.total_spent || 0) / Math.max(1, selectedCustomer.total_orders || 1))}</span>
                                            <span className="stat-label">متوسط الطلب</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="orders-history">
                                    <h4>تاريخ الطلبات</h4>
                                    {selectedCustomer.orders && selectedCustomer.orders.length > 0 ? (
                                        <div className="orders-list">
                                            {selectedCustomer.orders.map(order => (
                                                <div key={order.id} className="order-history-item">
                                                    <div className="order-info">
                                                        <span className="order-number">{order.order_number}</span>
                                                        <span className="order-date">{formatDate(order.created_at)}</span>
                                                    </div>
                                                    <div className="order-meta">
                                                        <span className={`badge ${order.status === 'completed' ? 'badge-success' : order.status === 'cancelled' ? 'badge-error' : 'badge-warning'}`}>
                                                            {order.status === 'completed' ? 'مكتمل' : order.status === 'cancelled' ? 'ملغى' : 'قيد الانتظار'}
                                                        </span>
                                                        <span className="order-total">{formatCurrency(order.total)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="no-orders">لا توجد طلبات سابقة</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add Customer Modal */}
                {showAddModal && (
                    <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                        <div className="modal add-customer-modal" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setShowAddModal(false); if (e.key === 'Enter' && newCustomer.name && newCustomer.phone) addCustomer(); }}>
                            <div className="modal-header">
                                <h2>إضافة عميل جديد</h2>
                                <button className="modal-close" onClick={() => setShowAddModal(false)}>
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>اسم العميل</label>
                                    <input
                                        type="text"
                                        value={newCustomer.name}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                        placeholder="أدخل اسم العميل"
                                        autoFocus
                                    />
                                </div>
                                <div className="form-group">
                                    <label>رقم الهاتف</label>
                                    <input
                                        type="text"
                                        value={newCustomer.phone}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                        placeholder="أدخل رقم الهاتف"
                                        dir="ltr"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>العنوان (اختياري)</label>
                                    <textarea
                                        value={newCustomer.address}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                        placeholder="أدخل العنوان"
                                        rows={3}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                                    إلغاء
                                </button>
                                <button className="btn btn-primary" onClick={addCustomer}>
                                    <Plus size={18} />
                                    إضافة العميل
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </>}
        </div>
    )
}
