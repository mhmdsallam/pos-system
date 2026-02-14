import React, { forwardRef } from 'react';
import './Receipts.css';

const ShiftReceipt = forwardRef(({ summary, user }, ref) => {
    if (!summary) return null;

    const date = new Date().toLocaleDateString('en-GB');
    const time = new Date().toLocaleTimeString('en-GB');
    const totalExpenses = parseFloat(summary.total_expenses || 0);
    const netCash = typeof summary.net_cash === 'number'
        ? summary.net_cash
        : ((summary.starting_cash || 0) + (summary.cash_sales || 0) - totalExpenses);

    return (
        <div className="print-container" ref={ref} dir="rtl">
            <div className="receipt text-center">
                <div className="mb-4 border-b-2 border-black pb-2">
                    <h2 className="text-2xl font-black">تقرير إغلاق الوردية</h2>
                    <p className="font-bold mt-1">مطعم عجلان للمشويات</p>
                    <div className="mt-2 text-sm">
                        <p>التاريخ: {date}</p>
                        <p>الوقت: {time}</p>
                        <p>الكاشير: {user?.full_name}</p>
                    </div>
                </div>

                <div className="text-right mb-4">
                    <h3 className="text-lg font-bold border-b border-black mb-2">ملخص المبيعات</h3>
                    <div className="flex justify-between py-1 border-b border-dashed border-gray-400">
                        <span>الطلبات:</span>
                        <span className="font-bold">{summary.total_orders}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-dashed border-gray-400">
                        <span>مبيعات كاش:</span>
                        <span className="font-bold">{summary.cash_sales?.toFixed(2)} ج.م</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-dashed border-gray-400">
                        <span>مبيعات فيزا:</span>
                        <span className="font-bold">{summary.visa_sales?.toFixed(2)} ج.م</span>
                    </div>
                    <div className="flex justify-between py-2 text-xl font-black border-b-2 border-black">
                        <span>إجمالي المبيعات:</span>
                        <span>{summary.total_sales?.toFixed(2)} ج.م</span>
                    </div>
                </div>

                <div className="text-right mb-4">
                    <h3 className="text-lg font-bold border-b border-black mb-2">المصروفات</h3>
                    {summary.expenses_details && summary.expenses_details.length > 0 ? (
                        summary.expenses_details.map((exp, idx) => (
                            <div key={idx} className="flex justify-between py-1 text-sm border-b border-dashed border-gray-400 gap-2">
                                <span className="flex-1 font-medium">{exp.category || 'مصروف عام'}</span>
                                <span className="flex-[2] text-right text-gray-700">{exp.description || '—'}</span>
                                <span className="font-bold">{(parseFloat(exp.amount) || 0).toFixed(2)} ج.م</span>
                            </div>
                        ))
                    ) : (
                        <p className="text-center text-gray-500 py-2">-- لا يوجد مصروفات --</p>
                    )}
                    <div className="flex justify-between py-2 font-bold text-red-600 border-t border-black mt-2">
                        <span>إجمالي المصروفات:</span>
                        <span>-{totalExpenses.toFixed(2)} ج.م</span>
                    </div>
                </div>

                <div className="border-2 border-black p-2 mt-4 text-center">
                    <h3 className="text-xl font-black mb-1">صافي الكاش (للتوريد)</h3>
                    <p className="text-3xl font-black">{netCash.toFixed(2)} ج.م</p>
                </div>

                <div className="mt-8 pt-4 border-t-2 border-dashed border-gray-400">
                    <div className="flex justify-between mb-8">
                        <div className="text-center w-1/2">
                            <p className="font-bold mb-4">توقيع الكاشير</p>
                            <p>________________</p>
                        </div>
                        <div className="text-center w-1/2">
                            <p className="font-bold mb-4">توقيع المدير</p>
                            <p>________________</p>
                        </div>
                    </div>
                    <p className="text-center text-xs">تم طباعة التقرير آلياً</p>
                </div>
            </div>
        </div>
    );
});

ShiftReceipt.displayName = 'ShiftReceipt';

export default ShiftReceipt;
