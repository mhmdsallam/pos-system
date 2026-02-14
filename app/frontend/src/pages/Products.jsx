import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Plus, Search, Edit, Trash2, Eye, X, Check, Boxes, Image as ImageIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { showToast, useEscapeClose } from '../hooks/usePerformance'
import { API_BASE_URL } from '../config'
import './Products.css'

export default function Products() {
    const { token, hasRole, hasPermission } = useAuth()
    const [products, setProducts] = useState([])
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [showModal, setShowModal] = useState(false)
    const [statusFilter, setStatusFilter] = useState('available')
    const [editingProduct, setEditingProduct] = useState(null)
    const mountedRef = useRef(true)
    const deleteConfirmRef = useRef(null)
    const BASE_URL = API_BASE_URL || ''

    useEffect(() => {
        mountedRef.current = true
        return () => { mountedRef.current = false }
    }, [])

    // ESC to close modals
    useEscapeClose(setShowModal);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        cost_price: '',
        category_id: '',
        available: true,
        allow_spicy: false,
        has_variations: false,
        variations: [],
        image: null // File object or URL string
    })

    // Image Preview
    const [imagePreview, setImagePreview] = useState(null)

    // Variation Input State
    const [variationInput, setVariationInput] = useState({ name: '', price: '', cost_price: '' })

    const [error, setError] = useState(null)

    const fetchData = useCallback(() => {
        if (!token) {
            setLoading(false)
            return
        }
        setError(null)
        const headers = { 'Authorization': `Bearer ${token}` }
        Promise.all([
            fetch('/api/products', { headers }),
            fetch('/api/categories', { headers })
        ]).then(async ([productsRes, categoriesRes]) => {
            if (!productsRes.ok) throw new Error('فشل تحميل المنتجات')
            if (!categoriesRes.ok) throw new Error('فشل تحميل الفئات')

            const [productsData, categoriesData] = await Promise.all([
                productsRes.json(),
                categoriesRes.json()
            ])

            if (!mountedRef.current) return
            setProducts(productsData || [])
            setCategories(categoriesData || [])
        }).catch((error) => {
            console.error('Error fetching data:', error)
            if (mountedRef.current) setError(error.message)
        }).finally(() => {
            if (mountedRef.current) setLoading(false)
        })
    }, [token])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const openModal = (product = null) => {
        if (product) {
            setEditingProduct(product)
            setFormData({
                name: product.name,
                description: product.description || '',
                price: product.price?.toString() || '',
                cost_price: product.cost_price ? product.cost_price.toString() : '',
                category_id: product.category_id?.toString() || '',
                available: product.available === 1,
                allow_spicy: product.allow_spicy === 1,
                has_variations: product.has_variations === 1,
                variations: product.variations || [],
                image: product.image,
                custom_options: product.custom_options || ''
            })
            const serverUrl = BASE_URL || 'http://localhost:3001'
            setImagePreview(product.image ? `${serverUrl}${product.image}` : null)
        } else {
            setEditingProduct(null)
            setFormData({
                name: '',
                description: '',
                price: '',
                cost_price: '',
                category_id: categories[0]?.id?.toString() || '',
                available: true,
                allow_spicy: false,
                has_variations: false,
                variations: [],
                image: null,
                custom_options: ''
            })
            setImagePreview(null)
        }
        setVariationInput({ name: '', price: '', cost_price: '' })
        setShowModal(true)
    }

    const blockInvalidChar = e => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault();

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

    const closeModal = () => {
        setShowModal(false)
        setEditingProduct(null)
        setImagePreview(null)
    }

    const handleAddVariation = () => {
        if (!variationInput.name || !variationInput.price) {
            showToast('الرجاء إدخال اسم وسعر للحجم/الخيار', 'warning')
            return
        }
        setFormData({
            ...formData,
            variations: [...formData.variations, { ...variationInput, id: Date.now() }]
        })
        setVariationInput({ name: '', price: '', cost_price: '' })
    }

    const removeVariation = (id) => {
        setFormData({
            ...formData,
            variations: formData.variations.filter(v => v.id !== id)
        })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        // Validate required fields
        if (!formData.name || !formData.name.trim()) {
            showToast('الرجاء إدخال اسم المنتج', 'warning');
            return;
        }
        if (!formData.category_id) {
            showToast('الرجاء اختيار فئة للمنتج', 'warning');
            return;
        }
        if (!formData.has_variations && (!formData.price || parseFloat(formData.price) <= 0)) {
            showToast('الرجاء إدخال سعر صحيح للمنتج', 'warning');
            return;
        }

        const data = new FormData()
        data.append('name', formData.name)
        data.append('description', formData.description)
        data.append('price', parseFloat(formData.price) || 0)
        data.append('cost_price', formData.cost_price ? parseFloat(formData.cost_price) : 0)
        data.append('category_id', formData.category_id)
        data.append('available', formData.available ? 1 : 0)
        data.append('allow_spicy', formData.allow_spicy ? 1 : 0)
        data.append('custom_options', formData.custom_options || '')
        data.append('branch_id', 1)
        // Need to stringify variations
        data.append('variations', JSON.stringify(formData.variations))

        if (formData.image instanceof File) {
            data.append('image', formData.image)
        } else if (typeof formData.image === 'string') {
            data.append('existing_image', formData.image)
        }

        const url = editingProduct
            ? `/api/products/${editingProduct.id}`
            : '/api/products'
        const method = editingProduct ? 'PUT' : 'POST'

        const optimisticProduct = {
            id: editingProduct?.id || Date.now(),
            name: formData.name,
            description: formData.description,
            price: parseFloat(formData.price) || 0,
            cost_price: formData.cost_price ? parseFloat(formData.cost_price) : 0,
            category_id: parseInt(formData.category_id, 10),
            available: formData.available ? 1 : 0,
            allow_spicy: formData.allow_spicy ? 1 : 0,
            has_variations: formData.has_variations ? 1 : 0,
            variations: formData.variations,
            image: formData.image instanceof File ? null : formData.image,
            category_name: categories.find(c => c.id === parseInt(formData.category_id, 10))?.name || 'بدون فئة',
            category_color: categories.find(c => c.id === parseInt(formData.category_id, 10))?.color,
            custom_options: formData.custom_options || ''
        }

        setProducts(prev => {
            if (editingProduct) {
                return prev.map(p => p.id === editingProduct.id ? { ...p, ...optimisticProduct } : p)
            }
            return [optimisticProduct, ...prev]
        })

        setTimeout(() => {
            fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${token}` },
                body: data
            })
                .then(async (response) => {
                    if (!response.ok) {
                        const error = await response.json()
                        throw new Error(error.error || 'حدث خطأ')
                    }
                    const result = await response.json()
                    if (!mountedRef.current) return
                    showToast('تم حفظ المنتج بنجاح!', 'success')
                    // Refresh from server to sync image path and variations ids
                    fetchData()
                    closeModal()
                })
                .catch((error) => {
                    console.error('Error saving product:', error)
                    if (!mountedRef.current) return
                    showToast(error.message || 'حدث خطأ في الحفظ', 'error')
                    // rollback optimistic insert/update
                    fetchData()
                })
        }, 0)
    }

    const toggleAvailability = (product) => {
        const nextAvailability = product.available ? 0 : 1
        const prevProducts = [...products]
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, available: nextAvailability } : p))

        setTimeout(() => {
            fetch(`/api/products/${product.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...product,
                    available: nextAvailability,
                    existing_image: product.image
                })
            }).then(res => {
                if (!res.ok) throw new Error('تعذر تحديث حالة المنتج')
            }).catch(err => {
                console.error('Error toggling availability:', err)
                if (!mountedRef.current) return
                showToast('فشل تحديث حالة المنتج، تم التراجع', 'error')
                setProducts(prevProducts)
            })
        }, 0)
    }

    const deleteProduct = (productId) => {
        if (deleteConfirmRef.current !== productId) {
            deleteConfirmRef.current = productId
            showToast('اضغط حذف مرة أخرى خلال 5 ثوان للتأكيد', 'warning')
            setTimeout(() => {
                if (deleteConfirmRef.current === productId) {
                    deleteConfirmRef.current = null
                }
            }, 5000)
            return
        }

        deleteConfirmRef.current = null
        const prevProducts = products
        setProducts(prev => prev.filter(p => p.id !== productId))

        setTimeout(() => {
            fetch(`/api/products/${productId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(async (response) => {
                if (response.ok) {
                    showToast('تم حذف المنتج', 'success')
                    return
                }
                const errorData = await response.json()
                if (errorData?.orderCount > 0) {
                    showToast('المنتج مرتبط بطلبات سابقة، قم بإخفائه بدلاً من الحذف', 'error')
                } else {
                    showToast(errorData.error || 'حدث خطأ أثناء حذف المنتج', 'error')
                }
                if (mountedRef.current) setProducts(prevProducts)
            }).catch((error) => {
                console.error('Error deleting product:', error)
                if (mountedRef.current) {
                    showToast('حدث خطأ أثناء حذف المنتج', 'error')
                    setProducts(prevProducts)
                }
            })
        }, 0)
    }

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ar-EG', {
            style: 'currency',
            currency: 'EGP'
        }).format(amount)
    }

    const filteredProducts = useMemo(() => products.filter(product => {
        const matchesSearch = !searchTerm || product.name.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesCategory = selectedCategory === 'all' || product.category_id === parseInt(selectedCategory)
        const matchesStatus = statusFilter === 'all'
            ? true
            : statusFilter === 'available' ? product.available : !product.available
        return matchesSearch && matchesCategory && matchesStatus
    }), [products, searchTerm, selectedCategory, statusFilter])

    const categoryColors = useMemo(() => {
        const colors = {}
        categories.forEach(cat => { colors[cat.id] = cat.color })
        return colors
    }, [categories])

    if (loading && products.length === 0) {
        return (
            <div className="p-10 text-center">
                <div className="spinner-large mx-auto mb-4"></div>
                <h3>جاري تحميل المنتجات...</h3>
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-10 text-center text-error">
                <h3>حدث خطأ!</h3>
                <p>{error}</p>
                <button onClick={fetchData} className="btn btn-primary mt-4">إعادة المحاولة</button>
            </div>
        )
    }

    return (
        <div className="products-page">
            <div className="page-header">
                <div>
                    <h1>المنتجات</h1>
                    <p className="text-secondary">إدارة المنتجات وقائمة الطعام</p>
                </div>
                {hasPermission('products.add') && (
                    <button className="btn btn-primary" onClick={() => openModal()}>
                        <Plus size={20} />
                        إضافة منتج
                    </button>
                )}
            </div>

            <div className="filters-bar">
                <div className="search-box">
                    <Search size={20} className="text-muted" />
                    <input
                        type="text"
                        placeholder="بحث عن منتج..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
                <select
                    className="category-select"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                >
                    <option value="all">جميع الفئات</option>
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>
                            {cat.icon} {cat.name}
                        </option>
                    ))}
                </select>
                <select
                    className="category-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="all">جميع الحالات</option>
                    <option value="available">متاح</option>
                    <option value="unavailable">غير متاح</option>
                </select>
            </div>

            <div className="products-grid">
                {filteredProducts.length === 0 ? (
                    <div className="empty-state">
                        <h3>لا توجد منتجات</h3>
                        <p className="text-secondary">لم يتم العثور على منتجات</p>
                    </div>
                ) : (
                    filteredProducts.map(product => (
                        <div key={product.id} className={`product-card ${product.available ? '' : 'unavailable'}`}>
                            {(() => {
                                const imageSrc = product.image ? `${BASE_URL || 'http://localhost:3001'}${product.image}` : null
                                if (!imageSrc) {
                                    return (
                                        <div className="h-32 w-full flex items-center justify-center border-b border-border bg-gray-100 text-gray-400 text-sm">
                                            لا توجد صورة
                                        </div>
                                    )
                                }
                                return (
                                    <div className="h-32 w-full overflow-hidden border-b border-border">
                                        <img
                                            src={imageSrc}
                                            alt={product.name}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = 'https://placehold.co/400x300?text=No+Image';
                                            }}
                                        />
                                    </div>
                                )
                            })()}
                            <div className="product-header">
                                <span
                                    className="category-badge"
                                    style={{ backgroundColor: `${categoryColors[product.category_id]}20`, color: categoryColors[product.category_id] }}
                                >
                                    {product.category_name || 'بدون فئة'}
                                </span>
                                {hasPermission('products.edit') && (
                                    <div
                                        className={`toggle-switch ${product.available ? 'active' : ''}`}
                                        onClick={() => toggleAvailability(product)}
                                        title={product.available ? 'متاح - اضغط لإخفاء' : 'غير متاح - اضغط لإظهار'}
                                    >
                                        <div className="toggle-slider"></div>
                                    </div>
                                )}
                            </div>
                            <div className="product-body">
                                <h3>{product.name}</h3>
                                {product.has_variations === 1 && (
                                    <div className="text-xs text-accent mt-2 flex items-center gap-1">
                                        <Boxes size={14} />
                                        <span>متوفر بأحجام</span>
                                    </div>
                                )}
                            </div>
                            <div className="product-footer">
                                <span className="selling-price">
                                    {formatCurrency(product.price)}
                                    {product.has_variations === 1 ? '+' : ''}
                                </span>
                                <div className="product-actions">
                                    {hasPermission('products.edit') && (
                                        <button className="btn-icon" onClick={() => openModal(product)} title="تعديل">
                                            <Edit size={16} />
                                        </button>
                                    )}
                                    {hasPermission('products.delete') && (
                                        <button className="btn-icon btn-error" onClick={() => deleteProduct(product.id)} title="حذف">
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Product Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h2>
                            <button className="modal-close" onClick={closeModal}>
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Left Column: Image */}
                                    <div className="col-span-1">
                                        <label className="block text-sm font-bold mb-2">صورة المنتج</label>
                                        <div className="border-dashed rounded-lg p-4 text-center w-full cursor-pointer relative h-40 flex items-center justify-center overflow-hidden"
                                            onClick={() => document.getElementById('imageInput').click()}>
                                            {imagePreview ? (
                                                <img
                                                    src={imagePreview}
                                                    className="w-full h-full object-cover"
                                                    alt="Preview"
                                                    onError={(e) => e.target.style.display = 'none'}
                                                />
                                            ) : (
                                                <div className="text-secondary">
                                                    <ImageIcon className="mx-auto mb-1" />
                                                    <span>اضغط لرفع صورة</span>
                                                </div>
                                            )}
                                            <input
                                                id="imageInput"
                                                type="file"
                                                accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.tiff,.ico"
                                                className="hidden"
                                                onChange={handleImageChange}
                                            />
                                        </div>
                                    </div>

                                    {/* Right Column: Basic Info */}
                                    <div className="col-span-1 space-y-3">
                                        <div>
                                            <label>اسم المنتج *</label>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="form-input"
                                                required
                                                autoFocus
                                            />
                                        </div>
                                        <div>
                                            <label>الفئة *</label>
                                            <select
                                                value={formData.category_id}
                                                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                                                className="form-input"
                                                required
                                            >
                                                <option value="">اختر فئة</option>
                                                {categories.map(cat => (
                                                    <option key={cat.id} value={cat.id}>
                                                        {cat.icon} {cat.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-group mt-3">
                                    <label>الوصف</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        className="form-input"
                                        rows="2"
                                    />
                                </div>

                                <div className="form-divider"></div>

                                <div className="form-group checkbox-group mb-4">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={formData.has_variations}
                                            onChange={(e) => setFormData({ ...formData, has_variations: e.target.checked })}
                                            className="w-5 h-5 accent-accent"
                                        />
                                        <span className="font-bold">يوجد أحجام/خيارات مختلفة</span>
                                    </label>
                                </div>

                                {/* Base Price (Only if NO variations) */}
                                {!formData.has_variations && (
                                    <div className="form-row animate-fade-in">
                                        <div className="form-group">
                                            <label>سعر البيع *</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                onKeyDown={blockInvalidChar}
                                                value={formData.price}
                                                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                                className="form-input"
                                                required={!formData.has_variations}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>سعر التكلفة</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                onKeyDown={blockInvalidChar}
                                                value={formData.cost_price}
                                                onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                                                className="form-input"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Variations Builder */}
                                {formData.has_variations && (
                                    <div className="bg-bg-secondary p-4 rounded-lg border border-border animate-fade-in mb-4">
                                        <h4 className="font-bold mb-3 flex items-center gap-2">
                                            <Boxes size={18} />
                                            إدارة الأحجام
                                        </h4>
                                        <div className="grid grid-cols-12 gap-2 mb-3 items-end">
                                            <div className="col-span-5">
                                                <input className="form-input w-full" placeholder="الاسم (صغير, وسط...)" value={variationInput.name} onChange={e => setVariationInput({ ...variationInput, name: e.target.value })} />
                                            </div>
                                            <div className="col-span-3">
                                                <input type="number" min="0" onKeyDown={blockInvalidChar} className="form-input w-full" placeholder="السعر" value={variationInput.price} onChange={e => setVariationInput({ ...variationInput, price: e.target.value })} />
                                            </div>
                                            <div className="col-span-3">
                                                <input type="number" min="0" onKeyDown={blockInvalidChar} className="form-input w-full" placeholder="التكلفة" value={variationInput.cost_price} onChange={e => setVariationInput({ ...variationInput, cost_price: e.target.value })} />
                                            </div>
                                            <div className="col-span-1">
                                                <button type="button" className="btn btn-primary w-full p-2 h-[42px] flex items-center justify-center" onClick={handleAddVariation}><Plus size={18} /></button>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
                                            {formData.variations.map((v, idx) => (
                                                <div key={idx} className="flex justify-between items-center bg-bg-primary p-2 rounded border border-border text-sm">
                                                    <div><span className="font-bold">{v.name}</span> ({v.price}ج)</div>
                                                    <button type="button" className="text-error" onClick={() => removeVariation(v.id)}><Trash2 size={16} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="form-group checkbox-group mt-2">
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={formData.available}
                                            onChange={(e) => setFormData({ ...formData, available: e.target.checked })}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                    <span>متاح للبيع</span>
                                </div>

                                <div className="form-group checkbox-group mt-2">
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={formData.allow_spicy}
                                            onChange={(e) => setFormData({ ...formData, allow_spicy: e.target.checked })}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                    <span>يقبل خيارات الطهي (سبايسي)</span>
                                </div>

                                <div className="form-group mt-3">
                                    <label>خيارات مخصصة (افصل بينها بفاصلة)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="بدون بصل، زيادة جبنة، صوص إضافي..."
                                        value={formData.custom_options || ''}
                                        onChange={(e) => setFormData({ ...formData, custom_options: e.target.value })}
                                    />
                                    <small className="text-secondary text-xs">ستظهر هذه الخيارات كأزرار للكاشير</small>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>إلغاء</button>
                                <button type="submit" className="btn btn-primary">{editingProduct ? 'تحديث' : 'إضافة'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
