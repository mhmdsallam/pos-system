import { useState, useEffect, useRef } from 'react'
import { Plus, Edit, Trash2, X, Check, Users, ChefHat, Store, Bell, Lock, Database, FileJson, HardDrive, Download, Printer } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { showToast } from '../hooks/usePerformance'
import './Settings.css'

export default function Settings({ section = 'general' }) {
    const { token, hasRole } = useAuth()
    const [activeTab, setActiveTab] = useState(section)

    // Update activeTab when section prop changes
    useEffect(() => {
        setActiveTab(section)
    }, [section])

    const [categories, setCategories] = useState([])
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [downloading, setDownloading] = useState(false)
    const [restoring, setRestoring] = useState(false)
    const [autoKitchenPrint, setAutoKitchenPrint] = useState(false)
    const [printKitchenWithCustomer, setPrintKitchenWithCustomer] = useState(true)
    const [kitchenPrinterName, setKitchenPrinterName] = useState('')
    const [orderSound, setOrderSound] = useState(true)
    const [lowStockSound, setLowStockSound] = useState(true)
    const [availablePermissions, setAvailablePermissions] = useState({})
    const [roleDefaultPermissions, setRoleDefaultPermissions] = useState({})
    const [showModal, setShowModal] = useState(false)
    const [editingItem, setEditingItem] = useState(null)
    const [modalType, setModalType] = useState(null)
    const [formData, setFormData] = useState({})
    const deleteConfirmRef = useRef({ category: null, user: null })
    const restoreInputRef = useRef(null)

    useEffect(() => {
        fetchData()
    }, [activeTab])

    const fetchData = async () => {
        setLoading(true)
        try {
            const headers = { 'Authorization': `Bearer ${token}` };

            if (activeTab === 'categories') {
                const response = await fetch('/api/categories', { headers })
                const data = await response.json()
                setCategories(data)
            } else if (activeTab === 'users') {
                const [usersRes, permRes] = await Promise.all([
                    fetch('/api/users', { headers }),
                    fetch('/api/users/permissions', { headers })
                ]);

                const userData = await usersRes.json();
                const permData = await permRes.json();

                setUsers(Array.isArray(userData) ? userData : []);
                setAvailablePermissions(permData.permissions || {});
                setRoleDefaultPermissions(permData.rolePermissions || {});
            }
        } catch (error) {
            console.error('Error fetching data:', error)
            setUsers([]) // Fallback in case of error
        } finally {
            setLoading(false)
        }
    }

    // Load print settings from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('printSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                setAutoKitchenPrint(Boolean(parsed.autoKitchenPrint));
                setPrintKitchenWithCustomer(parsed.printKitchenWithCustomer !== false); // default true
                setKitchenPrinterName(parsed.kitchenPrinterName || '');
            }
            const soundSaved = localStorage.getItem('soundSettings');
            if (soundSaved) {
                const sp = JSON.parse(soundSaved);
                setOrderSound(sp.orderSound !== false);
                setLowStockSound(sp.lowStockSound !== false);
            }
        } catch (e) {
            console.warn('Failed to load settings', e);
        }
    }, []);

    const persistPrintSettings = (next) => {
        localStorage.setItem('printSettings', JSON.stringify(next));
    }

    const persistSoundSettings = (next) => {
        localStorage.setItem('soundSettings', JSON.stringify(next));
    }

    const openModal = (item = null, type) => {
        setEditingItem(item)
        setModalType(type)
        if (item) {
            if (type === 'category') {
                setFormData({
                    name: item.name,
                    color: item.color,
                    icon: item.icon,
                    sort_order: item.sort_order || 0
                })
            } else if (type === 'user') {
                setFormData({
                    username: item.username,
                    full_name: item.full_name,
                    role: item.role,
                    active: item.active,
                    password: '',
                    permissions: item.permissions || []
                })
            }
        } else {
            if (type === 'category') {
                setFormData({ name: '', color: '#3b82f6', icon: '🍽️', sort_order: 0 })
            } else if (type === 'user') {
                const defaultRole = 'cashier';
                setFormData({
                    username: '',
                    full_name: '',
                    role: defaultRole,
                    active: true,
                    password: '',
                    permissions: roleDefaultPermissions[defaultRole] || []
                })
            }
        }
        setShowModal(true)
    }

    const closeModal = () => {
        setShowModal(false)
        setEditingItem(null)
        setModalType(null)
        setFormData({})
    }

    const handleCategorySubmit = async (e) => {
        e.preventDefault()

        try {
            const url = editingItem
                ? `/api/categories/${editingItem.id}`
                : '/api/categories'
            const method = editingItem ? 'PUT' : 'POST'

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            })

            if (response.ok) {
                fetchData()
                closeModal()
            }
        } catch (error) {
            console.error('Error saving category:', error)
        }
    }

    const handleUserSubmit = async (e) => {
        e.preventDefault()

        try {
            const userData = { ...formData }
            if (!userData.password && editingItem) {
                delete userData.password
            }

            if (!editingItem && !userData.password) {
                showToast('كلمة المرور مطلوبة', 'error')
                return
            }

            const url = editingItem
                ? `/api/users/${editingItem.id}`
                : '/api/users'
            const method = editingItem ? 'PUT' : 'POST'

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(userData)
            })

            const result = await response.json()

            if (response.ok) {
                showToast(editingItem ? 'تم تحديث المستخدم بنجاح' : 'تم إضافة المستخدم بنجاح', 'success')
                fetchData()
                closeModal()
            } else {
                showToast(result.error || 'خطأ في حفظ المستخدم', 'error')
            }
        } catch (error) {
            console.error('Error saving user:', error)
            showToast('خطأ في حفظ المستخدم', 'error')
        }
    }

    const togglePermission = (permKey) => {
        const currentPerms = formData.permissions || [];
        if (currentPerms.includes(permKey)) {
            setFormData({ ...formData, permissions: currentPerms.filter(p => p !== permKey) });
        } else {
            setFormData({ ...formData, permissions: [...currentPerms, permKey] });
        }
    };

    const handleRoleChange = (role) => {
        setFormData({
            ...formData,
            role,
            permissions: roleDefaultPermissions[role] || []
        });
    };

    const deleteCategory = async (id) => {
        if (deleteConfirmRef.current.category !== id) {
            deleteConfirmRef.current.category = id
            showToast('اضغط حذف مرة أخرى لتأكيد حذف الفئة', 'warning')
            setTimeout(() => { deleteConfirmRef.current.category = null }, 5000)
            return
        }
        deleteConfirmRef.current.category = null
        try {
            const response = await fetch(`/api/categories/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const result = await response.json()
            if (!response.ok) {
                showToast(result.error || 'فشل حذف الفئة', 'error')
                return
            }
            fetchData()
            showToast('تم حذف الفئة بنجاح', 'success')
        } catch (error) {
            console.error('Error deleting category:', error)
            showToast('تعذر حذف الفئة', 'error')
        }
    }

    const deleteUser = (id) => {
        if (deleteConfirmRef.current.user !== id) {
            deleteConfirmRef.current.user = id
            showToast('اضغط حذف مرة أخرى لتأكيد حذف المستخدم', 'warning')
            setTimeout(() => { deleteConfirmRef.current.user = null }, 5000)
            return
        }
        deleteConfirmRef.current.user = null
        fetch(`/api/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).then((response) => {
            if (!response.ok) throw new Error('فشل حذف المستخدم')
            fetchData()
            showToast('تم حذف المستخدم', 'success')
        }).catch((error) => {
            console.error('Error deleting user:', error)
            showToast('تعذر حذف المستخدم', 'error')
        })
    }

    const toggleUserStatus = async (user) => {
        try {
            const response = await fetch(`/api/users/${user.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...user,
                    active: !user.active
                })
            })
            if (response.ok) fetchData()
        } catch (error) {
            console.error('Error toggling user status:', error)
        }
    }

    const downloadBackup = async (type) => {
        setDownloading(true);
        try {
            const endpoint = type === 'json'
                ? '/api/settings/database/export'
                : '/api/settings/database/backup';

            const response = await fetch(`http://localhost:3001${endpoint}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'فشل تحميل النسخة الاحتياطية');
            }

            // Get filename from Content-Disposition header or create default
            const contentDisposition = response.headers.get('Content-Disposition');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const dateStamp = new Date().toISOString().split('T')[0];

            let filename;
            if (type === 'json') {
                filename = `restaurant_backup_${timestamp}.json`;
            } else {
                filename = `pos_backup_${dateStamp}.db`;
            }

            // Override with server filename if available
            if (contentDisposition) {
                const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
                if (matches && matches[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                }
            }

            // Convert response to blob and download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            const fileType = type === 'json' ? 'JSON (نسخة شاملة)' : 'SQLite (قاعدة البيانات)';
            const fileSize = (blob.size / 1024).toFixed(2);
            showToast(`تم تحميل النسخة الاحتياطية (${fileType}) - الحجم: ${fileSize} KB`, 'success');

        } catch (error) {
            console.error('Error downloading backup:', error);
            showToast('حدث خطأ أثناء تحميل النسخة الاحتياطية', 'error');
        } finally {
            setDownloading(false);
        }
    }

    const handleRestoreClick = () => {
        if (restoreInputRef.current) {
            restoreInputRef.current.value = '';
            restoreInputRef.current.click();
        }
    }

    const handleRestoreFile = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.db')) {
            showToast('الملف يجب أن يكون SQLite بصيغة .db', 'error');
            return;
        }

        setRestoring(true);
        try {
            const formData = new FormData();
            formData.append('dbfile', file);

            const response = await fetch('/api/settings/database/restore', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'فشل الاستعادة');

            showToast(data.message || 'تم الاستعادة. يرجى إعادة تشغيل النظام.', 'success');
        } catch (error) {
            console.error('Restore error:', error);
            showToast(error.message || 'فشل في استعادة قاعدة البيانات', 'error');
        } finally {
            setRestoring(false);
        }
    }

    const tabs = [
        { id: 'general', label: 'عام', icon: Store },
        { id: 'categories', label: 'الفئات', icon: ChefHat, roles: ['owner'] },
        { id: 'users', label: 'المستخدمون', icon: Users, roles: ['owner'] },
        { id: 'notifications', label: 'الإشعارات', icon: Bell },
        { id: 'security', label: 'الأمان', icon: Lock },
        { id: 'database', label: 'قاعدة البيانات', icon: Database, roles: ['owner'] },
    ]

    const filteredTabs = tabs.filter(tab =>
        !tab.roles || tab.roles.some(role => hasRole(role))
    )

    if (loading && activeTab !== 'general') {
        // Don't block entire page - show inline loading
    }

    return (
        <div className="settings-page animate-fade-in">
            <div className="page-header">
                <h1>الإعدادات</h1>
                <p className="text-secondary">إعدادات النظام والمستخدمين</p>
            </div>

            <div className="settings-container">
                <div className="settings-tabs">
                    {filteredTabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <tab.icon size={20} />
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                <div className="settings-content">
                    {activeTab === 'general' && (
                        <div className="settings-section">
                            <h2>معلومات المطعم</h2>
                            <div className="info-card">
                                <div className="info-item">
                                    <span className="label">اسم المطعم:</span>
                                    <span className="value">مطعم عجلان للمشويات</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">اسم المطور/المسؤول:</span>
                                    <span className="value">م/ محمد سلام</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">رقم الدعم الفني:</span>
                                    <span className="value">01014698287</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">رقم الإصدار:</span>
                                    <span className="value">2.0.0</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">حالة النظام:</span>
                                    <span className="badge badge-success">نشط</span>
                                </div>
                            </div>

                            {/* Print Settings */}
                            <h2 style={{ marginTop: '28px' }}>🖨️ إعدادات الطباعة</h2>
                            <div className="settings-card">
                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>طباعة بون المطبخ مع فاتورة العميل</h4>
                                        <p className="text-muted">عند الطباعة سيتم طباعة بون المطبخ تلقائياً مع فاتورة العميل في نفس الوقت</p>
                                    </div>
                                    <label className="toggle">
                                        <input type="checkbox" checked={printKitchenWithCustomer}
                                            onChange={(e) => {
                                                const val = e.target.checked;
                                                setPrintKitchenWithCustomer(val);
                                                persistPrintSettings({ autoKitchenPrint, printKitchenWithCustomer: val, kitchenPrinterName });
                                            }}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>
                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>طباعة تلقائية لبون المطبخ بعد تأكيد الطلب</h4>
                                        <p className="text-muted">سيتم طباعة بون المطبخ تلقائياً فور حفظ الطلب بدون ما تحتاج تضغط زر طباعة</p>
                                    </div>
                                    <label className="toggle">
                                        <input type="checkbox" checked={autoKitchenPrint}
                                            onChange={(e) => {
                                                const val = e.target.checked;
                                                setAutoKitchenPrint(val);
                                                persistPrintSettings({ autoKitchenPrint: val, printKitchenWithCustomer, kitchenPrinterName });
                                            }}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>
                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>اسم طابعة المطبخ (اختياري)</h4>
                                        <p className="text-muted">للتوثيق فقط - الطباعة تتم عبر الطابعة الافتراضية للنظام</p>
                                    </div>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="اسم الطابعة..."
                                        value={kitchenPrinterName}
                                        onChange={(e) => {
                                            const nextName = e.target.value;
                                            setKitchenPrinterName(nextName);
                                            persistPrintSettings({ autoKitchenPrint, printKitchenWithCustomer, kitchenPrinterName: nextName });
                                        }}
                                        style={{ maxWidth: '280px' }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'categories' && (
                        <div className="settings-section">
                            <div className="section-header">
                                <h2>إدارة الفئات</h2>
                                <button className="btn btn-primary" onClick={() => openModal(null, 'category')}>
                                    <Plus size={18} />
                                    إضافة فئة
                                </button>
                            </div>
                            <div className="items-grid">
                                {categories.map(category => (
                                    <div key={category.id} className="item-card">
                                        <div className="item-icon" style={{ backgroundColor: `${category.color}20`, color: category.color }}>
                                            {category.icon || '🍽️'}
                                        </div>
                                        <div className="item-info">
                                            <h4>{category.name}</h4>
                                            <span className="item-meta">ترتيب: {category.sort_order || 0}</span>
                                        </div>
                                        <div className="item-actions">
                                            <button className="btn-icon" onClick={() => openModal(category, 'category')}>
                                                <Edit size={16} />
                                            </button>
                                            <button className="btn-icon btn-error" onClick={() => deleteCategory(category.id)}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'users' && (
                        <div className="settings-section">
                            <div className="section-header">
                                <h2>إدارة المستخدمين</h2>
                                <button className="btn btn-primary" onClick={() => openModal(null, 'user')}>
                                    <Plus size={18} />
                                    إضافة مستخدم
                                </button>
                            </div>
                            <div className="users-table-container">
                                <table className="users-table">
                                    <thead>
                                        <tr>
                                            <th>اسم المستخدم</th>
                                            <th>الاسم الكامل</th>
                                            <th>الدور</th>
                                            <th>الحالة</th>
                                            <th>تاريخ الإنشاء</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.isArray(users) && users.length > 0 ? (
                                            users.map(user => (
                                                <tr key={user.id}>
                                                    <td className="font-mono">{user.username}</td>
                                                    <td>{user.full_name}</td>
                                                    <td>
                                                        <span className={`badge ${user.role === 'owner' ? 'badge-primary' : 'badge-secondary'}`}>
                                                            {user.role === 'owner' ? 'مالك' : 'كاشير'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${user.active ? 'badge-success' : 'badge-error'}`}>
                                                            {user.active ? 'نشط' : 'معطل'}
                                                        </span>
                                                    </td>
                                                    <td className="text-muted">
                                                        {new Date(user.created_at).toLocaleDateString('en-GB')}
                                                    </td>
                                                    <td>
                                                        <div className="action-buttons">
                                                            <button className="btn-icon" onClick={() => openModal(user, 'user')}>
                                                                <Edit size={16} />
                                                            </button>
                                                            {user.id !== 1 && (
                                                                <>
                                                                    <button
                                                                        className="btn-icon"
                                                                        onClick={() => toggleUserStatus(user)}
                                                                        title={user.active ? 'تعطيل' : 'تفعيل'}
                                                                    >
                                                                        {user.active ? <X size={16} /> : <Check size={16} />}
                                                                    </button>
                                                                    <button className="btn-icon btn-error" onClick={() => deleteUser(user.id)}>
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="6" className="text-center p-4">لا يوجد مستخدمين</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'notifications' && (
                        <div className="settings-section">
                            <h2>إعدادات الإشعارات والأصوات</h2>
                            <div className="settings-card">
                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>🔔 صوت تأكيد الطلب</h4>
                                        <p className="text-muted">تشغيل نغمة قصيرة عند تأكيد طلب جديد بنجاح</p>
                                    </div>
                                    <label className="toggle">
                                        <input type="checkbox" checked={orderSound}
                                            onChange={(e) => {
                                                const val = e.target.checked;
                                                setOrderSound(val);
                                                persistSoundSettings({ orderSound: val, lowStockSound });
                                            }}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>
                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>⚠️ تنبيه المخزون المنخفض</h4>
                                        <p className="text-muted">تشغيل صوت تنبيه وإشعار عند وجود منتجات مخزونها منخفض</p>
                                    </div>
                                    <label className="toggle">
                                        <input type="checkbox" checked={lowStockSound}
                                            onChange={(e) => {
                                                const val = e.target.checked;
                                                setLowStockSound(val);
                                                persistSoundSettings({ orderSound, lowStockSound: val });
                                            }}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div className="info-box" style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(59,130,246,0.08)', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.15)' }}>
                                <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>
                                    💡 إشعارات المخزون المنخفض تظهر كـ badge في القائمة الجانبية بجانب "المخزون" وتتحدث تلقائياً كل 5 دقائق.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'security' && (
                        <div className="settings-section">
                            <h2>إعدادات الأمان</h2>
                            <div className="settings-card">
                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>تسجيل الخروج التلقائي</h4>
                                        <p className="text-muted">تسجيل الخروج بعد فترة من عدم النشاط</p>
                                    </div>
                                    <select className="form-input" style={{ width: '150px' }}>
                                        <option value="30">30 دقيقة</option>
                                        <option value="60">ساعة</option>
                                        <option value="120">ساعتين</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'database' && (
                        <div className="settings-section">
                            <h2>إدارة البيانات</h2>

                            <div className="settings-card">
                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>📦 نسخة احتياطية شاملة (JSON)</h4>
                                        <p className="text-muted">
                                            تحميل جميع البيانات في ملف JSON منظم يحتوي على:<br />
                                            • المنتجات والفئات والعروض<br />
                                            • الطلبات والعملاء<br />
                                            • المخزون والمصروفات<br />
                                            • الموظفين والمستخدمين<br />
                                            • إحصائيات شاملة
                                        </p>
                                        <p className="text-success" style={{ fontSize: '13px', marginTop: '8px' }}>
                                            ⭐ مُنصح به - بيانات مرتبة وسهلة القراءة
                                        </p>
                                    </div>
                                    <button
                                        className="btn btn-success"
                                        onClick={() => downloadBackup('json')}
                                        style={{ minWidth: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                        disabled={downloading}
                                    >
                                        <FileJson size={20} />
                                        {downloading ? 'جاري التحميل...' : 'تحميل JSON'}
                                    </button>
                                </div>
                            </div>

                            <div className="settings-card" style={{ marginTop: '20px' }}>
                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>💾 نسخة قاعدة البيانات (SQLite)</h4>
                                        <p className="text-muted">
                                            تحميل ملف قاعدة البيانات الأصلي (pos.db)<br />
                                            مناسب للاستعادة الكاملة أو النقل إلى جهاز آخر
                                        </p>
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => downloadBackup('sqlite')}
                                        style={{ minWidth: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                        disabled={downloading}
                                    >
                                        <HardDrive size={20} />
                                        {downloading ? 'جاري التحميل...' : 'تحميل DB'}
                                    </button>
                                </div>
                            </div>

                            <div className="settings-card" style={{ marginTop: '20px', border: '1px dashed #cbd5e1' }}>
                                <div className="setting-item">
                                    <div className="setting-info">
                                        <h4>⬆️ استعادة قاعدة البيانات (رفع ملف)</h4>
                                        <p className="text-muted">
                                            اختر ملف pos.db سبق أن حمّلته، وسيتم استبداله تلقائياً مع إنشاء نسخة احتياطية قديمة.
                                            <br />بعد الرفع أعد تشغيل البرنامج / السيرفر لتطبيق التغييرات.
                                        </p>
                                        <ul style={{ fontSize: '13px', color: '#6b7280', marginTop: '6px', lineHeight: 1.6 }}>
                                            <li>الملفات المسموح بها: ‎.db‎ (SQLite)</li>
                                            <li>يتم حفظ نسخة احتياطية قديمة باسم pos.db.bak-التاريخ</li>
                                            <li>الحجم الأقصى 50MB</li>
                                        </ul>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={handleRestoreClick}
                                            style={{ minWidth: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                            disabled={restoring}
                                        >
                                            <Download size={18} />
                                            {restoring ? 'جارٍ الاستعادة...' : 'رفع ملف DB واستعادة'}
                                        </button>
                                        <input
                                            type="file"
                                            accept=".db,application/x-sqlite3"
                                            ref={restoreInputRef}
                                            style={{ display: 'none' }}
                                            onChange={handleRestoreFile}
                                        />
                                    </div>
                                </div>
                            </div>



                            <div className="info-box" style={{
                                marginTop: '24px',
                                padding: '16px',
                                background: 'rgba(59, 130, 246, 0.1)',
                                borderRadius: '12px',
                                border: '1px solid rgba(59, 130, 246, 0.2)'
                            }}>
                                <h4 style={{ fontSize: '15px', marginBottom: '8px', color: '#3b82f6' }}>
                                    💡 نصائح النسخ الاحتياطي:
                                </h4>
                                <ul style={{
                                    fontSize: '14px',
                                    lineHeight: '1.8',
                                    color: '#94a3b8',
                                    paddingRight: '20px',
                                    margin: 0
                                }}>
                                    <li>احفظ نسخة احتياطية يومياً في مكان آمن</li>
                                    <li>استخدم النسخة الشاملة (JSON) للمراجعة والتحليل</li>
                                    <li>استخدم نسخة SQLite لاستعادة النظام بالكامل</li>
                                    <li>احتفظ بنسخ متعددة في أماكن مختلفة (فلاشة، سحابة، قرص خارجي)</li>
                                    <li>بعد الاستعادة: أغلق وأعد تشغيل السيرفر/التطبيق ليتم تحميل قاعدة البيانات الجديدة</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>
                                {editingItem ?
                                    (modalType === 'category' ? 'تعديل الفئة' : 'تعديل المستخدم') :
                                    (modalType === 'category' ? 'إضافة فئة' : 'إضافة مستخدم')
                                }
                            </h2>
                            <button className="modal-close" onClick={closeModal}>
                                <X size={24} />
                            </button>
                        </div>
                        {modalType === 'category' ? (
                            <form onSubmit={handleCategorySubmit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label>اسم الفئة</label>
                                        <input
                                            type="text"
                                            value={formData.name || ''}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="form-input"
                                            required
                                        />
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>الأيقونة</label>
                                            <input
                                                type="text"
                                                value={formData.icon || ''}
                                                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                                                className="form-input"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>اللون</label>
                                            <input
                                                type="color"
                                                value={formData.color || '#3b82f6'}
                                                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                                className="form-input"
                                                style={{ height: '48px', padding: '4px' }}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>ترتيب العرض</label>
                                        <input
                                            type="number"
                                            value={formData.sort_order || 0}
                                            onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) })}
                                            className="form-input"
                                        />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={closeModal}>إلغاء</button>
                                    <button type="submit" className="btn btn-primary">حفظ</button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleUserSubmit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label>اسم المستخدم</label>
                                        <input
                                            type="text"
                                            value={formData.username || ''}
                                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                            className="form-input"
                                            required={!editingItem}
                                            disabled={!!editingItem}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>الاسم الكامل</label>
                                        <input
                                            type="text"
                                            value={formData.full_name || ''}
                                            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                            className="form-input"
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>كلمة المرور {editingItem ? '(اتركها فارغة لعدم التغيير)' : ''}</label>
                                        <input
                                            type="password"
                                            value={formData.password || ''}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            className="form-input"
                                            required={!editingItem}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>الدور</label>
                                        <select
                                            value={formData.role || 'cashier'}
                                            onChange={(e) => handleRoleChange(e.target.value)}
                                            className="form-input"
                                        >
                                            <option value="cashier">كاشير</option>
                                            <option value="owner">مالك</option>
                                            <option value="products_manager">مدير منتجات</option>
                                        </select>
                                    </div>

                                    {formData.role !== 'owner' && (
                                        <div className="form-group">
                                            <label className="mb-2 block font-bold">الصلاحيات المخصصة</label>
                                            <div className="permissions-grid" style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                                gap: '10px',
                                                maxHeight: '300px',
                                                overflowY: 'auto',
                                                padding: '15px',
                                                background: 'var(--color-bg-secondary)',
                                                borderRadius: '8px',
                                                border: '1px solid var(--color-border)'
                                            }}>
                                                {Object.entries(availablePermissions).map(([key, label]) => (
                                                    <label key={key} className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={(formData.permissions || []).includes(key)}
                                                            onChange={() => togglePermission(key)}
                                                            className="w-4 h-4"
                                                        />
                                                        <span>{label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <p className="text-xs text-secondary mt-2">
                                                * المالك (Owner) لديه كافة الصلاحيات تلقائياً. الأدوار الأخرى تأخذ صلاحيات افتراضية يمكن تعديلها هنا.
                                            </p>
                                        </div>
                                    )}
                                    <div className="form-group checkbox-group">
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={formData.active || false}
                                                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                            />
                                            <span>نشط (يسمح له بالدخول للنظام)</span>
                                        </label>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={closeModal}>إلغاء</button>
                                    <button type="submit" className="btn btn-primary">حفظ</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
