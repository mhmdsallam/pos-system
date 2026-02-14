import { useState, useEffect, useCallback, useRef } from 'react'
import { DollarSign, Calendar, Check, AlertCircle, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { showToast } from '../hooks/usePerformance'

export default function Payroll() {
    const { token } = useAuth()
    const [loading, setLoading] = useState(true)
    const [employees, setEmployees] = useState([])
    const [currentDate, setCurrentDate] = useState(new Date())
    const [history, setHistory] = useState([])
    const [activeTab, setActiveTab] = useState('current') // current | history
    const [processingMap, setProcessingMap] = useState({})
    const payConfirmRef = useRef(null)

    useEffect(() => {
        if (activeTab === 'current') {
            fetchPayrollStatus()
        } else {
            fetchHistory()
        }
    }, [currentDate, activeTab])

    const fetchPayrollStatus = async () => {
        setLoading(true)
        try {
            const month = currentDate.getMonth() + 1
            const year = currentDate.getFullYear()
            const res = await fetch(`/api/payroll/status?month=${month}&year=${year}`, {
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

    const fetchHistory = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/payroll/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setHistory(data)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const handlePay = (emp) => {
        if (processingMap[emp.id]) return

        if (payConfirmRef.current !== emp.id) {
            payConfirmRef.current = emp.id
            showToast(`اضغط مرة أخرى لتأكيد صرف راتب ${emp.name}`, 'warning')
            setTimeout(() => { if (payConfirmRef.current === emp.id) payConfirmRef.current = null }, 5000)
            return
        }
        payConfirmRef.current = null

        // Start processing
        setProcessingMap(prev => ({ ...prev, [emp.id]: true }))

        const payload = {
            employee_id: emp.id,
            month: currentDate.getMonth() + 1,
            year: currentDate.getFullYear(),
            base_salary: emp.details.base_salary,
            advances_deducted: emp.details.itemized_advances,
            net_salary: emp.details.net_salary
        }

        fetch('/api/payroll/pay', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        }).then(async (res) => {
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'حدث خطأ في صرف الراتب')
            }
            showToast(`تم صرف راتب ${emp.name} بنجاح`, 'success')
            await fetchPayrollStatus()
        }).catch((error) => {
            console.error(error)
            showToast(error.message || 'خطأ في الاتصال بالخادم', 'error')
        }).finally(() => {
            setProcessingMap(prev => {
                const next = { ...prev }
                delete next[emp.id]
                return next
            })
        })
    }

    const changeMonth = (delta) => {
        const newDate = new Date(currentDate)
        newDate.setMonth(newDate.getMonth() + delta)
        setCurrentDate(newDate)
    }

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ar-EG', {
            style: 'currency',
            currency: 'EGP'
        }).format(amount)
    }

    const monthName = currentDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' })

    return (
        <div className="p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold mb-2">الرواتب والأجور</h1>
                    <p className="text-secondary">إدارة الرواتب الشهرية والخصومات</p>
                </div>

                <div className="flex bg-bg-secondary p-1 rounded-lg border border-border">
                    <button
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'current' ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-primary hover:bg-bg-hover'}`}
                        onClick={() => setActiveTab('current')}
                    >
                        رواتب الشهر
                    </button>
                    <button
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-primary hover:bg-bg-hover'}`}
                        onClick={() => setActiveTab('history')}
                    >
                        سجل المدفوعات
                    </button>
                </div>
            </div>

            {activeTab === 'current' && (
                <>
                    <div className="flex items-center justify-between bg-bg-secondary p-4 rounded-lg border border-border mb-6">
                        <button className="btn-icon" onClick={() => changeMonth(-1)}><ChevronRight /></button>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Calendar className="text-accent" />
                            {monthName}
                        </h2>
                        <button className="btn-icon" onClick={() => changeMonth(1)}><ChevronLeft /></button>
                    </div>

                    <div className="card overflow-hidden">
                        <table className="w-full text-right">
                            <thead className="bg-bg-elevated text-secondary text-sm">
                                <tr>
                                    <th className="p-4">الموظف</th>
                                    <th className="p-4">الراتب الأساسي</th>
                                    <th className="p-4">الخصومات / السلف</th>
                                    <th className="p-4">صافي الراتب</th>
                                    <th className="p-4">الحالة</th>
                                    <th className="p-4">الإجراء</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {employees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-bg-secondary/50 transition-colors">
                                        <td className="p-4 font-medium">{emp.name}</td>
                                        <td className="p-4 text-secondary">{formatCurrency(emp.salary)}</td>
                                        <td className="p-4 text-error">
                                            {emp.status === 'pending'
                                                ? (emp.details.itemized_advances > 0 ? `-${formatCurrency(emp.details.itemized_advances)}` : '-')
                                                : (emp.details.advances_deducted > 0 ? `-${formatCurrency(emp.details.advances_deducted)}` : '-')
                                            }
                                        </td>
                                        <td className="p-4 font-bold text-success text-lg">
                                            {formatCurrency(emp.status === 'pending' ? emp.details.net_salary : emp.details.net_salary)}
                                        </td>
                                        <td className="p-4">
                                            {emp.status === 'paid' ? (
                                                <span className="badge badge-success flex items-center gap-1 w-fit">
                                                    <Check size={14} /> مدفوع
                                                </span>
                                            ) : (
                                                <span className="badge badge-warning flex items-center gap-1 w-fit">
                                                    <AlertCircle size={14} /> مستحق
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            {emp.status === 'pending' && (
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => handlePay(emp)}
                                                    disabled={processingMap[emp.id]}
                                                    style={{ opacity: processingMap[emp.id] ? 0.7 : 1 }}
                                                >
                                                    <DollarSign size={16} />
                                                    {processingMap[emp.id] ? 'جاري الصرف...' : 'صرف الراتب'}
                                                </button>
                                            )}
                                            {emp.status === 'paid' && (
                                                <span className="text-secondary text-sm">
                                                    تم بتاريخ {new Date(emp.details.payment_date).toLocaleDateString('en-GB')}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {employees.length === 0 && !loading && (
                            <div className="p-8 text-center text-secondary">
                                لا يوجد موظفين مسجلين
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'history' && (
                <div className="card overflow-hidden">
                    <table className="w-full text-right">
                        <thead className="bg-bg-elevated text-secondary text-sm">
                            <tr>
                                <th className="p-4">التاريخ</th>
                                <th className="p-4">الموظف</th>
                                <th className="p-4">الشهر</th>
                                <th className="p-4">المبلغ المدفوع</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {history.map(pay => (
                                <tr key={pay.id} className="hover:bg-bg-secondary/50">
                                    <td className="p-4 text-secondary">{new Date(pay.payment_date).toLocaleString()}</td>
                                    <td className="p-4 font-medium">{pay.name}</td>
                                    <td className="p-4">{pay.month}/{pay.year}</td>
                                    <td className="p-4 font-bold text-success">{formatCurrency(pay.net_salary)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
