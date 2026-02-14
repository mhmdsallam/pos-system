import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Edit2, User, Phone, DollarSign, Calendar, Save, X, Briefcase } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { showToast, useEscapeClose } from '../hooks/usePerformance'

export default function Employees() {
    const { token } = useAuth()
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingEmp, setEditingEmp] = useState(null)
    const [advancesModal, setAdvancesModal] = useState(null) // ID of employee to show advances for
    const deleteConfirmRef = useRef(null)

    // ESC to close modals
    useEscapeClose(setShowModal, setAdvancesModal);

    // Form States
    const [formData, setFormData] = useState({
        name: '', position: '', salary: '', phone: '', hire_date: ''
    })
    const [advanceData, setAdvanceData] = useState({ amount: '', description: '' })
    const [advancesList, setAdvancesList] = useState([])

    useEffect(() => {
        fetchEmployees()
    }, [])

    useEffect(() => {
        if (advancesModal) {
            fetchAdvances(advancesModal)
        }
    }, [advancesModal])

    const fetchEmployees = async () => {
        try {
            const res = await fetch('/api/employees', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setEmployees(data)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const fetchAdvances = async (id) => {
        console.log('🔵 Fetching advances for employee:', id)
        try {
            const res = await fetch(`/api/employees/${id}/advances`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            console.log('🟢 Fetched advances:', data)
            setAdvancesList(data)
        } catch (error) {
            console.error('❌ Error fetching advances:', error)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const url = editingEmp
            ? `/api/employees/${editingEmp.id}`
            : '/api/employees'

        const method = editingEmp ? 'PUT' : 'POST'

        try {
            await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            })
            fetchEmployees()
            setShowModal(false)
            setFormData({ name: '', position: '', salary: '', phone: '', hire_date: '' })
            setEditingEmp(null)
        } catch (error) {
            console.error(error)
        }
    }

    const handleDelete = (id) => {
        if (deleteConfirmRef.current !== id) {
            deleteConfirmRef.current = id
            showToast('اضغط حذف مرة أخرى لتأكيد حذف الموظف', 'warning')
            setTimeout(() => { if (deleteConfirmRef.current === id) deleteConfirmRef.current = null }, 5000)
            return
        }
        deleteConfirmRef.current = null
        fetch(`/api/employees/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).then((res) => {
            if (!res.ok) throw new Error('فشل حذف الموظف')
            fetchEmployees()
            showToast('تم حذف الموظف', 'success')
        }).catch((error) => {
            console.error(error)
            showToast('تعذر حذف الموظف', 'error')
        })
    }

    const handleAddAdvance = async (e) => {
        e.preventDefault()
        console.log('🔵 handleAddAdvance called')
        console.log('🔵 advancesModal:', advancesModal)
        console.log('🔵 advanceData:', advanceData)

        if (!advancesModal) {
            console.log('❌ No employee selected')
            return
        }

        if (!advanceData.amount || advanceData.amount <= 0) {
            showToast('من فضلك أدخل مبلغ السلفة', 'warning')
            return
        }

        try {
            const response = await fetch(`/api/employees/${advancesModal}/advances`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(advanceData)
            })

            console.log('🟢 Response status:', response.status)
            const data = await response.json()

            if (!response.ok) {
                showToast(data.error || 'حدث خطأ أثناء إضافة السلفة', 'error')
                return
            }

            // Success
            await fetchAdvances(advancesModal)
            setAdvanceData({ amount: '', description: '' })
            showToast('تم إضافة السلفة بنجاح', 'success')
        } catch (error) {
            console.error('Fetch error:', error)
            showToast('حدث خطأ في الاتصال بالخادم', 'error')
        }
    }

    const openEdit = (emp) => {
        setEditingEmp(emp)
        setFormData({
            name: emp.name,
            position: emp.position,
            salary: emp.salary,
            phone: emp.phone,
            hire_date: emp.hire_date?.split('T')[0]
        })
        setShowModal(true)
    }

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ar-EG', {
            style: 'currency',
            currency: 'EGP'
        }).format(amount)
    }

    return (
        <div className="p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold mb-2">إدارة الموظفين</h1>
                    <p className="text-secondary">سجل بيانات الموظفين ورواتبهم</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setEditingEmp(null)
                        setFormData({ name: '', position: '', salary: '', phone: '', hire_date: '' })
                        setShowModal(true)
                    }}
                >
                    <Plus size={18} />
                    موظف جديد
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {employees.map(emp => (
                    <div key={emp.id} className="card p-6 relative group hover:border-accent transition-colors">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-full bg-bg-elevated flex items-center justify-center text-accent">
                                <User size={24} />
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="btn-icon" onClick={() => openEdit(emp)} title="تعديل">
                                    <Edit2 size={16} />
                                </button>
                                <button className="btn-icon btn-error" onClick={() => handleDelete(emp.id)} title="حذف">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>

                        <h3 className="font-bold text-lg mb-1">{emp.name}</h3>
                        <p className="text-secondary text-sm mb-4">{emp.position || 'غير محدد'}</p>

                        <div className="space-y-2 text-sm text-secondary mb-6">
                            <div className="flex items-center gap-2">
                                <DollarSign size={16} className="text-success" />
                                <span className="text-text-primary font-bold">{formatCurrency(emp.salary)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Phone size={16} />
                                <span>{emp.phone || '-'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Calendar size={16} />
                                <span>{new Date(emp.hire_date).toLocaleDateString('en-GB')}</span>
                            </div>
                        </div>

                        <button
                            className="btn btn-secondary w-full"
                            onClick={() => setAdvancesModal(emp.id)}
                        >
                            <DollarSign size={16} />
                            إدارة السلف
                        </button>
                    </div>
                ))}
            </div>

            {/* Add/Edit Employee Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="card max-w-lg w-full p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">{editingEmp ? 'تعديل موظف' : 'إضافة موظف جديد'}</h3>
                            <button className="btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm mb-1 text-secondary">الاسم الكامل</label>
                                <div className="flex items-center bg-bg-primary border border-border rounded-md px-3">
                                    <User size={18} className="text-muted" />
                                    <input
                                        required
                                        className="w-full bg-transparent border-none p-2 outline-none text-text-primary"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm mb-1 text-secondary">الوظيفة</label>
                                    <div className="flex items-center bg-bg-primary border border-border rounded-md px-3">
                                        <Briefcase size={18} className="text-muted" />
                                        <input
                                            className="w-full bg-transparent border-none p-2 outline-none text-text-primary"
                                            value={formData.position}
                                            onChange={e => setFormData({ ...formData, position: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm mb-1 text-secondary">الراتب</label>
                                    <div className="flex items-center bg-bg-primary border border-border rounded-md px-3">
                                        <DollarSign size={18} className="text-muted" />
                                        <input
                                            required
                                            type="number"
                                            className="w-full bg-transparent border-none p-2 outline-none text-text-primary"
                                            value={formData.salary}
                                            onChange={e => setFormData({ ...formData, salary: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm mb-1 text-secondary">رقم الهاتف</label>
                                    <div className="flex items-center bg-bg-primary border border-border rounded-md px-3">
                                        <Phone size={18} className="text-muted" />
                                        <input
                                            className="w-full bg-transparent border-none p-2 outline-none text-text-primary"
                                            value={formData.phone}
                                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm mb-1 text-secondary">تاريخ التعيين</label>
                                    <div className="flex items-center bg-bg-primary border border-border rounded-md px-3">
                                        <input
                                            type="date"
                                            className="w-full bg-transparent border-none p-2 outline-none text-text-primary"
                                            value={formData.hire_date}
                                            onChange={e => setFormData({ ...formData, hire_date: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>إلغاء</button>
                                <button type="submit" className="btn btn-primary">حفظ</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Advances Modal */}
            {advancesModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="card max-w-lg w-full p-6 animate-fade-in flex flex-col max-h-[85vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">سجل السلف</h3>
                            <button className="btn-icon" onClick={() => setAdvancesModal(null)}><X size={20} /></button>
                        </div>

                        {/* New Advance Form */}
                        <form onSubmit={handleAddAdvance} className="mb-6 p-4 bg-bg-elevated rounded-lg border-2 border-accent/20">
                            <h4 className="text-sm font-bold mb-3 text-accent">إضافة سلفة جديدة</h4>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <input
                                        type="number"
                                        placeholder="المبلغ (مثال: 500)"
                                        className="w-full bg-bg-secondary dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 outline-none focus:border-accent text-text-primary dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                        required
                                        min="1"
                                        step="0.01"
                                        value={advanceData.amount}
                                        onChange={e => setAdvanceData({ ...advanceData, amount: e.target.value })}
                                    />
                                </div>
                                <div className="flex-[2]">
                                    <input
                                        type="text"
                                        placeholder="السبب (اختياري)"
                                        className="w-full bg-bg-secondary dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 outline-none focus:border-accent text-text-primary dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                        value={advanceData.description}
                                        onChange={e => setAdvanceData({ ...advanceData, description: e.target.value })}
                                    />
                                </div>
                                <button type="submit" className="btn btn-primary px-6 py-3 flex items-center gap-2">
                                    <Plus size={20} />
                                    <span>إضافة</span>
                                </button>
                            </div>
                        </form>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto">
                            {advancesList.length === 0 ? (
                                <p className="text-center text-muted py-4">لا توجد سلف مسجلة</p>
                            ) : (
                                <>
                                    <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
                                        <p className="text-blue-800 dark:text-blue-200">
                                            💡 <strong>ملاحظة:</strong> السلف المعلقة سيتم خصمها تلقائياً عند حساب الراتب في صفحة الرواتب
                                        </p>
                                    </div>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-secondary border-b border-border">
                                                <th className="text-right py-2">التاريخ</th>
                                                <th className="text-right py-2">المبلغ</th>
                                                <th className="text-right py-2">السبب</th>
                                                <th className="text-right py-2">الحالة</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {advancesList.map(adv => (
                                                <tr key={adv.id} className="border-b border-border/50 last:border-0">
                                                    <td className="py-3">{new Date(adv.date).toLocaleDateString('en-GB')}</td>
                                                    <td className="py-3 font-bold text-error">{formatCurrency(adv.amount)}</td>
                                                    <td className="py-3 text-secondary">{adv.description}</td>
                                                    <td className="py-3">
                                                        <span className={`badge ${adv.status === 'deducted' ? 'badge-success' : 'badge-warning'}`}>
                                                            {adv.status === 'deducted' ? '✅ تم الخصم' : '🟡 معلقة'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
