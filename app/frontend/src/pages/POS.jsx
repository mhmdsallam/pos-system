import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
    Search, Plus, Minus, Trash2, Printer, User, LogOut,
    Coffee, Utensils, Tag, Receipt, DollarSign, Store,
    Menu, ChevronRight, Check, Flame, LayoutDashboard, RefreshCw, Edit
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { showToast, useEscapeClose } from '../hooks/usePerformance'
import Receipts from '../components/Receipts'
import ShiftManager from '../components/ShiftManager'
import { printRef, printHTML, generateKitchenHTML } from '../utils/printHelper'
import './POS.css'

export default function POS() {
    const { user, token, logout } = useAuth()
    const navigate = useNavigate()

    // --- Data State ---
    const [categories, setCategories] = useState([])
    const [products, setProducts] = useState([])
    const [combos, setCombos] = useState([])
    const [loading, setLoading] = useState(true)
    const [editingNoteIdx, setEditingNoteIdx] = useState(null)

    // --- Filter State ---
    const [activeCategory, setActiveCategory] = useState({ id: 'all', name: 'الكل' })
    const [searchTerm, setSearchTerm] = useState('')

    // --- Cart State ---
    const [cart, setCart] = useState([])
    const [orderType, setOrderType] = useState('dine_in')
    const [paymentMethod, setPaymentMethod] = useState('cash')

    // --- Customer State ---
    const [customerPhone, setCustomerPhone] = useState('')
    const [customerName, setCustomerName] = useState('')
    const [customerAddress, setCustomerAddress] = useState('')
    const [tableNumber, setTableNumber] = useState('')

    // --- Discount & Delivery State ---
    const [discountType, setDiscountType] = useState('none') // 'none', 'percentage', 'amount'
    const [discountValue, setDiscountValue] = useState(0)
    const [deliveryFee, setDeliveryFee] = useState(0)

    // --- Modal State (Customization) ---
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [currentProduct, setCurrentProduct] = useState(null)
    const [customization, setCustomization] = useState({
        variationId: null,
        isSpicy: false,
        notes: '',
        selectedOptions: []
    })

    // --- Receipt State ---
    const [showReceipt, setShowReceipt] = useState(false)
    const [lastOrder, setLastOrder] = useState(null)
    const receiptClosedRef = useRef(false)
    const [printSettings, setPrintSettings] = useState({ autoKitchenPrint: false, printKitchenWithCustomer: true, kitchenPrinterName: '' })
    const [soundSettings, setSoundSettings] = useState({ orderSound: true, lowStockSound: true })

    // ESC to close all modals
    useEscapeClose(setIsModalOpen, () => { receiptClosedRef.current = true; setShowReceipt(false); });

    // --- Active Shift State ---
    const [activeShift, setActiveShift] = useState(null);
    const mountedRef = useRef(true);
    const printTimerRef = useRef(null);
    const posReceiptRef = useRef(null);

    // Normalize custom options regardless of how they were stored (comma/newline/JSON)
    const extractOptions = useCallback((rawOptions) => {
        if (!rawOptions) return [];
        if (Array.isArray(rawOptions)) {
            return rawOptions
                .map(opt => (typeof opt === 'string' ? opt.trim() : String(opt)))
                .filter(Boolean);
        }
        const str = String(rawOptions).trim();
        if (!str) return [];
        if (str.startsWith('[')) {
            try {
                const parsed = JSON.parse(str);
                if (Array.isArray(parsed)) {
                    return parsed
                        .map(opt => (typeof opt === 'string' ? opt.trim() : String(opt)))
                        .filter(Boolean);
                }
            } catch (e) {
                // Fallback to regex split below
            }
        }
        return str
            .split(/[\n,،;]+/)
            .map(opt => opt.trim())
            .filter(Boolean);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (printTimerRef.current) clearTimeout(printTimerRef.current);
        };
    }, []);

    // Load print settings from localStorage (shared with Settings page)
    useEffect(() => {
        try {
            const saved = localStorage.getItem('printSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                setPrintSettings({
                    autoKitchenPrint: Boolean(parsed.autoKitchenPrint),
                    printKitchenWithCustomer: parsed.printKitchenWithCustomer !== false,
                    kitchenPrinterName: parsed.kitchenPrinterName || ''
                });
            }
            const soundSaved = localStorage.getItem('soundSettings');
            if (soundSaved) {
                const sp = JSON.parse(soundSaved);
                setSoundSettings({
                    orderSound: sp.orderSound !== false,
                    lowStockSound: sp.lowStockSound !== false
                });
            }
        } catch (e) {
            console.warn('Failed to load settings', e);
        }
    }, []);

    // Play a short success beep using Web Audio API
    const playOrderSound = useCallback(() => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            // Play two short tones for a pleasant "ding-ding"
            osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12); // C#6
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) {
            // Audio not supported, fail silently
        }
    }, []);

    // Use ref to avoid stale closure in polling interval
    const activeCategoryRef = useRef(activeCategory);
    useEffect(() => { activeCategoryRef.current = activeCategory; }, [activeCategory]);

    // Initial Fetch
    useEffect(() => {
        fetchCategories();
        // Refresh products every 30 seconds, but only when page is visible
        const interval = setInterval(() => {
            if (document.hidden) return; // Skip polling when app is not visible
            const cat = activeCategoryRef.current;
            if (cat.id === 'combos') {
                fetchCombos();
            } else {
                fetchProducts(cat.id);
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [])

    useEffect(() => {
        if (activeCategory.id === 'combos') {
            fetchCombos()
        } else {
            fetchProducts(activeCategory.id)
        }
    }, [activeCategory])

    // Debounced Customer Search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (customerPhone.length >= 4) lookupCustomer(customerPhone)
        }, 500)
        return () => clearTimeout(timer)
    }, [customerPhone])

    // --- API Calls ---
    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/categories', { headers: { 'Authorization': `Bearer ${token}` } })
            if (!res.ok) throw new Error('Failed to fetch categories');
            const data = await res.json()
            setCategories(Array.isArray(data) ? data : [])
        } catch (e) { console.error(e); setCategories([]) }
    }

    const fetchProducts = async (catId) => {
        try {
            const url = catId === 'all'
                ? `/api/products?available=true&branch_id=${user?.branch_id || 1}`
                : `/api/products?category_id=${catId}&available=true&branch_id=${user?.branch_id || 1}`
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
            if (!res.ok) throw new Error('Failed to fetch products');
            const data = await res.json()
            setProducts(Array.isArray(data) ? data : [])
        } catch (e) { console.error(e); setProducts([]) }
        finally { setLoading(false) }
    }

    const fetchCombos = async () => {
        try {
            const res = await fetch(`/api/products/combos?branch_id=${user?.branch_id || 1}`, { headers: { 'Authorization': `Bearer ${token}` } })
            if (!res.ok) throw new Error('Failed to fetch combos');
            const data = await res.json()
            setCombos(Array.isArray(data) ? data : [])
        } catch (e) { console.error(e); setCombos([]) }
    }

    const lookupCustomer = async (phone) => {
        try {
            const res = await fetch(`/api/orders/customers/lookup?phone=${phone}`, { headers: { 'Authorization': `Bearer ${token}` } })
            if (res.ok) {
                const data = await res.json()
                setCustomerName(data.name)
                if (data.address) setCustomerAddress(data.address)
            }
        } catch (e) { console.error(e) }
    }

    // --- Logic: Add to Cart ---

    // 1. Initial Click on Product -> Decide whether to open modal or add directly
    const handleProductClick = (product, isCombo = false) => {
        // Check if product needs customization
        const optionsList = extractOptions(product.custom_options);
        const hasCustomOptions = optionsList.length > 0;
        const needsModal = isCombo ||
            (product.has_variations && product.variations?.length > 0) ||
            product.allow_spicy === 1 ||
            hasCustomOptions;

        if (!needsModal) {
            // Add directly without modal
            const newItem = {
                id: product.id,
                name: product.name,
                price: parseFloat(product.price),
                cost_price: parseFloat(product.cost_price || 0),
                quantity: 1,
                isCombo: false,
                variationId: null,
                variationName: '',
                notes: '',
                isSpicy: false
            };

            // Check for duplicates
            const idx = cart.findIndex(item =>
                item.id === newItem.id &&
                item.variationId === newItem.variationId &&
                item.notes === newItem.notes
            );

            if (idx > -1) {
                const newCart = [...cart];
                newCart[idx].quantity += 1;
                setCart(newCart);
            } else {
                setCart([...cart, newItem]);
            }
            return;
        }

        // Open modal for products with options
        setCurrentProduct({ ...product, is_combo: isCombo })

        // Initial Defaults
        let defaultVarId = null
        if (!isCombo && product.has_variations && product.variations?.length) {
            defaultVarId = product.variations[0].id
        }

        setCustomization({
            variationId: defaultVarId,
            isSpicy: false,
            notes: '',
            selectedOptions: []
        })

        setIsModalOpen(true)
    }

    // 2. Confirm Add from Modal
    const confirmAdd = () => {
        if (!currentProduct) return;

        // Determine Final Price & Name
        let finalPrice = parseFloat(currentProduct.price);
        let finalName = currentProduct.name;
        let variationName = '';

        if (customization.variationId) {
            const v = currentProduct.variations.find(v => v.id === customization.variationId);
            if (v) {
                finalPrice = parseFloat(v.price)
                variationName = v.name
            }
        }

        const optionNotes = (customization.selectedOptions || []).join(', ');
        const userNotes = customization.notes ? customization.notes.trim() : '';
        const notesParts = [];
        if (optionNotes) notesParts.push(optionNotes);
        if (userNotes) notesParts.push(userNotes);

        // Add Spice to Notes logic
        let finalNotes = notesParts.join(' | ');
        if (customization.isSpicy) {
            finalNotes = finalNotes ? `سبايسي 🌶 - ${finalNotes}` : `سبايسي 🌶`;
        }

        const newItem = {
            id: currentProduct.id,
            name: finalName,
            price: finalPrice,
            cost_price: customization.variationId
                ? (currentProduct.variations?.find(v => v.id === customization.variationId)?.cost_price || parseFloat(currentProduct.cost_price || 0))
                : parseFloat(currentProduct.cost_price || 0),
            quantity: 1,
            isCombo: currentProduct.is_combo,
            variationId: customization.variationId,
            variationName: variationName,
            notes: finalNotes,
            isSpicy: customization.isSpicy
        }

        // Check Duplicates (Same ID + Same Variation + Same Notes)
        const idx = cart.findIndex(item =>
            item.id === newItem.id &&
            item.variationId === newItem.variationId &&
            item.notes === newItem.notes
        );

        if (idx > -1) {
            const newCart = [...cart];
            newCart[idx].quantity += 1;
            setCart(newCart);
        } else {
            setCart([...cart, newItem]);
        }

        setIsModalOpen(false);
    }

    // --- Logic: Cart Controls ---
    const updateQty = (index, delta) => {
        const newCart = [...cart]
        const val = newCart[index].quantity + delta
        if (val > 0) {
            newCart[index].quantity = val
            setCart(newCart)
        }
    }

    const removeItem = (index) => {
        setCart(cart.filter((_, i) => i !== index))
    }

    // Memoize totals to avoid recalculating on every render / JSX reference
    const totals = useMemo(() => {
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)

        let discountAmount = 0
        if (discountType === 'percentage') {
            discountAmount = (subtotal * discountValue) / 100
        } else if (discountType === 'amount') {
            discountAmount = discountValue
        }

        const total = subtotal - discountAmount + deliveryFee

        return {
            subtotal,
            discountAmount,
            total: Math.max(0, total) // Never negative
        }
    }, [cart, discountType, discountValue, deliveryFee])

    // Keep backward compat for handleCheckout
    const calculateTotal = () => totals

    // --- Checkout ---
    const handleCheckout = async () => {
        if (cart.length === 0) return showToast('السلة فارغة!', 'warning')
        if (!activeShift) return showToast('يجب بدء وردية أولاً!', 'warning')
        if (orderType === 'dine_in' && !tableNumber) return showToast('رقم الطاولة مطلوب!', 'warning')
        if (orderType === 'delivery' && !customerName) return showToast('اسم العميل مطلوب!', 'warning')

        const totals = calculateTotal()

        const orderData = {
            customer_name: customerName || 'عميل نقدي',
            customer_phone: customerPhone || null,
            customer_address: customerAddress || null,
            items: cart.map(item => {
                // Find the product/combo cost_price
                let costPrice = 0;
                if (item.isCombo) {
                    const combo = combos.find(c => c.id === item.id);
                    costPrice = combo?.cost_price || 0;
                } else {
                    const product = products.find(p => p.id === item.id);
                    if (item.variationId && product?.variations) {
                        const variation = product.variations.find(v => v.id === item.variationId);
                        costPrice = variation?.cost_price || product?.cost_price || 0;
                    } else {
                        costPrice = product?.cost_price || 0;
                    }
                }

                return {
                    product_id: item.isCombo ? null : item.id,
                    combo_id: item.isCombo ? item.id : null,
                    quantity: item.quantity,
                    price: item.price,
                    cost_price: item.cost_price || costPrice,
                    variation_id: item.variationId || null,
                    is_spicy: item.isSpicy || false,
                    is_combo: item.isCombo || false,
                    notes: item.notes || null
                };
            }),
            table_number: tableNumber || null,
            order_type: orderType,
            payment_method: paymentMethod,
            cashier_id: user?.id,
            shift_id: activeShift?.id,
            branch_id: user?.branch_id || 1,
            subtotal: totals.subtotal,
            discount_percentage: discountType === 'percentage' ? discountValue : 0,
            discount_amount: totals.discountAmount,
            delivery_fee: deliveryFee,
            notes: null
        }

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(orderData)
            })
            if (res.ok) {
                const data = await res.json()

                // Construct full order object for Receipt
                const fullOrderForReceipt = {
                    ...orderData,
                    id: data.order_id,
                    order_number: data.order_number,
                    created_at: new Date().toISOString(),
                    total: totals.total,
                    items: cart.map(c => ({
                        product_name: c.name,
                        quantity: c.quantity,
                        price: c.price,
                        variation_name: c.variationName,
                        notes: c.notes,
                        is_spicy: c.isSpicy ? 1 : 0
                    }))
                }

                setLastOrder(fullOrderForReceipt)
                setShowReceipt(true)
                receiptClosedRef.current = false

                // Play order confirmation sound
                if (soundSettings.orderSound) {
                    playOrderSound();
                }

                // طباعة المطبخ تلقائياً بعد الحفظ إذا كانت مفعّلة
                if (printSettings.autoKitchenPrint) {
                    printKitchenCopy(fullOrderForReceipt)
                }

                // Reset
                setCart([])
                setTableNumber('')
                setCustomerName('')
                setCustomerPhone('')
                setCustomerAddress('')
                setDiscountType('none')
                setDiscountValue(0)
                setDeliveryFee(0)
            } else {
                const err = await res.json()
                showToast('حدث خطأ: ' + (err.error || 'خطأ غير معروف'), 'error')
            }
        } catch (e) { console.error(e); showToast('خطأ في الاتصال', 'error') }
    }

    // --- Render Helpers (memoized) ---
    const filteredItems = useMemo(() => {
        if (activeCategory.id === 'combos') return combos
        if (!searchTerm) return products
        const term = searchTerm.toLowerCase()
        return products.filter(p => p.name.toLowerCase().includes(term))
    }, [activeCategory.id, combos, products, searchTerm])

    return (
        <div className="pos-container">
            {/* 1. Left Column: Quick Actions */}
            <div className="pos-nav-column">
                <div className="nav-logo">
                    <Store size={32} />
                </div>
                <div className="nav-items">
                    <button className="nav-btn active">
                        <Menu size={24} />
                        <span>القائمة</span>
                    </button>

                    <button className="nav-btn" onClick={() => navigate('/orders')}>
                        <LayoutDashboard size={24} />
                        <span>الرئيسية</span>
                    </button>
                </div>
                <div className="nav-spacer"></div>

                <button className="nav-btn logout" onClick={() => { logout(); navigate('/login') }}>
                    <LogOut size={24} />
                    <span>خروج</span>
                </button>
            </div>

            {/* 2. Middle Column: Products */}
            <div className="pos-main-column">
                <div className="pos-top-bar">
                    <div className="search-container" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Search className="search-icon" size={20} />
                        <input
                            className="search-input"
                            placeholder="بحث عن منتج..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <button
                            className="btn-icon"
                            onClick={() => {
                                if (activeCategory.id === 'combos') {
                                    fetchCombos();
                                } else {
                                    fetchProducts(activeCategory.id);
                                }
                            }}
                            title="تحديث المنتجات"
                            style={{ padding: '8px' }}
                        >
                            <RefreshCw size={18} />
                        </button>
                    </div>

                    <ShiftManager onShiftChange={setActiveShift} />

                    <div className="categories-scroll">
                        <button
                            className={`category-tab ${activeCategory.id === 'all' ? 'active' : ''}`}
                            onClick={() => setActiveCategory({ id: 'all', name: 'الكل' })}
                        >
                            <Utensils size={18} /> الكل
                        </button>
                        <button
                            className={`category-tab ${activeCategory.id === 'combos' ? 'active' : ''}`}
                            onClick={() => setActiveCategory({ id: 'combos', name: 'عروض كومبو' })}
                        >
                            <Tag size={18} /> عروض
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                className={`category-tab ${activeCategory.id === cat.id ? 'active' : ''}`}
                                onClick={() => setActiveCategory(cat)}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="products-wrapper">
                    <div className="products-grid">
                        {loading ? <p className="text-center p-4">جاري التحميل...</p> : filteredItems.map(item => (
                            <div key={item.id} className="product-card" onClick={() => handleProductClick(item, activeCategory.id === 'combos')} title={item.name}>
                                <div className="product-img-box">
                                    {item.image ? (
                                        <img src={`http://localhost:3001${item.image}`} alt={item.name} onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.nextElementSibling?.style.setProperty('display', 'flex');
                                        }} />
                                    ) : null}
                                    <div className="product-img-placeholder" style={{ display: item.image ? 'none' : 'flex' }}>
                                        <Coffee size={36} strokeWidth={1.5} />
                                    </div>
                                    {
                                        (item.has_variations || activeCategory.id === 'combos') && (
                                            <span className="multi-option-badge">خيارات</span>
                                        )
                                    }
                                </div>
                                <div className="product-details">
                                    <h3 className="product-title">{item.name}</h3>
                                    {item.description && <p className="product-desc" style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 4px', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</p>}
                                    <span className="product-price">{parseFloat(item.price).toFixed(0)} ج.م</span>
                                </div>
                            </div>
                        ))}
                    </div >
                </div >
            </div >

            {/* 3. Right Column: Cart */}
            < div className="pos-cart-column" >
                <div className="order-type-selector">
                    <div className="type-toggles">
                        <button className={`type-btn ${orderType === 'dine_in' ? 'active' : ''}`} onClick={() => setOrderType('dine_in')}>صالة</button>
                        <button className={`type-btn ${orderType === 'takeaway' ? 'active' : ''}`} onClick={() => setOrderType('takeaway')}>سفري</button>
                        <button className={`type-btn ${orderType === 'delivery' ? 'active' : ''}`} onClick={() => setOrderType('delivery')}>توصيل</button>
                    </div>
                </div>

                <div className="cart-customer-info">
                    {orderType === 'dine_in' && (
                        <input
                            className="mini-input"
                            placeholder="رقم الطاولة"
                            value={tableNumber}
                            onChange={e => {
                                if (e.target.value < 0) return;
                                setTableNumber(e.target.value);
                            }}
                            type="number"
                            min="0"
                        />
                    )}
                    <div className="mini-input-row">
                        <input className="mini-input" placeholder="رقم الهاتف" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                    </div>

                    <input className="mini-input" placeholder="اسم العميل" value={customerName} onChange={e => setCustomerName(e.target.value)} />

                    {orderType === 'delivery' && (
                        <input className="mini-input" placeholder="العنوان" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
                    )}
                </div>

                <div className="cart-list">
                    {cart.map((item, idx) => (
                        <div key={idx} className="cart-item">
                            <div className="cart-item-info">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div className="cart-item-name">{item.name}</div>
                                    <button
                                        className="edit-note-btn"
                                        onClick={() => setEditingNoteIdx(idx === editingNoteIdx ? null : idx)}
                                        title="إضافة/تعديل ملاحظة"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                                    >
                                        <Edit size={14} color="#6b7280" />
                                    </button>
                                </div>

                                <div className="cart-item-meta">
                                    {item.variationName && <span className="meta-tag">{item.variationName}</span>}
                                    {item.isSpicy && <span className="meta-tag spicy">سبايسي 🌶</span>}
                                </div>

                                {/* Display Note Text */}
                                {item.notes && editingNoteIdx !== idx && (
                                    <div className="cart-item-notes-text" style={{ fontSize: '11px', color: '#666', marginTop: '2px', fontStyle: 'italic' }}>
                                        {item.notes}
                                    </div>
                                )}

                                {/* Inline Edit Input */}
                                {editingNoteIdx === idx && (
                                    <div className="cart-item-notes" style={{ marginTop: '4px' }}>
                                        <input
                                            type="text"
                                            className="notes-input"
                                            style={{ width: '100%', fontSize: '12px', padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }}
                                            placeholder="ملاحظة..."
                                            value={item.notes || ''}
                                            autoFocus
                                            onChange={(e) => {
                                                const newCart = [...cart];
                                                newCart[idx].notes = e.target.value;
                                                setCart(newCart);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') setEditingNoteIdx(null);
                                            }}
                                            onBlur={() => setEditingNoteIdx(null)}
                                        />
                                    </div>
                                )}

                                <div className="cart-item-price">{(item.price * item.quantity).toFixed(0)} ج.م</div>
                            </div>
                            <div className="cart-item-controls">
                                <div className="qty-control-sm">
                                    <button className="qty-btn" onClick={() => updateQty(idx, 1)}><Plus size={14} /></button>
                                    <span className="qty-val">{item.quantity}</span>
                                    <button className="qty-btn" onClick={() => updateQty(idx, -1)}><Minus size={14} /></button>
                                </div>
                                <button className="del-btn" onClick={() => removeItem(idx)}><Trash2 size={16} /></button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="cart-footer">
                    {/* Discount Section */}
                    <div className="discount-section" style={{ marginBottom: '12px', padding: '12px', background: '#f8f9fa', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            <button
                                className={`type-btn ${discountType === 'none' ? 'active' : ''}`}
                                style={{ flex: 1, padding: '6px 12px', fontSize: '13px' }}
                                onClick={() => { setDiscountType('none'); setDiscountValue(0); }}
                            >
                                بدون خصم
                            </button>
                            <button
                                className={`type-btn ${discountType === 'percentage' ? 'active' : ''}`}
                                style={{ flex: 1, padding: '6px 12px', fontSize: '13px' }}
                                onClick={() => setDiscountType('percentage')}
                            >
                                خصم %
                            </button>
                            <button
                                className={`type-btn ${discountType === 'amount' ? 'active' : ''}`}
                                style={{ flex: 1, padding: '6px 12px', fontSize: '13px' }}
                                onClick={() => setDiscountType('amount')}
                            >
                                خصم مبلغ
                            </button>
                        </div>
                        {discountType !== 'none' && (
                            <input
                                type="number"
                                className="mini-input"
                                placeholder={discountType === 'percentage' ? 'نسبة الخصم % (0-100)' : 'مبلغ الخصم'}
                                value={discountValue || ''}
                                onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    // Prevent negative values
                                    if (val < 0) return;
                                    // For percentage, cap at 100
                                    if (discountType === 'percentage' && val > 100) return;
                                    setDiscountValue(val);
                                }}
                                min="0"
                                max={discountType === 'percentage' ? "100" : undefined}
                                style={{ width: '100%' }}
                            />
                        )}
                    </div>

                    {/* Delivery Fee */}
                    {orderType === 'delivery' && (
                        <div className="delivery-section" style={{ marginBottom: '12px' }}>
                            <input
                                type="number"
                                className="mini-input"
                                placeholder="رسوم التوصيل (ج.م)"
                                value={deliveryFee || ''}
                                onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    if (val < 0) return; // Prevent negative values
                                    setDeliveryFee(val);
                                }}
                                min="0"
                                style={{ width: '100%' }}
                            />
                        </div>
                    )}

                    {/* Totals */}
                    <div style={{ marginBottom: '8px' }}>
                        <div className="totals-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                            <span>المجموع الفرعي</span>
                            <span>{totals.subtotal.toFixed(0)} ج.م</span>
                        </div>
                        {totals.discountAmount > 0 && (
                            <div className="totals-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#ef4444', marginBottom: '4px' }}>
                                <span>الخصم</span>
                                <span>- {totals.discountAmount.toFixed(0)} ج.م</span>
                            </div>
                        )}
                        {deliveryFee > 0 && (
                            <div className="totals-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                                <span>التوصيل</span>
                                <span>+ {deliveryFee.toFixed(0)} ج.م</span>
                            </div>
                        )}
                    </div>

                    <div className="payment-methods">
                        <button
                            className={`payment-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                            onClick={() => setPaymentMethod('cash')}
                        >
                            💵 نقدي
                        </button>
                        <button
                            className={`payment-btn ${paymentMethod === 'vodafone' ? 'active' : ''}`}
                            onClick={() => setPaymentMethod('vodafone')}
                        >
                            📱 فودافون كاش
                        </button>
                        <button
                            className={`payment-btn ${paymentMethod === 'instapay' ? 'active' : ''}`}
                            onClick={() => setPaymentMethod('instapay')}
                        >
                            💳 انستا باي
                        </button>
                    </div>
                    <div className="totals-row grand-total">
                        <span>الإجمالي النهائي</span>
                        <span>{totals.total.toFixed(0)} ج.م</span>
                    </div>
                    <button className="checkout-btn" onClick={handleCheckout}>
                        <Printer size={24} />
                        <span>تأكيد وطباعة</span>
                    </button>
                </div>
            </div >

            {/* Customization Modal */}
            {
                isModalOpen && currentProduct && (
                    <div className="modal-overlay">
                        <div className="custom-modal">
                            <div className="modal-header">
                                <h2>{currentProduct.name}</h2>
                                <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>×</button>
                            </div>
                            <div className="modal-content">
                                {/* Variations Scope */}
                                {!currentProduct.is_combo && currentProduct.has_variations && currentProduct.variations?.length > 0 && (
                                    <div className="option-group">
                                        <span className="option-title">الحجم / النوع</span>
                                        <div className="options-grid">
                                            {currentProduct.variations.map(v => (
                                                <div
                                                    key={v.id}
                                                    className={`option-card ${customization.variationId === v.id ? 'selected' : ''}`}
                                                    onClick={() => setCustomization({ ...customization, variationId: v.id })}
                                                >
                                                    <span className="opt-name">{v.name}</span>
                                                    <span className="opt-price">{v.price} ج.م</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Spicy Option - Only if allowed */}
                                {currentProduct.allow_spicy === 1 && (
                                    <div className="option-group">
                                        <span className="option-title">تفضيلات الطهي</span>
                                        <div className="options-grid">
                                            <div
                                                className={`option-card ${!customization.isSpicy ? 'selected' : ''}`}
                                                onClick={() => setCustomization({ ...customization, isSpicy: false })}
                                            >
                                                <span className="opt-name">عادي 😐</span>
                                            </div>
                                            <div
                                                className={`option-card ${customization.isSpicy ? 'selected' : ''}`}
                                                onClick={() => setCustomization({ ...customization, isSpicy: true })}
                                                style={customization.isSpicy ? { borderColor: '#ef4444', color: '#ef4444', backgroundColor: '#fef2f2' } : {}}
                                            >
                                                <span className="opt-name">سبايسي 🌶</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Custom Options from Owner */}
                                {extractOptions(currentProduct.custom_options).length > 0 && (
                                    <div className="option-group">
                                        <span className="option-title">إضافات وتعديلات</span>
                                        <div className="options-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
                                            {extractOptions(currentProduct.custom_options).map((option, idx) => {
                                                const isSelected = (customization.selectedOptions || []).includes(option);
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`option-card ${isSelected ? 'selected' : ''}`}
                                                        onClick={() => {
                                                            const current = customization.selectedOptions || [];
                                                            const updated = isSelected
                                                                ? current.filter(opt => opt !== option)
                                                                : [...current, option];
                                                            setCustomization({ ...customization, selectedOptions: updated });
                                                        }}
                                                        style={{ fontSize: '0.9rem', padding: '0.5rem', textAlign: 'center' }}
                                                    >
                                                        <span className="opt-name">{option}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Notes for Chef */}
                                <div className="option-group">
                                    <span className="option-title chef-notes">👨‍🍳 ملاحظات للشيف</span>
                                    <div className="notes-area">
                                        <textarea
                                            placeholder="بدون بصل، زيادة صوص، مطبوخ جيداً..."
                                            value={customization.notes}
                                            onChange={e => setCustomization({ ...customization, notes: e.target.value })}
                                        ></textarea>
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button className="btn-cancel" onClick={() => setIsModalOpen(false)}>إلغاء</button>
                                <button className="btn-add-order" onClick={confirmAdd}>
                                    إضافة للأوردر
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Receipt Modal for Print Confirmation */}
            {
                showReceipt && lastOrder && !receiptClosedRef.current && (
                    <div className="modal-overlay" style={{ zIndex: 2000 }}>
                        <div className="custom-modal" style={{ width: '400px' }}>
                            <div className="modal-header">
                                <h2>تم إنشاء الطلب بنجاح ✅</h2>
                            </div>
                            <div className="modal-content text-center">
                                <p>رقم الطلب: <b>{lastOrder.order_number}</b></p>
                                <div style={{ margin: '20px auto' }}>
                                    <Receipts ref={posReceiptRef} order={lastOrder} showKitchen={printSettings.printKitchenWithCustomer} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn-cancel" onClick={() => { receiptClosedRef.current = true; setShowReceipt(false); setLastOrder(null); }}>إغلاق</button>
                                <button className="btn-add-order" onClick={() => printRef(posReceiptRef, { title: `فاتورة - ${lastOrder.order_number}` })}>
                                    طباعة
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    )

    // طباعة نسخة المطبخ فقط باستخدام iframe (يعمل في Electron و Browser)
    function printKitchenCopy(order) {
        if (!order) return;
        const kitchenHtml = generateKitchenHTML(order);
        printHTML(kitchenHtml, { title: `بون مطبخ - ${order.order_number || ''}` });
    }
}
