import { useState, useEffect, useRef } from 'react'
import { FileText, FileSpreadsheet, TrendingUp, TrendingDown, DollarSign, Calendar, Printer } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useAuth } from '../context/AuthContext'
import './AnnualReport.css'

export default function AnnualReport() {
    const { token } = useAuth()
    const [year, setYear] = useState(new Date().getFullYear())
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchReport()
    }, [year])

    const fetchReport = async () => {
        setLoading(true)
        try {
            const response = await fetch(`/api/reports/annual?year=${year}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const result = await response.json()
            setData(result)
        } catch (error) {
            console.error('Error fetching report:', error)
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ar-EG', {
            style: 'currency',
            currency: 'EGP',
            maximumFractionDigits: 0
        }).format(amount)
    }

    const exportExcel = () => {
        if (!data) return

        const wb = XLSX.utils.book_new()

        // Prepare Data for Sheet
        const sheetData = [
            ['التقرير المالي السنوي', year],
            [''],
            ['الشهر', 'المبيعات', 'المصاريف التشغيلية', 'المرتبات', 'صافي الربح'],
            ...data.monthlyData.map(m => [
                m.monthName,
                m.sales,
                m.expenses,
                m.salaries,
                m.net_profit
            ]),
            [''],
            ['الإجمالي السنوي', data.totals.sales, data.totals.expenses, data.totals.salaries, data.totals.net_profit]
        ]

        const ws = XLSX.utils.aoa_to_sheet(sheetData)

        // Right-to-Left sheet
        ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }]

        XLSX.utils.book_append_sheet(wb, ws, `تقرير ${year}`)
        XLSX.writeFile(wb, `financial_report_${year}.xlsx`)
    }

    const handlePrint = () => {
        window.print()
    }

    if (loading) return <div className="p-8 text-center"><div className="spinner-large mx-auto"></div></div>

    // Calculate max value for chart scaling
    const maxVal = data ? Math.max(...data.monthlyData.map(m => Math.max(m.sales, m.expenses))) : 0

    return (
        <div className="report-container animate-fade-in p-6">
            <div className="flex justify-between items-center mb-8 no-print">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="text-accent" />
                        التقرير المالي السنوي
                    </h1>
                    <select
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="bg-bg-secondary border border-border rounded px-4 py-2 font-bold focus:border-accent outline-none"
                    >
                        {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - i).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
                <div className="flex gap-2">
                    <button onClick={handlePrint} className="btn btn-secondary flex items-center gap-2">
                        <Printer size={18} />
                        طباعة / PDF
                    </button>
                    <button onClick={exportExcel} className="btn btn-success flex items-center gap-2 text-white">
                        <FileSpreadsheet size={18} />
                        تصدير Excel
                    </button>
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print-block text-center mb-8 border-b-2 border-black pb-4">
                <h1 className="text-3xl font-black">التقرير المالي السنوي - {year}</h1>
                <p className="text-gray-600 mt-2">تم الاستخراج بتاريخ: {new Date().toLocaleDateString('en-GB')}</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="stat-card bg-bg-elevated p-6 rounded-xl border border-border shadow-sm">
                    <div className="text-secondary text-sm mb-2 flex items-center gap-2">
                        <DollarSign size={16} /> المبيعات
                    </div>
                    <div className="text-2xl font-bold text-success">{formatCurrency(data.totals.sales)}</div>
                </div>
                <div className="stat-card bg-bg-elevated p-6 rounded-xl border border-border shadow-sm">
                    <div className="text-secondary text-sm mb-2 flex items-center gap-2">
                        <TrendingDown size={16} /> المصاريف
                    </div>
                    <div className="text-2xl font-bold text-error">{formatCurrency(data.totals.expenses)}</div>
                </div>
                <div className="stat-card bg-bg-elevated p-6 rounded-xl border border-border shadow-sm">
                    <div className="text-secondary text-sm mb-2 flex items-center gap-2">
                        <Calendar size={16} /> المرتبات
                    </div>
                    <div className="text-2xl font-bold text-warning">{formatCurrency(data.totals.salaries)}</div>
                </div>
                <div className="stat-card bg-bg-elevated p-6 rounded-xl border border-border shadow-sm bg-gradient-to-br from-accent/10 to-transparent">
                    <div className="text-secondary text-sm mb-2 flex items-center gap-2">
                        <TrendingUp size={16} /> صافي الربح
                    </div>
                    <div className={`text-3xl font-black ${data.totals.net_profit >= 0 ? 'text-accent' : 'text-error'}`}>
                        {formatCurrency(data.totals.net_profit)}
                    </div>
                </div>
            </div>

            {/* Insights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 no-print">
                <div className="p-4 bg-success/10 border border-success/20 rounded-lg flex justify-between items-center">
                    <div>
                        <h4 className="font-bold text-success">أفضل شهر 🏆</h4>
                        <p className="text-sm opacity-80">الأعلى ربحية</p>
                    </div>
                    <div className="text-left">
                        <div className="font-bold text-xl">{data.insights.bestMonth.month}</div>
                        <div className="text-success font-bold">{formatCurrency(data.insights.bestMonth.value)}</div>
                    </div>
                </div>
                <div className="p-4 bg-error/10 border border-error/20 rounded-lg flex justify-between items-center">
                    <div>
                        <h4 className="font-bold text-error">أقل شهر 📉</h4>
                        <p className="text-sm opacity-80">الأقل ربحية</p>
                    </div>
                    <div className="text-left">
                        <div className="font-bold text-xl">{data.insights.worstMonth.month}</div>
                        <div className="text-error font-bold">{formatCurrency(data.insights.worstMonth.value)}</div>
                    </div>
                </div>
            </div>



            {/* Detailed Table */}
            <div className="bg-bg-elevated rounded-xl border border-border overflow-hidden">
                <div className="p-4 border-b border-border bg-bg-secondary font-bold">
                    تفاصيل الشهور
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead>
                            <tr className="bg-bg-secondary/50 text-secondary text-sm">
                                <th className="p-3">الشهر</th>
                                <th className="p-3">المبيعات</th>
                                <th className="p-3">المصاريف</th>
                                <th className="p-3">المرتبات</th>
                                <th className="p-3">صافي الربح</th>
                                <th className="p-3 text-center">الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.monthlyData.map((m, i) => (
                                <tr key={i} className="border-b border-border hover:bg-bg-secondary/30 transition-colors">
                                    <td className="p-3 font-bold">{m.monthName}</td>
                                    <td className="p-3 text-success font-medium">{formatCurrency(m.sales)}</td>
                                    <td className="p-3 text-error font-medium">{formatCurrency(m.expenses)}</td>
                                    <td className="p-3 text-warning font-medium">{formatCurrency(m.salaries)}</td>
                                    <td className={`p-3 font-bold dir-ltr ${m.net_profit >= 0 ? 'text-accent' : 'text-error'}`}>
                                        {formatCurrency(m.net_profit)}
                                    </td>
                                    <td className="p-3 text-center">
                                        {m.net_profit > 0 ?
                                            <span className="bg-success/20 text-success text-xs px-2 py-1 rounded-full">ربح</span> :
                                            (m.net_profit < 0 ? <span className="bg-error/20 text-error text-xs px-2 py-1 rounded-full">خسارة</span> : '-')
                                        }
                                    </td>
                                </tr>
                            ))}
                            {/* Totals Row */}
                            <tr className="bg-bg-secondary font-bold text-sm">
                                <td className="p-3 text-lg">الإجمالي</td>
                                <td className="p-3 text-success text-lg">{formatCurrency(data.totals.sales)}</td>
                                <td className="p-3 text-error text-lg">{formatCurrency(data.totals.expenses)}</td>
                                <td className="p-3 text-warning text-lg">{formatCurrency(data.totals.salaries)}</td>
                                <td className={`p-3 text-xl ${data.totals.net_profit >= 0 ? 'text-accent' : 'text-error'}`}>
                                    {formatCurrency(data.totals.net_profit)}
                                </td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
