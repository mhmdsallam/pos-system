import { useState, useEffect, useRef } from 'react'
import { Plus, Edit2, Trash2, Tag, Package, TrendingUp, Calendar, ToggleLeft, ToggleRight, Image as ImageIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { showToast, useEscapeClose } from '../hooks/usePerformance'
import { API_BASE_URL } from '../config'
import './Combos.css'

export default function Combos() {
    const { token, hasPermission } = useAuth()
    const [combos, setCombos] = useState([])
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingCombo, setEditingCombo] = useState(null)
    const [imagePreview, setImagePreview] = useState(null)
    const deleteConfirmRef = useRef(null)
    const BASE_URL = API_BASE_URL || 'http://localhost:3001'

    useEscapeClose(setShowModal)

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        original_price: '',
        discount_percentage: '',
        start_date: '',
        end_date: '',
        is_active: true,
        items: [],
        image: null
    })

    useEffect(() => {
        if (token) {
            fetchCombos()
            fetchProducts()
        }
    }, [token])

    const fetchCombos = async () => {
        try {
            const res = await fetch('/api/combos', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setCombos(Array.isArray(data) ? data : [])
        } catch (e) {
            console.error(e)
            setCombos([])
        } finally {
            setLoading(false)
        }
    }

    const fetchProducts = async () => {
        try {
            const res = await fetch('/api/products', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setProducts(Array.isArray(data) ? data : [])
        } catch (e) {
            console.error(e)
            setProducts([])
        }
    }

    const handleImageChange = (e) => {
        const file = e.target.files[0]
        if (file) {
            setFormData({ ...formData, image: file })
            const reader = new FileReader()
            reader.onloadend = () => {
                setImagePreview(reader.result)
            }
            reader.readAsDataURL(file)
        }
    }

    const handleSubmit = (e) => {
        e.preventDefault()

        if (!formData.name || !formData.price || formData.items.length === 0) {
            showToast('يرجى ملء جميع الحقول المطلوبة وإضافة منتجات للعرض', 'warning')
            return
        }

        const payload = new FormData()
        payload.append('name', formData.name)
        payload.append('description', formData.description)
        payload.append('price', formData.price)
        payload.append('original_price', formData.original_price || formData.price)

        // Calculate discount if not provided
        let discount = formData.discount_percentage
        if (!discount && formData.original_price && formData.price) {
            discount = ((parseFloat(formData.original_price) - parseFloat(formData.price)) / parseFloat(formData.original_price)) * 100
        }
        payload.append('discount_percentage', discount || 0)

        payload.append('start_date', formData.start_date || '')
        payload.append('end_date', formData.end_date || '')
        payload.append('is_active', formData.is_active ? 1 : 0)
        payload.append('items', JSON.stringify(formData.items))

        if (formData.image instanceof File) {
            payload.append('image', formData.image)
        } else if (typeof formData.image === 'string') {
            payload.append('existing_image', formData.image)
        }

        const url = editingCombo ? `/api/combos/${editingCombo.id}` : '/api/combos'
        const method = editingCombo ? 'PUT' : 'POST'

        fetch(url, {
            method,
            headers: { 'Authorization': `Bearer ${token}` },
            body: payload
        }).then(async (res) => {
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'حدث خطأ')
            }
            showToast(editingCombo ? 'تم تحديث العرض بنجاح' : 'تم إضافة العرض بنجاح', 'success')
            closeModal()
            fetchCombos()
        }).catch((e) => {
            console.error(e)
            showToast(e.message || 'خطأ في الاتصال', 'error')
        })
    }

    const handleDelete = (id) => {
        if (deleteConfirmRef.current !== id) {
            deleteConfirmRef.current = id
            showToast('اضغط حذف مرة أخرى خلال 5 ثوان للتأكيد', 'warning')
            setTimeout(() => {
                if (deleteConfirmRef.current === id) deleteConfirmRef.current = null
            }, 5000)
            return
        }
        deleteConfirmRef.current = null
        fetch(`/api/combos/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).then((res) => {
            if (!res.ok) throw new Error('حدث خطأ أثناء الحذف')
            showToast('تم حذف العرض', 'success')
            fetchCombos()
        }).catch((e) => {
            console.error(e)
            showToast(e.message || 'خطأ في الاتصال', 'error')
        })
    }

    const toggleActive = async (combo) => {
        try {
            const res = await fetch(`/api/combos/${combo.id}/toggle`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ is_active: combo.is_active ? 0 : 1 })
            })

            if (res.ok) {
                fetchCombos()
            }
        } catch (e) {
            console.error(e)
        }
    }

    const openModal = (combo = null) => {
        if (combo) {
            setEditingCombo(combo)
            setFormData({
                name: combo.name,
                description: combo.description || '',
                price: combo.price,
                original_price: combo.original_price || combo.price,
                discount_percentage: combo.discount_percentage || '',
                start_date: combo.start_date ? combo.start_date.split('T')[0] : '',
                end_date: combo.end_date ? combo.end_date.split('T')[0] : '',
                is_active: combo.is_active === 1,
                items: combo.items || [],
                image: combo.image
            })
            setImagePreview(combo.image ? `${BASE_URL}${combo.image}` : null)
        } else {
            setEditingCombo(null)
            setFormData({
                name: '',
                description: '',
                price: '',
                original_price: '',
                discount_percentage: '',
                start_date: '',
                end_date: '',
                is_active: true,
                items: [],
                image: null
            })
            setImagePreview(null)
        }
        setShowModal(true)
    }

    const closeModal = () => {
        setShowModal(false)
        setEditingCombo(null)
        setImagePreview(null)
    }

    const addProductToCombo = (product) => {
        const exists = formData.items.find(i => i.product_id === product.id)
        if (exists) {
            setFormData({
                ...formData,
                items: formData.items.map(i =>
                    i.product_id === product.id
                        ? { ...i, quantity: i.quantity + 1 }
                        : i
                )
            })
        } else {
            setFormData({
                ...formData,
                items: [...formData.items, { product_id: product.id, product_name: product.name, quantity: 1 }]
            })
        }
    }

    const removeProductFromCombo = (product_id) => {
        setFormData({
            ...formData,
            items: formData.items.filter(i => i.product_id !== product_id)
        })
    }

    const updateItemQuantity = (product_id, delta) => {
        setFormData({
            ...formData,
            items: formData.items.map(i => {
                if (i.product_id === product_id) {
                    const newQty = i.quantity + delta
                    return newQty > 0 ? { ...i, quantity: newQty } : i
                }
                return i
            }).filter(i => i.quantity > 0)
        })
    }

    return (
        <div className="products-container">
            <div className="products-header">
                <div className="header-title">
                    <Tag size={28} />
                    <h1>إدارة العروض</h1>
                </div>
                {hasPermission('offers.add') && (
                    <button className="btn-primary" onClick={() => openModal()}>
                        <Plus size={20} />
                        عرض جديد
                    </button>
                )}
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#dbeafe' }}>
                        <Package size={24} style={{ color: '#3b82f6' }} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">إجمالي العروض</span>
                        <span className="stat-value">{combos.length}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#dcfce7' }}>
                        <ToggleRight size={24} style={{ color: '#10b981' }} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">العروض النشطة</span>
                        <span className="stat-value">{combos.filter(c => c.is_active).length}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#fef3c7' }}>
                        <TrendingUp size={24} style={{ color: '#f59e0b' }} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">متوسط الخصم</span>
                        <span className="stat-value">
                            {combos.length > 0
                                ? (combos.reduce((sum, c) => sum + (c.discount_percentage || 0), 0) / combos.length).toFixed(0)
                                : 0}%
                        </span>
                    </div>
                </div>
            </div>

            {loading ? (
                <p className="text-center p-4">جاري التحميل...</p>
            ) : (
                <div className="products-grid">
                    {combos.map(combo => (
                        <div key={combo.id} className="product-card-full">
                            {combo.image && (
                                <div className="h-40 w-full overflow-hidden rounded-t-lg border-b border-border mb-3">
                                    <img
                                        src={`http://localhost:3001${combo.image}`}
                                        alt={combo.name}
                                        className="w-full h-full object-cover"
                                        onError={(e) => { e.target.style.display = 'none' }}
                                    />
                                </div>
                            )}
                            <div className="card-header">
                                <h3>{combo.name}</h3>
                                <div className="card-actions">
                                    {hasPermission('offers.edit') && (
                                        <button
                                            className={`btn-icon ${combo.is_active ? 'active' : ''}`}
                                            onClick={() => toggleActive(combo)}
                                            title={combo.is_active ? 'إيقاف' : 'تفعيل'}
                                        >
                                            {combo.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                        </button>
                                    )}
                                    {hasPermission('offers.edit') && (
                                        <button className="btn-icon" onClick={() => openModal(combo)}>
                                            <Edit2 size={18} />
                                        </button>
                                    )}
                                    {hasPermission('offers.delete') && (
                                        <button className="btn-icon danger" onClick={() => handleDelete(combo.id)}>
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <p className="card-description">{combo.description}</p>

                            <div className="combo-items">
                                <strong>المنتجات:</strong>
                                <ul>
                                    {combo.items?.map((item, idx) => (
                                        <li key={idx}>{item.product_name} × {item.quantity}</li>
                                    ))}
                                </ul>
                            </div>

                            <div className="price-info">
                                {combo.original_price > combo.price && (
                                    <span className="original-price">{combo.original_price} ج.م</span>
                                )}
                                <span className="current-price">{combo.price} ج.م</span>
                                {combo.discount_percentage > 0 && (
                                    <span className="discount-badge">خصم {combo.discount_percentage.toFixed(0)}%</span>
                                )}
                            </div>

                            {(combo.start_date || combo.end_date) && (
                                <div className="date-range">
                                    <Calendar size={16} />
                                    <span>
                                        {combo.start_date && new Date(combo.start_date).toLocaleDateString('en-GB')}
                                        {combo.start_date && combo.end_date && ' - '}
                                        {combo.end_date && new Date(combo.end_date).toLocaleDateString('en-GB')}
                                    </span>
                                </div>
                            )}

                            <div className={`status-badge ${combo.is_active ? 'active' : 'inactive'}`}>
                                {combo.is_active ? 'نشط' : 'متوقف'}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingCombo ? 'تعديل عرض' : 'عرض جديد'}</h2>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row" style={{ alignItems: 'flex-start' }}>
                                    {/* Image Upload */}
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="block text-sm font-bold mb-2">صورة العرض</label>
                                        <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:bg-bg-secondary cursor-pointer relative h-32 flex items-center justify-center overflow-hidden"
                                            onClick={() => document.getElementById('comboImageInput').click()}>
                                            {imagePreview ? (
                                                <img
                                                    src={imagePreview}
                                                    className="w-full h-full object-cover"
                                                    alt="Preview"
                                                />
                                            ) : (
                                                <div className="text-secondary">
                                                    <ImageIcon className="mx-auto mb-1" />
                                                    <span>اضغط لرفع صورة</span>
                                                </div>
                                            )}
                                            <input
                                                id="comboImageInput"
                                                type="file"
                                                accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.tiff,.ico"
                                                className="hidden"
                                                onChange={handleImageChange}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ flex: 2 }}>
                                        <div className="form-group">
                                            <label>اسم العرض *</label>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                autoFocus
                                                required
                                            />
                                        </div>
                                        <div className="form-group mt-2">
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.is_active}
                                                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                                />
                                                {' '}نشط
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>الوصف</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        rows="2"
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>السعر الأصلي (ج.م)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.original_price}
                                            onChange={e => setFormData({ ...formData, original_price: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>سعر العرض (ج.م) *</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>نسبة الخصم (%)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.discount_percentage}
                                            onChange={e => setFormData({ ...formData, discount_percentage: e.target.value })}
                                            disabled
                                            placeholder="يُحسب تلقائياً"
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>تاريخ البداية</label>
                                        <input
                                            type="date"
                                            value={formData.start_date}
                                            onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>تاريخ النهاية</label>
                                        <input
                                            type="date"
                                            value={formData.end_date}
                                            onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <hr style={{ margin: '20px 0' }} />

                                <h3>المنتجات في العرض *</h3>

                                {formData.items.length > 0 && (
                                    <div className="selected-products">
                                        {formData.items.map(item => (
                                            <div key={item.product_id} className="selected-item">
                                                <span>{item.product_name}</span>
                                                <div className="qty-controls">
                                                    <button type="button" onClick={() => updateItemQuantity(item.product_id, -1)}>-</button>
                                                    <span>{item.quantity}</span>
                                                    <button type="button" onClick={() => updateItemQuantity(item.product_id, 1)}>+</button>
                                                    <button type="button" className="btn-remove" onClick={() => removeProductFromCombo(item.product_id)}>×</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="products-selector">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4>إضافة منتجات:</h4>
                                        <input
                                            type="text"
                                            placeholder="بحث..."
                                            className="input-field py-1 px-2 text-sm w-32"
                                            onChange={(e) => {
                                                const term = e.target.value.toLowerCase();
                                                const container = document.querySelector('.products-list-compact');
                                                if (container) {
                                                    const buttons = container.querySelectorAll('button');
                                                    buttons.forEach(btn => {
                                                        if (btn.textContent.toLowerCase().includes(term)) {
                                                            btn.style.display = 'flex';
                                                        } else {
                                                            btn.style.display = 'none';
                                                        }
                                                    });
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="products-list-compact">
                                        {products.map(product => (
                                            <button
                                                key={product.id}
                                                type="button"
                                                className="product-chip"
                                                onClick={() => addProductToCombo(product)}
                                            >
                                                <Plus size={14} />
                                                {product.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={closeModal}>
                                    إلغاء
                                </button>
                                <button type="submit" className="btn-primary">
                                    {editingCombo ? 'تحديث' : 'إضافة'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
