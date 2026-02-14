import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Search, Filter, Eye, Check, X, Clock, RefreshCw, ShoppingBag, Phone, User, MapPin, Printer } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { showToast, useEscapeClose } from '../hooks/usePerformance'
import Receipts from '../components/Receipts'
import { printRef } from '../utils/printHelper'
import './Orders.css'

export default function Orders() {
    const { user, token, hasRole } = useAuth()
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all')
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedOrder, setSelectedOrder] = useState(null)
    const [showModal, setShowModal] = useState(false)
    const [showReceipt, setShowReceipt] = useState(false)
    const [searchResults, setSearchResults] = useState([])
    const [isSearching, setIsSearching] = useState(false)
    const receiptRef = useRef()

    // ESC to close modals
    useEscapeClose(setShowModal, setShowReceipt);

    useEffect(() => {
        fetchOrders()
    }, [filter])

    // Debounced search
    useEffect(() => {
        if (searchTerm.length >= 2) {
            setIsSearching(true)
            const timeoutId = setTimeout(() => {
                searchOrders(searchTerm)
            }, 300)
            return () => clearTimeout(timeoutId)
        } else {
            setSearchResults([])
            setIsSearching(false)
            fetchOrders()
        }
    }, [searchTerm])

    const fetchOrders = async () => {
        try {
            const headers = { 'Authorization': `Bearer ${token}` };
            const url = filter === 'all'
                ? '/api/orders'
                : `/api/orders?status=${filter}`
            const response = await fetch(url, { headers })
            const data = await response.json()
            setOrders(data)
            setIsSearching(false)
        } catch (error) {
            console.error('Error fetching orders:', error)
            setIsSearching(false)
        } finally {
            setLoading(false)
        }
    }

    const searchOrders = async (term) => {
        try {
            const headers = { 'Authorization': `Bearer ${token}` };
            const response = await fetch(`/api/orders?search=${encodeURIComponent(term)}`, { headers })
            const data = await response.json()
            setSearchResults(data)
            setIsSearching(false)
        } catch (error) {
            console.error('Error searching orders:', error)
            setIsSearching(false)
        }
    }

    const updateOrderStatus = async (orderId, status) => {
        try {
            const response = await fetch(`/api/orders/${orderId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            })

            if (response.ok) {
                fetchOrders()
                if (selectedOrder?.id === orderId) {
                    setSelectedOrder({ ...selectedOrder, status })
                }
            }
        } catch (error) {
            console.error('Error updating order:', error)
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
        let dStr = dateString
        // SQLite stores dates as UTC without timezone indicator
        // If format is "YYYY-MM-DD HH:MM:SS" without Z or T, treat as UTC
        if (typeof dateString === 'string' && !dateString.includes('Z') && !dateString.includes('T') && dateString.includes(' ')) {
            dStr = dateString.replace(' ', 'T') + 'Z'
        }
        const date = new Date(dStr)
        const d = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Cairo' })
        const t = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Cairo' })
        return `${d} | ${t}`
    }

    const getStatusBadge = (status) => {
        const statusMap = {
            pending: { class: 'badge-warning', label: 'معلق' },
            preparing: { class: 'badge-info', label: 'جاري التحضير' },
            ready: { class: 'badge-success', label: 'جاهز' },
            completed: { class: 'badge-primary', label: 'مكتمل' },
            cancelled: { class: 'badge-error', label: 'ملغى' }
        }
        return statusMap[status] || { class: 'badge-secondary', label: status }
    }

    const filteredOrders = useMemo(() => {
        const source = searchTerm.length >= 2 ? searchResults : orders;
        if (!searchTerm || searchTerm.length >= 2) return source;
        return source.filter(order =>
            order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.table_number && order.table_number.includes(searchTerm))
        );
    }, [searchTerm, searchResults, orders]);

    const statusFilters = [
        { value: 'all', label: 'الكل' },
        { value: 'pending', label: 'معلق' },
        { value: 'preparing', label: 'جاري التحضير' },
        { value: 'ready', label: 'جاهز' },
        { value: 'completed', label: 'مكتمل' },
        { value: 'cancelled', label: 'ملغى' }
    ]

    return (
        <div className="orders-page animate-fade-in">
            {loading && orders.length === 0 && (
                <div className="flex justify-center items-center" style={{ minHeight: '200px' }}>
                    <div className="spinner-large"></div>
                </div>
            )}
            {(!loading || orders.length > 0) && <>
                <div className="page-header">
                    <div>
                        <h1>الطلبات</h1>
                        <p className="text-secondary">إدارة جميع طلبات المطاعم</p>
                    </div>
                </div>

                <div className="filters-bar">
                    <div className="search-box">
                        <Search size={20} className="text-muted" />
                        <input
                            type="text"
                            placeholder="بحث برقم الهاتف، اسم العميل، أو رقم الطلب..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                            dir="ltr"
                        />
                        {isSearching && <div className="search-spinner"></div>}
                    </div>
                    <div className="status-filters">
                        {statusFilters.map(f => (
                            <button
                                key={f.value}
                                className={`filter-btn ${filter === f.value ? 'active' : ''}`}
                                onClick={() => setFilter(f.value)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="orders-table-container card">
                    {filteredOrders.length === 0 ? (
                        <div className="empty-state">
                            <ShoppingBag size={64} className="text-muted" />
                            <h3>لا توجد طلبات</h3>
                            <p className="text-secondary">لم يتم العثور على أي طلبات</p>
                        </div>
                    ) : (
                        <table className="orders-table">
                            <thead>
                                <tr>
                                    <th>رقم الطلب</th>
                                    <th>الطاولة/العميل</th>
                                    <th>المجموع</th>
                                    <th>الحالة</th>
                                    <th>الكاشير</th>
                                    <th>التاريخ</th>
                                    <th>الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredOrders.map(order => {
                                    const statusBadge = getStatusBadge(order.status)
                                    const customerDisplay = order.order_type === 'delivery'
                                        ? order.customer_name || 'عميل'
                                        : (order.table_number ? `طاولة ${order.table_number}` : '-')
                                    return (
                                        <tr key={order.id}>
                                            <td>
                                                <span className="order-number">{order.order_number}</span>
                                            </td>
                                            <td>
                                                <div className="customer-cell">
                                                    <span className="customer-name">{customerDisplay}</span>
                                                    {order.customer_phone && (
                                                        <span className="customer-phone">{order.customer_phone}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="order-total">{formatCurrency(order.total)}</td>
                                            <td>
                                                <span className={`badge ${statusBadge.class}`}>
                                                    {statusBadge.label}
                                                </span>
                                            </td>
                                            <td>{order.cashier_name || '-'}</td>
                                            <td className="text-muted">{formatDate(order.created_at)}</td>
                                            <td>
                                                <div className="action-buttons">
                                                    <button
                                                        className="btn-icon"
                                                        onClick={() => {
                                                            let parsedItems = [];
                                                            try {
                                                                if (typeof order.items === 'string') {
                                                                    parsedItems = JSON.parse(order.items);
                                                                } else if (Array.isArray(order.items)) {
                                                                    parsedItems = order.items;
                                                                }
                                                            } catch (e) { console.error(e) }

                                                            setSelectedOrder({ ...order, items: parsedItems })
                                                            setShowModal(true)
                                                        }}
                                                        title="عرض التفاصيل"
                                                    >
                                                        <Eye size={18} />
                                                    </button>
                                                    {hasRole(['owner', 'cashier']) && order.status === 'pending' && (
                                                        <button
                                                            className="btn-icon btn-success"
                                                            onClick={() => updateOrderStatus(order.id, 'preparing')}
                                                            title="بدء التحضير"
                                                        >
                                                            <RefreshCw size={18} />
                                                        </button>
                                                    )}
                                                    {hasRole(['owner', 'cashier']) && order.status === 'preparing' && (
                                                        <button
                                                            className="btn-icon btn-success"
                                                            onClick={() => updateOrderStatus(order.id, 'ready')}
                                                            title="علامة جاهز"
                                                        >
                                                            <Check size={18} />
                                                        </button>
                                                    )}
                                                    {hasRole(['owner', 'cashier']) && order.status === 'ready' && (
                                                        <button
                                                            className="btn-icon btn-primary"
                                                            onClick={() => updateOrderStatus(order.id, 'completed')}
                                                            title="إكمال الطلب"
                                                        >
                                                            <Check size={18} />
                                                        </button>
                                                    )}
                                                    {hasRole(['owner', 'cashier']) && ['pending', 'preparing', 'ready'].includes(order.status) && (
                                                        <button
                                                            className="btn-icon btn-error"
                                                            onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                                            title="إلغاء الطلب"
                                                        >
                                                            <X size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Order Details Modal */}
                {showModal && selectedOrder && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>تفاصيل الطلب {selectedOrder.order_number}</h2>
                                <div className="flex gap-2">
                                    <button
                                        className="btn btn-primary flex items-center gap-2"
                                        onClick={() => setShowReceipt(true)}
                                        title="طباعة الفاتورة"
                                    >
                                        <Printer size={18} /> طباعة
                                    </button>
                                    <button className="modal-close" onClick={() => setShowModal(false)}>
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>
                            <div className="modal-body">
                                <div className="order-details-grid">
                                    {(selectedOrder.customer_name || selectedOrder.customer_phone || selectedOrder.customer_address) && (
                                        <div className="customer-info-section">
                                            <h4><User size={16} /> معلومات العميل</h4>
                                            <div className="customer-details">
                                                {selectedOrder.customer_name && (
                                                    <div className="detail-item">
                                                        <span className="label">الاسم:</span>
                                                        <span className="value">{selectedOrder.customer_name}</span>
                                                    </div>
                                                )}
                                                {selectedOrder.customer_phone && (
                                                    <div className="detail-item">
                                                        <span className="label">الهاتف:</span>
                                                        <span className="value" dir="ltr">{selectedOrder.customer_phone}</span>
                                                    </div>
                                                )}
                                                {selectedOrder.customer_address && (
                                                    <div className="detail-item full">
                                                        <span className="label">العنوان:</span>
                                                        <span className="value">{selectedOrder.customer_address}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div className="detail-item">
                                        <span className="label">الطاولة:</span>
                                        <span className="value">{selectedOrder.table_number || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">الحالة:</span>
                                        <span className={`badge ${getStatusBadge(selectedOrder.status).class}`}>
                                            {getStatusBadge(selectedOrder.status).label}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">طريقة الدفع:</span>
                                        <span className="value">
                                            {selectedOrder.payment_method === 'cash' ? 'نقدي' :
                                                selectedOrder.payment_method === 'vodafone' ? 'فودافون كاش' :
                                                    selectedOrder.payment_method === 'instapay' ? 'انستا باي' :
                                                        selectedOrder.payment_method || '-'}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">الكاشير:</span>
                                        <span className="value">{selectedOrder.cashier_name || '-'}</span>
                                    </div>
                                    <div className="detail-item full">
                                        <span className="label">التاريخ:</span>
                                        <span className="value">{formatDate(selectedOrder.created_at)}</span>
                                    </div>
                                </div>

                                <div className="order-items-section">
                                    <h4>المنتجات</h4>
                                    <table className="items-table">
                                        <thead>
                                            <tr>
                                                <th>المنتج</th>
                                                <th>الكمية</th>
                                                <th>السعر</th>
                                                <th>المجموع</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedOrder.items && selectedOrder.items.map((item, index) => (
                                                <tr key={index}>
                                                    <td>
                                                        <div className="flex flex-col">
                                                            <span>{item.product_name}</span>
                                                            {item.variation_name && <span className="text-xs text-secondary">{item.variation_name}</span>}
                                                            {item.is_spicy === 1 && <span className="text-xs text-error font-bold">سبايسي 🌶</span>}
                                                            {item.notes && <span className="text-xs text-accent italic">"{item.notes}"</span>}
                                                        </div>
                                                    </td>
                                                    <td>{item.quantity}</td>
                                                    <td>{formatCurrency(item.price)}</td>
                                                    <td>{formatCurrency(item.price * item.quantity)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colSpan="3" className="text-left font-bold">المجموع:</td>
                                                <td className="font-bold">{formatCurrency(selectedOrder.total)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Receipt Modal */}
                {showReceipt && selectedOrder && (
                    <div className="modal-overlay" onClick={() => setShowReceipt(false)}>
                        <div className="modal receipt-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>فاتورة الطلب</h2>
                                <button className="modal-close" onClick={() => setShowReceipt(false)}>
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <Receipts ref={receiptRef} order={selectedOrder} />
                                <div className="flex gap-2 mt-4">
                                    <button
                                        className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                                        onClick={() => printRef(receiptRef, { title: `فاتورة - ${selectedOrder.order_number}` })}
                                    >
                                        <Printer size={18} /> طباعة
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </>}
        </div>
    )


}
