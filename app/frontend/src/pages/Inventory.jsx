import { useState, useEffect, useMemo, useCallback, Fragment, useRef } from 'react'
import {
    Package, AlertTriangle, TrendingUp, Edit2, RefreshCw, Search, Plus,
    Calendar, Minus, Trash2, ChevronDown, ChevronUp, Tag, Filter, X,
    Download, Grid3X3, List, FolderPlus
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { showToast, useEscapeClose } from '../hooks/usePerformance'
import './Products.css'
import './InventoryEnhancements.css'

export default function Inventory() {
    const { token, hasRole, hasPermission } = useAuth()
    const [inventory, setInventory] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all') // 'all', 'low', 'out', 'expiring', 'expired'
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCategory, setSelectedCategory] = useState(null) // Filter by category
    const deleteConfirmRef = useRef(null)
    const newProductConfirmRef = useRef(null)
    const categoryDeleteRef = useRef(null)

    // Categories
    const [inventoryCategories, setInventoryCategories] = useState([])
    const [showCategoryModal, setShowCategoryModal] = useState(false)
    const [categoryForm, setCategoryForm] = useState({ id: null, name: '', description: '', icon: '', color: '#6b7280', sort_order: 0 })
    const [isEditingCategory, setIsEditingCategory] = useState(false)
    const [showCategoryManagementModal, setShowCategoryManagementModal] = useState(false)

    // Modal States
    const [showBatchModal, setShowBatchModal] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState(null)
    const [productBatches, setProductBatches] = useState([])
    const [expandedRow, setExpandedRow] = useState(null) // Product ID expanded for details
    const [viewMode, setViewMode] = useState('category') // 'list' or 'category'
    const [selectedCategoryForProduct, setSelectedCategoryForProduct] = useState(null) // Category to add product to

    // ESC to close modals
    useEscapeClose(setShowBatchModal, setShowCategoryModal, setShowCategoryManagementModal);

    // Form Data
    const [batchForm, setBatchForm] = useState({
        product_id: '',
        quantity: '',
        cost_price: '',
        expiry_date: '',
        supplier: '',
        notes: '',
        category_id: null // للربط بالفئة عند الإضافة
    })

    // Deduct Modal State
    const [showDeductModal, setShowDeductModal] = useState(false)
    const [deductData, setDeductData] = useState({ product_id: null, quantity: '', reason: 'تالف / منتهي الصلاحية' })

    // Update Quantity Modal State
    const [showUpdateQuantityModal, setShowUpdateQuantityModal] = useState(false)
    const [updateQuantityData, setUpdateQuantityData] = useState({ product_id: null, product_name: '', current_quantity: 0, new_quantity: '' })

    // Assign Category Modal
    const [showAssignCategoryModal, setShowAssignCategoryModal] = useState(false)
    const [assignCategoryData, setAssignCategoryData] = useState({ product_id: null, category_id: null })

    // Products List for Select
    const [productsList, setProductsList] = useState([])

    // Product Search State in Modal
    const [productSearch, setProductSearch] = useState('')
    const [showProductDropdown, setShowProductDropdown] = useState(false)

    const blockInvalidChar = e => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault();

    const todayISO = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.toISOString().split('T')[0];
    }, []);

    // Fetch products & categories only on mount (they don't depend on selectedCategory)
    useEffect(() => {
        fetchProducts()
        fetchInventoryCategories()
    }, [])

    // Fetch inventory whenever category filter changes
    useEffect(() => {
        fetchInventory()
    }, [selectedCategory])

    const fetchInventory = async () => {
        try {
            // Only show full loading spinner on first load, not on filter changes
            if (inventory.length === 0) setLoading(true)
            let url = '/api/inventory'
            const params = []
            if (selectedCategory) {
                params.push(`category_id=${selectedCategory}`)
            }
            if (params.length > 0) {
                url += '?' + params.join('&')
            }

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setInventory(Array.isArray(data) ? data : [])
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const fetchProducts = async () => {
        try {
            const res = await fetch('/api/products?include_hidden=true', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setProductsList(data)
        } catch (e) { }
    }

    const fetchInventoryCategories = async () => {
        try {
            const res = await fetch('/api/inventory/categories', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setInventoryCategories(Array.isArray(data) ? data : [])
        } catch (e) {
            console.error(e)
            setInventoryCategories([])
        }
    }

    const fetchBatches = async (productId) => {
        try {
            const res = await fetch(`/api/inventory/${productId}/batches`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setProductBatches(data)
        } catch (e) {
            console.error(e)
            setProductBatches([])
        }
    }

    const toggleRow = (productId) => {
        if (expandedRow === productId) {
            setExpandedRow(null)
            setProductBatches([])
        } else {
            setExpandedRow(productId)
            fetchBatches(productId)
        }
    }

    const handleAddBatch = async (e) => {
        e.preventDefault()

        const isNewProduct = !batchForm.product_id && productSearch.trim().length > 0;

        if (!batchForm.product_id && !isNewProduct) {
            showToast('يرجى اختيار منتج من القائمة أو كتابة اسم منتج جديد', 'warning')
            return
        }

        if (isNewProduct) {
            if (newProductConfirmRef.current !== productSearch) {
                newProductConfirmRef.current = productSearch
                showToast(`سيتم إضافة منتج جديد باسم "${productSearch}" - اضغط حفظ مرة أخرى للتأكيد`, 'warning')
                setTimeout(() => {
                    if (newProductConfirmRef.current === productSearch) newProductConfirmRef.current = null
                }, 5000)
                return
            }
            newProductConfirmRef.current = null
        }

        try {
            const payload = { ...batchForm };
            if (isNewProduct) {
                payload.product_name = productSearch;
            }

            if (payload.expiry_date) {
                const expiry = new Date(payload.expiry_date);
                const today = new Date(todayISO);
                if (Number.isNaN(expiry.getTime())) {
                    showToast('تاريخ الصلاحية غير صحيح', 'error');
                    return;
                }
                if (expiry < today) {
                    showToast('لا يمكن إضافة منتج منتهي الصلاحية', 'warning');
                    return;
                }
            }

            const res = await fetch('/api/inventory/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            })

            if (res.ok) {
                const result = await res.json()
                showToast('تم إضافة الدفعة بنجاح', 'success')

                // إذا كان هناك فئة محددة، نربط المنتج بها
                if (batchForm.category_id && result.product_id) {
                    try {
                        await fetch(`/api/inventory/${result.product_id}/category`, {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ category_id: batchForm.category_id })
                        })
                    } catch (err) {
                        console.error('Failed to assign category:', err)
                    }
                }

                // switch view to the added product's category so user can see it
                if (batchForm.category_id && selectedCategory !== batchForm.category_id) {
                    setSelectedCategory(batchForm.category_id)
                    // useEffect will trigger fetchInventory
                } else if (!batchForm.category_id && selectedCategory !== null) {
                    setSelectedCategory(null)
                    // useEffect will trigger fetchInventory
                } else {
                    // If view didn't change, we must manually fetch
                    await fetchInventory()
                }

                setShowBatchModal(false)
                setBatchForm({ product_id: '', quantity: '', cost_price: '', expiry_date: '', supplier: '', notes: '', category_id: null })
                setProductSearch('')
                setSelectedCategoryForProduct(null)
                await fetchProducts()
                if (expandedRow === batchForm.product_id) {
                    fetchBatches(batchForm.product_id)
                }
            } else {
                const err = await res.json()
                showToast('خطأ: ' + err.error, 'error')
            }
        } catch (e) {
            showToast('حدث خطأ في الاتصال', 'error')
        }
    }

    const openDeductModal = (productId) => {
        setDeductData({ product_id: productId, quantity: '', reason: 'تالف / منتهي الصلاحية' })
        setShowDeductModal(true)
    }

    const handleUpdateQuantity = (productId, productName, currentQuantity) => {
        setUpdateQuantityData({
            product_id: productId,
            product_name: productName,
            current_quantity: currentQuantity,
            new_quantity: currentQuantity.toString()
        })
        setShowUpdateQuantityModal(true)
    }

    const handleUpdateQuantitySubmit = async (e) => {
        e.preventDefault()

        const qty = parseInt(updateQuantityData.new_quantity)
        if (isNaN(qty) || qty < 0) {
            showToast('الكمية غير صحيحة', 'warning')
            return
        }

        try {
            const res = await fetch(`/api/inventory/${updateQuantityData.product_id}/quantity`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ quantity: qty, reason: 'تحديث يدوي' })
            })

            if (res.ok) {
                const result = await res.json()
                showToast(`✅ ${result.message} - القيمة القديمة: ${result.oldQuantity} - القيمة الجديدة: ${result.newQuantity}`, 'success')
                setShowUpdateQuantityModal(false)
                fetchInventory()
                if (expandedRow === updateQuantityData.product_id) fetchBatches(updateQuantityData.product_id)
            } else {
                const contentType = res.headers.get('content-type')
                if (contentType && contentType.includes('application/json')) {
                    const err = await res.json()
                    showToast('❌ خطأ: ' + (err.error || 'فشل التحديث'), 'error')
                } else {
                    showToast('❌ خطأ: الخادم لا يستجيب بشكل صحيح. تأكد من تشغيل الخادم وإعادة تحميل الصفحة.', 'error')
                }
            }
        } catch (e) {
            console.error(e)
            showToast('❌ خطأ في الاتصال - ' + e.message, 'error')
        }
    }

    const handleDeductSubmit = async (e) => {
        e.preventDefault()
        if (!deductData.quantity || isNaN(deductData.quantity) || deductData.quantity <= 0) return

        try {
            const res = await fetch('/api/inventory/deduct', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    product_id: deductData.product_id,
                    quantity: parseInt(deductData.quantity),
                    reason: deductData.reason
                })
            })

            if (res.ok) {
                showToast('تم الخصم بنجاح', 'success')
                setShowDeductModal(false)
                fetchInventory()
                if (expandedRow === deductData.product_id) fetchBatches(deductData.product_id)
            } else {
                const err = await res.json()
                showToast('خطأ: ' + (err.error || 'فشل العملية'), 'error')
            }
        } catch (e) {
            showToast('خطأ في الاتصال', 'error')
        }
    }

    const handleDeleteFromInventory = (productId, productName) => {
        if (!deleteConfirmRef.current || deleteConfirmRef.current !== productId) {
            deleteConfirmRef.current = productId
            showToast(`اضغط حذف مرة أخرى لحذف "${productName}"`, 'warning')
            setTimeout(() => {
                if (deleteConfirmRef.current === productId) deleteConfirmRef.current = null
            }, 5000)
            return
        }

        deleteConfirmRef.current = null

        const attemptDelete = (force = false) => fetch(`/api/inventory/${productId}${force ? '?force=true' : ''}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        })

        attemptDelete(false)
            .then(async (res) => {
                if (res.ok) return res
                const err = await res.json()
                if (err.error && err.error.includes('دفعات')) {
                    return attemptDelete(true)
                }
                throw new Error(err.error || 'فشل الحذف')
            })
            .then((res) => {
                if (!res.ok) throw new Error('فشل الحذف')
                showToast('✅ تم حذف المنتج من المخزون بنجاح', 'success')
                fetchInventory()
                if (expandedRow === productId) {
                    setExpandedRow(null)
                    setProductBatches([])
                }
            })
            .catch((e) => {
                console.error(e)
                showToast('❌ ' + (e.message || 'خطأ أثناء الحذف'), 'error')
            })
    }

    const handleAssignCategory = async (e) => {
        e.preventDefault()
        if (!assignCategoryData.category_id) {
            showToast('يرجى اختيار فئة', 'warning')
            return
        }

        try {
            const res = await fetch(`/api/inventory/${assignCategoryData.product_id}/category`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ category_id: assignCategoryData.category_id })
            })

            if (res.ok) {
                showToast('تم تحديث الفئة بنجاح', 'success')
                setShowAssignCategoryModal(false)
                fetchInventory()
            } else {
                const err = await res.json()
                showToast('خطأ: ' + err.error, 'error')
            }
        } catch (e) {
            showToast('خطأ في الاتصال', 'error')
        }
    }

    const handleCreateOrUpdateCategory = async (e) => {
        e.preventDefault()
        if (!categoryForm.name) {
            showToast('اسم الفئة مطلوب', 'warning')
            return
        }

        try {
            const url = isEditingCategory
                ? `/api/inventory/categories/${categoryForm.id}`
                : '/api/inventory/categories'

            const method = isEditingCategory ? 'PUT' : 'POST'

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: categoryForm.name,
                    description: categoryForm.description,
                    icon: categoryForm.icon,
                    color: categoryForm.color,
                    sort_order: categoryForm.sort_order
                })
            })

            if (res.ok) {
                showToast(isEditingCategory ? 'تم تحديث الفئة بنجاح' : 'تم إنشاء الفئة بنجاح', 'success')
                setShowCategoryModal(false)
                setCategoryForm({ id: null, name: '', description: '', icon: '', color: '#6b7280', sort_order: 0 })
                setIsEditingCategory(false)
                fetchInventoryCategories()
                fetchInventory()
            } else {
                const err = await res.json()
                showToast('خطأ: ' + err.error, 'error')
            }
        } catch (e) {
            showToast('خطأ في الاتصال', 'error')
        }
    }

    const handleDeleteCategory = (categoryId) => {
        if (categoryDeleteRef.current !== categoryId) {
            categoryDeleteRef.current = categoryId
            showToast('اضغط حذف مرة أخرى لتأكيد حذف الفئة (سيتم تعيين المنتجات كغير مصنفة)', 'warning')
            setTimeout(() => {
                if (categoryDeleteRef.current === categoryId) categoryDeleteRef.current = null
            }, 5000)
            return
        }

        categoryDeleteRef.current = null
        fetch(`/api/inventory/categories/${categoryId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(async (res) => {
                if (!res.ok) {
                    const err = await res.json()
                    throw new Error(err.error || 'فشل الحذف')
                }
                showToast('تم حذف الفئة بنجاح', 'success')
                fetchInventoryCategories()
                fetchInventory()
                if (selectedCategory === categoryId) {
                    setSelectedCategory(null)
                }
            })
            .catch(() => {
                showToast('خطأ في الاتصال أو الحذف', 'error')
            })
    }

    const openEditCategoryModal = (category) => {
        setCategoryForm({
            id: category.id,
            name: category.name,
            description: category.description || '',
            icon: category.icon || '',
            color: category.color || '#6b7280',
            sort_order: category.sort_order || 0
        })
        setIsEditingCategory(true)
        setShowCategoryModal(true)
    }

    const openNewCategoryModal = () => {
        setCategoryForm({ id: null, name: '', description: '', icon: '', color: '#6b7280', sort_order: 0 })
        setIsEditingCategory(false)
        setShowCategoryModal(true)
    }

    const openAddProductToCategory = (categoryId) => {
        // فتح modal إضافة منتج مع تحديد الفئة مسبقاً
        setSelectedCategoryForProduct(categoryId)
        setBatchForm({
            product_id: '',
            quantity: '',
            cost_price: '',
            expiry_date: '',
            supplier: '',
            notes: '',
            category_id: categoryId
        })
        setProductSearch('')
        setShowProductDropdown(false)
        setShowBatchModal(true)
    }

    const handleExport = async () => {
        try {
            const params = []
            if (searchTerm) params.push(`search=${encodeURIComponent(searchTerm)}`)
            if (selectedCategory) params.push(`category_id=${selectedCategory}`)
            if (filter && filter !== 'all') params.push(`filter=${filter}`)

            const queryString = params.length > 0 ? '?' + params.join('&') : ''

            const res = await fetch(`/api/inventory/export${queryString}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const blob = await res.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `inventory_report_${new Date().toISOString().split('T')[0]}.csv`
                document.body.appendChild(a)
                a.click()
                a.remove()
            } else {
                showToast('فشل التصدير', 'error')
            }
        } catch (e) {
            console.error(e)
            showToast('خطأ في الاتصال', 'error')
        }
    }

    // Filter Logic (memoized)
    const filteredInventory = useMemo(() => inventory.filter(item => {
        const matchesSearch = !searchTerm || item.product_name?.toLowerCase().includes(searchTerm.toLowerCase())

        if (!matchesSearch) return false

        if (filter === 'low') return item.quantity <= item.min_quantity && item.quantity > 0
        if (filter === 'out') return item.quantity <= 0
        if (filter === 'expiring') return item.expiring_batches_count > 0
        if (filter === 'expired') return item.expired_batches_count > 0

        return true
    }), [inventory, searchTerm, filter])

    // Group by Category (memoized)
    const groupedByCategory = useMemo(() => {
        const grouped = {}
        filteredInventory.forEach(item => {
            const catName = item.inventory_category_name || 'غير مصنّف'
            const catColor = item.inventory_category_color || '#6b7280'
            const catIcon = item.inventory_category_icon || '📦'

            if (!grouped[catName]) {
                grouped[catName] = {
                    items: [],
                    color: catColor,
                    icon: catIcon
                }
            }
            grouped[catName].items.push(item)
        })
        return grouped
    }, [filteredInventory])

    // Stats (memoized - computed from full inventory, not filtered)
    const { totalValue, expiringCount, expiredCount, lowStockCount } = useMemo(() => ({
        totalValue: inventory.reduce((sum, item) => sum + (item.quantity * item.avg_cost), 0),
        expiringCount: inventory.filter(i => i.expiring_batches_count > 0).length,
        expiredCount: inventory.filter(i => i.expired_batches_count > 0).length,
        lowStockCount: inventory.filter(i => i.quantity <= i.min_quantity && i.quantity > 0).length
    }), [inventory])

    return (
        <div className="products-container">
            <div className="products-header">
                <div className="header-title">
                    <Package size={28} />
                    <h1>إدارة المخزون المتقدم</h1>
                </div>
                {hasPermission('inventory.edit') && (
                    <div className="header-actions" style={{ gap: '10px', display: 'flex' }}>
                        <button className="inventory-action-btn inventory-action-btn-secondary" onClick={() => setShowCategoryManagementModal(true)}>
                            <Edit2 size={18} />
                            إدارة الفئات
                        </button>
                        <button className="inventory-action-btn inventory-action-btn-secondary" onClick={openNewCategoryModal}>
                            <FolderPlus size={18} />
                            إضافة فئة
                        </button>
                        <button className="inventory-action-btn inventory-action-btn-secondary" onClick={handleExport}>
                            <Download size={18} />
                            تصدير CSV
                        </button>
                        <button className="inventory-action-btn inventory-action-btn-primary" onClick={() => {
                            setBatchForm({
                                product_id: '',
                                quantity: '',
                                cost_price: '',
                                expiry_date: '',
                                supplier: '',
                                notes: '',
                                category_id: null
                            })
                            setProductSearch('')
                            setShowProductDropdown(false)
                            setSelectedCategoryForProduct(null)
                            setShowBatchModal(true)
                        }}>
                            <Plus size={20} />
                            إضافة دفعة مخزون
                        </button>
                    </div>
                )}
            </div>

            {/* Stats Cards */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#dbeafe', color: '#3b82f6' }}>
                        <Package size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">إجمالي قيمة المخزون</span>
                        <span className="stat-value">{totalValue.toFixed(2)} ج.م</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#fee2e2', color: '#ef4444' }}>
                        <AlertTriangle size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">منتجات منتهية الصلاحية</span>
                        <span className="stat-value">{expiredCount}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#fef3c7', color: '#f59e0b' }}>
                        <Calendar size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">تنتهي قريباً (7 أيام)</span>
                        <span className="stat-value">{expiringCount}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#ffedd5', color: '#ea580c' }}>
                        <TrendingUp size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">مخزون منخفض</span>
                        <span className="stat-value">{lowStockCount}</span>
                    </div>
                </div>
            </div>

            {/* Category Filter Chips */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#9ca3af' }}>الفئات:</span>
                <button
                    className={`filter-btn ${selectedCategory === null ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(null)}
                >
                    الكل ({inventory.length})
                </button>
                {inventoryCategories.map(cat => {
                    const count = inventory.filter(i => i.category_id === cat.id).length
                    return (
                        <button
                            key={cat.id}
                            className={`filter-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                            onClick={() => setSelectedCategory(cat.id)}
                            style={{
                                borderColor: selectedCategory === cat.id ? cat.color : 'transparent',
                                backgroundColor: selectedCategory === cat.id ? `${cat.color}20` : ''
                            }}
                        >
                            {cat.icon} {cat.name} ({count})
                        </button>
                    )
                })}
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="search-box">
                    <Search size={20} />
                    <input
                        type="text"
                        placeholder="بحث عن منتج..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="filter-buttons">
                    <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>الكل</button>
                    <button className={`filter-btn ${filter === 'low' ? 'active' : ''}`} onClick={() => setFilter('low')}>
                        منخفض
                        {lowStockCount > 0 && <span className="badge-dot warning"></span>}
                    </button>
                    <button className={`filter-btn ${filter === 'out' ? 'active' : ''}`} onClick={() => setFilter('out')}>نافذ</button>
                    <button className={`filter-btn ${filter === 'expiring' ? 'active' : ''}`} onClick={() => setFilter('expiring')}>
                        قرب الانتهاء
                        {expiringCount > 0 && <span className="badge-dot warning"></span>}
                    </button>
                    <button className={`filter-btn ${filter === 'expired' ? 'active' : ''}`} onClick={() => setFilter('expired')}>
                        منتهي
                        {expiredCount > 0 && <span className="badge-dot danger"></span>}
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className={`btn-icon ${viewMode === 'list' ? 'active' : ''}`}
                        onClick={() => setViewMode('list')}
                        title="عرض قائمة"
                    >
                        <List size={20} />
                    </button>
                    <button
                        className={`btn-icon ${viewMode === 'category' ? 'active' : ''}`}
                        onClick={() => setViewMode('category')}
                        title="عرض حسب الفئات"
                    >
                        <Grid3X3 size={20} />
                    </button>
                </div>
            </div>

            {/* Inventory Display */}
            {viewMode === 'list' ? (
                // List View
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>المنتج</th>
                                <th>الفئة</th>
                                <th>الكمية الكلية</th>
                                <th>متوسط التكلفة</th>
                                <th>إجمالي القيمة</th>
                                <th>الحالة</th>
                                <th>الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInventory.map(item => (
                                <Fragment key={item.id || item.product_id}>
                                    <tr className={expandedRow === item.product_id ? 'active-row' : ''} onClick={() => toggleRow(item.product_id)} style={{ cursor: 'pointer' }}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                {item.image ? (
                                                    <img src={item.image} alt="" className="w-10 h-10 rounded object-cover" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center text-gray-400">
                                                        <Package size={20} />
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="font-bold">{item.product_name}</div>
                                                    <div className="text-sm text-gray-400">{item.unit}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            {item.inventory_category_name ? (
                                                <span className="status-badge" style={{ backgroundColor: `${item.inventory_category_color}20`, color: item.inventory_category_color, borderColor: item.inventory_category_color }}>
                                                    {item.inventory_category_icon} {item.inventory_category_name}
                                                </span>
                                            ) : (
                                                <span className="text-gray-500 text-sm">غير مصنّف</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`text-lg font-bold ${item.quantity <= 0 ? 'text-red-500' : ''}`}>
                                                {item.quantity}
                                            </span>
                                        </td>
                                        <td>{(item.avg_cost || 0).toFixed(2)}</td>
                                        <td>{(item.quantity * item.avg_cost).toFixed(2)}</td>
                                        <td>
                                            <div className="flex gap-2">
                                                {item.quantity <= 0 ? (
                                                    <span className="status-badge danger">نافذ</span>
                                                ) : item.quantity <= item.min_quantity ? (
                                                    <span className="status-badge warning">منخفض</span>
                                                ) : item.expired_batches_count > 0 ? (
                                                    <span className="status-badge danger">منتهي</span>
                                                ) : item.expiring_batches_count > 0 ? (
                                                    <span className="status-badge warning">صلاحية</span>
                                                ) : (
                                                    <span className="status-badge success">مستقر</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="action-buttons" onClick={e => e.stopPropagation()}>
                                                <button className="btn-icon" onClick={() => toggleRow(item.product_id)}>
                                                    {expandedRow === item.product_id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                </button>
                                                {(hasRole('owner') || hasPermission('inventory.edit')) && (
                                                    <>
                                                        <button className="btn-icon" onClick={() => {
                                                            setAssignCategoryData({ product_id: item.product_id, category_id: item.category_id })
                                                            setShowAssignCategoryModal(true)
                                                        }} title="تعيين فئة">
                                                            <Tag size={18} />
                                                        </button>
                                                        <button className="btn-icon" onClick={() => handleUpdateQuantity(item.product_id, item.product_name, item.quantity)} title="تحديث الكمية">
                                                            <Edit2 size={18} />
                                                        </button>
                                                        <button className="btn-icon danger" onClick={() => openDeductModal(item.product_id)} title="خصم يدوي">
                                                            <Minus size={18} />
                                                        </button>
                                                        <button className="btn-icon danger" onClick={() => handleDeleteFromInventory(item.product_id, item.product_name)} title="حذف من المخزون">
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedRow === item.product_id && (
                                        <tr>
                                            <td colSpan="7" className="p-0">
                                                <div className="bg-gray-800/50 p-4 border-b border-gray-700">
                                                    <h4 className="text-sm font-bold mb-3 text-gray-300">تفاصيل الدفعات (FIFO)</h4>
                                                    {productBatches.length > 0 ? (
                                                        <table className="w-full text-sm text-left text-gray-400">
                                                            <thead className="text-xs uppercase bg-gray-700 text-gray-300">
                                                                <tr>
                                                                    <th className="px-3 py-2">تاريخ الاستلام</th>
                                                                    <th className="px-3 py-2">تاريخ الصلاحية</th>
                                                                    <th className="px-3 py-2">الكمية المتبقية</th>
                                                                    <th className="px-3 py-2">التكلفة</th>
                                                                    <th className="px-3 py-2">المورد</th>
                                                                    <th className="px-3 py-2">الحالة</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {productBatches.map(batch => {
                                                                    const isExpired = batch.expiry_date && new Date(batch.expiry_date) < new Date()
                                                                    const isExpiring = batch.expiry_date && new Date(batch.expiry_date) < new Date(Date.now() + 7 * 86400000)
                                                                    return (
                                                                        <tr key={batch.id} className="border-b border-gray-700 bg-gray-800">
                                                                            <td className="px-3 py-2">{new Date(batch.received_date).toLocaleDateString('en-GB')}</td>
                                                                            <td className="px-3 py-2 dir-ltr">
                                                                                {batch.expiry_date || '-'}
                                                                            </td>
                                                                            <td className="px-3 py-2">{batch.quantity} / {batch.original_quantity}</td>
                                                                            <td className="px-3 py-2">{batch.cost_price}</td>
                                                                            <td className="px-3 py-2" style={{ color: batch.supplier ? '#a5b4fc' : '#6b7280' }}>{batch.supplier || '-'}</td>
                                                                            <td className="px-3 py-2">
                                                                                {isExpired ? (
                                                                                    <span className="text-red-500 font-bold">منتهي</span>
                                                                                ) : isExpiring ? (
                                                                                    <span className="text-yellow-500">ينتهي قريباً</span>
                                                                                ) : (
                                                                                    <span className="text-green-500">ساري</span>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    )
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    ) : (
                                                        <p className="text-gray-500 italic">لا توجد دفعات نشطة</p>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                // Category View
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    {Object.keys(groupedByCategory).map(categoryName => {
                        const categoryData = groupedByCategory[categoryName]
                        const totalCatValue = categoryData.items.reduce((sum, item) => sum + (item.quantity * item.avg_cost), 0)

                        // نحتاج category_id من أول عنصر
                        const categoryId = categoryData.items[0]?.category_id || null

                        return (
                            <div key={categoryName} style={{ background: '#1f2937', borderRadius: '12px', padding: '20px', border: `2px solid ${categoryData.color}30` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '10px', borderBottom: `1px solid ${categoryData.color}50` }}>
                                    <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: categoryData.color }}>
                                        {categoryData.icon} {categoryName}
                                    </h3>
                                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                        <span style={{ color: '#9ca3af' }}>عدد الأصناف: <b style={{ color: '#fff' }}>{categoryData.items.length}</b></span>
                                        <span style={{ color: '#9ca3af' }}>القيمة الإجمالية: <b style={{ color: categoryData.color }}>{totalCatValue.toFixed(2)} ج.م</b></span>
                                        {hasPermission('inventory.edit') && categoryId && (
                                            <button
                                                className="btn-category-action"
                                                onClick={() => openAddProductToCategory(categoryId)}
                                            >
                                                <Plus size={16} />
                                                إضافة منتج
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="table-container" style={{ border: 'none' }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>المنتج</th>
                                                <th>الكمية</th>
                                                <th>متوسط التكلفة</th>
                                                <th>القيمة</th>
                                                <th>الحالة</th>
                                                <th>الإجراءات</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {categoryData.items.map(item => (
                                                <Fragment key={item.id || item.product_id}>
                                                    <tr className={expandedRow === item.product_id ? 'active-row' : ''}>
                                                        <td>
                                                            <div className="flex items-center gap-3">
                                                                {item.image ? (
                                                                    <img src={item.image} alt="" className="w-10 h-10 rounded object-cover" />
                                                                ) : (
                                                                    <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center text-gray-400">
                                                                        <Package size={20} />
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <div className="font-bold">{item.product_name}</div>
                                                                    <div className="text-sm text-gray-400">{item.unit}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className={`text-lg font-bold ${item.quantity <= 0 ? 'text-red-500' : ''}`}>
                                                                {item.quantity}
                                                            </span>
                                                        </td>
                                                        <td>{(item.avg_cost || 0).toFixed(2)}</td>
                                                        <td>{(item.quantity * item.avg_cost).toFixed(2)}</td>
                                                        <td>
                                                            <div className="flex gap-2">
                                                                {item.quantity <= 0 ? (
                                                                    <span className="status-badge danger">نافذ</span>
                                                                ) : item.quantity <= item.min_quantity ? (
                                                                    <span className="status-badge warning">منخفض</span>
                                                                ) : item.expired_batches_count > 0 ? (
                                                                    <span className="status-badge danger">منتهي</span>
                                                                ) : item.expiring_batches_count > 0 ? (
                                                                    <span className="status-badge warning">صلاحية</span>
                                                                ) : (
                                                                    <span className="status-badge success">مستقر</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="action-buttons">
                                                                <button className="btn-icon" onClick={() => toggleRow(item.product_id)}>
                                                                    {expandedRow === item.product_id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                                </button>
                                                                {(hasRole('owner') || hasPermission('inventory.edit')) && (
                                                                    <>
                                                                        <button className="btn-icon" onClick={() => {
                                                                            setAssignCategoryData({ product_id: item.product_id, category_id: item.category_id })
                                                                            setShowAssignCategoryModal(true)
                                                                        }} title="تعيين فئة">
                                                                            <Tag size={18} />
                                                                        </button>
                                                                        <button className="btn-icon" onClick={() => handleUpdateQuantity(item.product_id, item.product_name, item.quantity)} title="تحديث الكمية">
                                                                            <Edit2 size={18} />
                                                                        </button>
                                                                        <button className="btn-icon danger" onClick={() => openDeductModal(item.product_id)} title="خصم يدوي">
                                                                            <Minus size={18} />
                                                                        </button>
                                                                        <button className="btn-icon danger" onClick={() => handleDeleteFromInventory(item.product_id, item.product_name)} title="حذف من المخزون">
                                                                            <Trash2 size={18} />
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {expandedRow === item.product_id && (
                                                        <tr>
                                                            <td colSpan="6" className="p-0">
                                                                <div className="bg-gray-800/50 p-4 border-b border-gray-700">
                                                                    <h4 className="text-sm font-bold mb-3 text-gray-300">تفاصيل الدفعات (FIFO)</h4>
                                                                    {productBatches.length > 0 ? (
                                                                        <table className="w-full text-sm text-left text-gray-400">
                                                                            <thead className="text-xs uppercase bg-gray-700 text-gray-300">
                                                                                <tr>
                                                                                    <th className="px-3 py-2">تاريخ الاستلام</th>
                                                                                    <th className="px-3 py-2">تاريخ الصلاحية</th>
                                                                                    <th className="px-3 py-2">الكمية المتبقية</th>
                                                                                    <th className="px-3 py-2">التكلفة</th>
                                                                                    <th className="px-3 py-2">المورد</th>
                                                                                    <th className="px-3 py-2">الحالة</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {productBatches.map(batch => {
                                                                                    const isExpired = batch.expiry_date && new Date(batch.expiry_date) < new Date()
                                                                                    const isExpiring = batch.expiry_date && new Date(batch.expiry_date) < new Date(Date.now() + 7 * 86400000)
                                                                                    return (
                                                                                        <tr key={batch.id} className="border-b border-gray-700 bg-gray-800">
                                                                                            <td className="px-3 py-2">{new Date(batch.received_date).toLocaleDateString('en-GB')}</td>
                                                                                            <td className="px-3 py-2 dir-ltr">
                                                                                                {batch.expiry_date || '-'}
                                                                                            </td>
                                                                                            <td className="px-3 py-2">{batch.quantity} / {batch.original_quantity}</td>
                                                                                            <td className="px-3 py-2">{batch.cost_price}</td>
                                                                                            <td className="px-3 py-2" style={{ color: batch.supplier ? '#a5b4fc' : '#6b7280' }}>{batch.supplier || '-'}</td>
                                                                                            <td className="px-3 py-2">
                                                                                                {isExpired ? (
                                                                                                    <span className="text-red-500 font-bold">منتهي</span>
                                                                                                ) : isExpiring ? (
                                                                                                    <span className="text-yellow-500">ينتهي قريباً</span>
                                                                                                ) : (
                                                                                                    <span className="text-green-500">ساري</span>
                                                                                                )}
                                                                                            </td>
                                                                                        </tr>
                                                                                    )
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                    ) : (
                                                                        <p className="text-gray-500 italic">لا توجد دفعات نشطة</p>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )
            }

            {/* Add Batch Modal */}
            {
                showBatchModal && (
                    <div className="modal-overlay" onClick={() => setShowBatchModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>إضافة دفعة مخزون جديدة</h2>
                                <button className="modal-close" onClick={() => setShowBatchModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleAddBatch}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label>المنتج *</label>
                                        <div className="relative" style={{ position: 'relative' }}>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="ابحث عن اسم المنتج..."
                                                value={productSearch}
                                                autoFocus

                                                onChange={e => {
                                                    setProductSearch(e.target.value)
                                                    setShowProductDropdown(true)
                                                    const exactMatch = productsList.find(p => p.name === e.target.value)
                                                    if (exactMatch) {
                                                        setBatchForm({ ...batchForm, product_id: exactMatch.id, cost_price: exactMatch.cost_price || '' })
                                                    } else {
                                                        setBatchForm({ ...batchForm, product_id: '' })
                                                    }
                                                }}
                                                onFocus={() => setShowProductDropdown(true)}
                                                onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                                                required
                                            />
                                            {showProductDropdown && (
                                                <div className="absolute z-50 w-full left-0 bg-bg-secondary border border-border rounded shadow-lg max-h-60 overflow-y-auto mt-1">
                                                    {productsList
                                                        .filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
                                                        .map(p => (
                                                            <div
                                                                key={p.id}
                                                                className="p-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 flex justify-between items-center"
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault()
                                                                    setBatchForm({
                                                                        ...batchForm,
                                                                        product_id: p.id,
                                                                        cost_price: p.cost_price || ''
                                                                    })
                                                                    setProductSearch(p.name)
                                                                    setShowProductDropdown(false)
                                                                }}
                                                            >
                                                                <span className="font-bold">{p.name}</span>
                                                                {p.cost_price && <span className="text-xs text-gray-500">سعر التكلفة: {p.cost_price}</span>}
                                                            </div>
                                                        ))}
                                                    {productsList.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                                                        <div className="p-2 text-gray-500 text-center text-sm">لا يوجد منتج بهذا الاسم</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                    </div>


                                    {/* Category Selection Dropdown */}
                                    <div className="form-group" style={{ marginBottom: '15px' }}>
                                        <label>الفئة المخزنية</label>
                                        <select
                                            className="form-input"
                                            value={batchForm.category_id || ''}
                                            onChange={e => setBatchForm({ ...batchForm, category_id: e.target.value ? parseInt(e.target.value) : null })}
                                        >
                                            <option value="">-- غير مصنف --</option>
                                            {inventoryCategories.map(cat => (
                                                <option key={cat.id} value={cat.id}>
                                                    {cat.icon} {cat.name}
                                                </option>
                                            ))}
                                        </select>
                                        <small style={{ color: '#6b7280', fontSize: '12px' }}>
                                            يمكنك اختيار الفئة التي ينتمي إليها هذا المنتج
                                        </small>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>الكمية *</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={batchForm.quantity}
                                                min="0"
                                                onKeyDown={blockInvalidChar}
                                                onChange={e => setBatchForm({ ...batchForm, quantity: e.target.value })}

                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>تكلفة الوحدة *</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={batchForm.cost_price}
                                                min="0"
                                                onKeyDown={blockInvalidChar}
                                                onChange={e => setBatchForm({ ...batchForm, cost_price: e.target.value })}

                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>تاريخ الصلاحية *</label>
                                            <div className="date-input-wrapper">
                                                <Calendar size={16} className="date-input-icon" />
                                                <input
                                                    type="date"
                                                    className="form-input"
                                                    value={batchForm.expiry_date}
                                                    min={todayISO}
                                                    onChange={e => setBatchForm({ ...batchForm, expiry_date: e.target.value })}
                                                    style={{ direction: 'ltr', textAlign: 'right', paddingLeft: '36px' }}
                                                    required
                                                />
                                            </div>
                                            <small style={{ color: '#6b7280', fontSize: '12px' }}>لن يُقبل تاريخ أقدم من اليوم.</small>
                                        </div>
                                        <div className="form-group">
                                            <label>المورد</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={batchForm.supplier}
                                                onChange={e => setBatchForm({ ...batchForm, supplier: e.target.value })}
                                                style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>ملاحظات</label>
                                        <textarea
                                            className="form-input"
                                            value={batchForm.notes}
                                            onChange={e => setBatchForm({ ...batchForm, notes: e.target.value })}
                                            style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                        ></textarea>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn-secondary" onClick={() => setShowBatchModal(false)}>إلغاء</button>
                                    <button type="submit" className="btn-primary">حفظ الدفعة</button>
                                </div>
                            </form>
                        </div >
                    </div >
                )
            }

            {/* Deduct Modal */}
            {
                showDeductModal && (
                    <div className="modal-overlay" onClick={() => setShowDeductModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>خصم من المخزون (إتلاف / استهلاك)</h2>
                                <button className="modal-close" onClick={() => setShowDeductModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleDeductSubmit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label>الكمية المراد خصمها *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={deductData.quantity}
                                            onChange={e => setDeductData({ ...deductData, quantity: e.target.value })}
                                            onKeyDown={blockInvalidChar}
                                            required
                                            min="0"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">سيتم الخصم حسب نظام FIFO (الأقدم فالأحدث)</p>
                                    </div>
                                    <div className="form-group">
                                        <label>سبب الخصم</label>
                                        <select
                                            className="form-input"
                                            value={deductData.reason}
                                            onChange={e => setDeductData({ ...deductData, reason: e.target.value })}
                                        >
                                            <option value="تالف / منتهي الصلاحية">تالف / منتهي الصلاحية</option>
                                            <option value="استهلاك شخصي / ضيافة">استهلاك شخصي / ضيافة</option>
                                            <option value="عجز جرد">عجز جرد</option>
                                            <option value="أخرى">أخرى</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn-secondary" onClick={() => setShowDeductModal(false)}>إلغاء</button>
                                    <button type="submit" className="btn-primary btn-error">تأكيد الخصم</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Update Quantity Modal */}
            {
                showUpdateQuantityModal && (
                    <div className="modal-overlay" onClick={() => setShowUpdateQuantityModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>تحديث الكمية</h2>
                                <button className="modal-close" onClick={() => setShowUpdateQuantityModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleUpdateQuantitySubmit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label>المنتج</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={updateQuantityData.product_name}
                                            disabled
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>الكمية الحالية</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={updateQuantityData.current_quantity}
                                            disabled
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>الكمية الجديدة *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={updateQuantityData.new_quantity}
                                            onChange={e => setUpdateQuantityData({ ...updateQuantityData, new_quantity: e.target.value })}
                                            onKeyDown={blockInvalidChar}
                                            required
                                            min="0"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn-secondary" onClick={() => setShowUpdateQuantityModal(false)}>إلغاء</button>
                                    <button type="submit" className="btn-primary">تحديث</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Assign Category Modal */}
            {
                showAssignCategoryModal && (
                    <div className="modal-overlay" onClick={() => setShowAssignCategoryModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>تعيين فئة مخزنية</h2>
                                <button className="modal-close" onClick={() => setShowAssignCategoryModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleAssignCategory}>
                                <div className="modal-body">
                                    <div className="form-group">


                                        <label>اختر الفئة *</label>
                                        <select
                                            className="form-input"
                                            value={assignCategoryData.category_id || ''}
                                            onChange={e => setAssignCategoryData({ ...assignCategoryData, category_id: parseInt(e.target.value) })}
                                            required
                                            style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                        >
                                            <option value="">-- اختر فئة --</option>
                                            {inventoryCategories.map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn-secondary" onClick={() => setShowAssignCategoryModal(false)}>إلغاء</button>
                                    <button type="submit" className="btn-primary">حفظ</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Create Category Modal */}
            {showCategoryModal && (
                <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{isEditingCategory ? 'تعديل فئة مخزنية' : 'إضافة فئة مخزنية جديدة'}</h2>
                            <button className="modal-close" onClick={() => setShowCategoryModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleCreateOrUpdateCategory}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>اسم الفئة *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={categoryForm.name}
                                        onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                                        style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                        placeholder="مثال: مجمدات"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>الوصف</label>
                                    <textarea
                                        className="form-input"
                                        value={categoryForm.description}
                                        onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })}
                                        style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                        placeholder="وصف مختصر للفئة"
                                    ></textarea>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>الأيقونة</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={categoryForm.icon}
                                            onChange={e => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                                            style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                            placeholder="❄️"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>اللون</label>
                                        <input
                                            type="color"
                                            className="form-input"
                                            value={categoryForm.color}
                                            onChange={e => setCategoryForm({ ...categoryForm, color: e.target.value })}
                                            style={{ height: '50px' }}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>ترتيب العرض</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={categoryForm.sort_order}
                                        onChange={e => setCategoryForm({ ...categoryForm, sort_order: parseInt(e.target.value) })}
                                        style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                        min="0"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setShowCategoryModal(false)}>إلغاء</button>
                                <button type="submit" className="btn-primary">{isEditingCategory ? 'تحديث الفئة' : 'حفظ الفئة'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )
            }

            {/* Category Management Modal */}
            {
                showCategoryManagementModal && (
                    <div className="modal-overlay" onClick={() => setShowCategoryManagementModal(false)}>
                        <div className="modal" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>إدارة الفئات المخزنية</h2>
                                <button className="modal-close" onClick={() => setShowCategoryManagementModal(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                {inventoryCategories.length > 0 ? (
                                    <div style={{ display: 'grid', gap: '15px' }}>
                                        {inventoryCategories.map(cat => (
                                            <div
                                                key={cat.id}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '15px',
                                                    background: '#1f2937',
                                                    borderRadius: '8px',
                                                    border: `2px solid ${cat.color}30`
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                    <span style={{ fontSize: '24px' }}>{cat.icon}</span>
                                                    <div>
                                                        <h4 style={{ color: cat.color, marginBottom: '5px' }}>{cat.name}</h4>
                                                        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>{cat.description || 'لا يوجد وصف'}</p>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {hasPermission('inventory.edit') && (
                                                        <>
                                                            <button
                                                                className="btn-icon"
                                                                onClick={() => openEditCategoryModal(cat)}
                                                                title="تعديل"
                                                            >
                                                                <Edit2 size={18} />
                                                            </button>
                                                            <button
                                                                className="btn-icon danger"
                                                                onClick={() => handleDeleteCategory(cat.id)}
                                                                title="حذف"
                                                            >
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0' }}>
                                        لا توجد فئات مخزنية. اضغط "إضافة فئة" لإنشاء فئة جديدة.
                                    </p>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn-secondary" onClick={() => setShowCategoryManagementModal(false)}>إغلاق</button>
                                <button className="btn-primary" onClick={() => {
                                    setShowCategoryManagementModal(false)
                                    openNewCategoryModal()
                                }}>
                                    <Plus size={18} />
                                    إضافة فئة جديدة
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
