/**
 * ShiftManager Component
 * Manages cashier shift lifecycle: start, monitor, and close shifts
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { showToast, useEscapeClose } from '../hooks/usePerformance';
import ShiftReceipt from './ShiftReceipt';
import { printRef as printRefFn } from '../utils/printHelper';
import './ShiftManager.css';

const ShiftManager = ({ onShiftChange }) => {
    const { user, token } = useAuth();
    const [activeShift, setActiveShift] = useState(null);
    const [loading, setLoading] = useState(true);
    const [startingCash, setStartingCash] = useState('');
    const [showStartModal, setShowStartModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [endingCash, setEndingCash] = useState('');
    const [notes, setNotes] = useState('');
    const [shiftSummary, setShiftSummary] = useState(null);

    // Printing state
    const [isPrinting, setIsPrinting] = useState(false);
    const shiftPrintRef = useRef();

    const mountedRef = useRef(true);

    // ESC closes any modal
    useEscapeClose(setShowStartModal, setShowCloseModal);

    useEffect(() => {
        mountedRef.current = true;
        if (token && user) {
            fetchActiveShift();
        }
        return () => { mountedRef.current = false; };
    }, [token, user]);

    const fetchActiveShift = async () => {
        try {
            const response = await fetch('/api/shifts/active', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (!mountedRef.current) return;
            setActiveShift(data.shift);
            if (onShiftChange) {
                onShiftChange(data.shift);
            }
        } catch (error) {
            console.error('Error fetching active shift:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleStartShift = async () => {
        try {
            const response = await fetch('/api/shifts/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ starting_cash: parseFloat(startingCash) || 0 })
            });
            const data = await response.json();
            if (!response.ok) {
                const err = new Error(data.error || 'خطأ في بدء الوردية');
                if (data.shift) err.shift = data.shift;
                throw err;
            }
            setActiveShift(data.shift);
            setShowStartModal(false);
            setStartingCash('');
            if (onShiftChange) {
                onShiftChange(data.shift);
            }
            showToast('تم بدء الوردية بنجاح', 'success');
        } catch (error) {
            // If backend returned the open shift in the error (smart recovery)
            if (error.shift) {
                setActiveShift(error.shift);
                setShowStartModal(false);
                if (onShiftChange) onShiftChange(error.shift);
                showToast('تم استعادة الوردية المفتوحة', 'info');
            }
            // Fallback: If just message, try fetching active manually
            else if (error.message?.includes('مفتوحة بالفعل')) {
                fetchActiveShift();
                setShowStartModal(false);
                showToast('تم استعادة الوردية المفتوحة', 'info');
            } else {
                showToast(error.message || 'خطأ في بدء الوردية', 'error');
            }
        }
    };

    const handlePrepareClose = async () => {
        if (!activeShift?.id) {
            showToast('لا توجد وردية نشطة للاغلاق', 'warning');
            return;
        }
        try {
            const response = await fetch(`/api/shifts/${activeShift.id}/summary`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'خطأ في ملخص الوردية');
            setShiftSummary({
                shift: data.shift || {},
                paymentBreakdown: Array.isArray(data.paymentBreakdown) ? data.paymentBreakdown : [],
                expensesDetails: Array.isArray(data.expenses_details) ? data.expenses_details : [],
                totalExpenses: parseFloat(data.total_expenses || 0) || 0,
                netCash: typeof data.net_cash === 'number'
                    ? data.net_cash
                    : ((parseFloat(data.shift?.starting_cash || 0) || 0) + (parseFloat(data.shift?.cash_sales || 0) || 0) - (parseFloat(data.total_expenses || 0) || 0)),
            });
            setShowCloseModal(true);
        } catch (error) {
            showToast(error.message || 'خطأ في جلب ملخص الوردية', 'error');
        }
    };

    const handleCloseShift = async () => {
        if (!endingCash) {
            showToast('يرجى إدخال رصيد النهائي للكاش', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/shifts/${activeShift.id}/close`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    ending_cash: parseFloat(endingCash),
                    notes: notes
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'خطأ في إغلاق الوردية');
            }

            showToast('تم إغلاق الوردية بنجاح', 'success');

            // Auto print receipt on close if desired, or manual only.
            // For now, manual printing via button before or after close is typically safe, 
            // but since we close and reset state, we should probably print BEFORE confirm or have a way to print after.
            // The user requested adding the receipt *to the closing part*.
            // I'll make sure they can print from the modal.

            setActiveShift(null);
            setShowCloseModal(false);
            setEndingCash('');
            setNotes('');
            setShiftSummary(null);

            if (onShiftChange) {
                onShiftChange(null);
            }
        } catch (error) {
            showToast(error.message || 'خطأ في إغلاق الوردية', 'error');
        }
    };

    const handlePrintReceipt = () => {
        setIsPrinting(true);
        setTimeout(() => {
            printRefFn(shiftPrintRef, { title: 'تقرير الوردية' }).then(() => {
                setIsPrinting(false);
            });
        }, 300);
    };

    const getDateObj = (str) => {
        if (!str) return new Date();
        // Fix SQLite date format (replace space with T for ISO 8601)
        return new Date(str.replace(' ', 'T'));
    };

    const formatDuration = (start) => {
        if (!start) return '0 دقيقة';
        const startTime = getDateObj(start);
        const now = new Date();
        const diff = now - startTime;
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        return `${hours} ساعة و ${minutes} دقيقة`;
    };

    const formatTime = (dateString) => {
        const date = getDateObj(dateString);
        return date.toLocaleString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const formatTimeOnly = (dateString) => {
        return getDateObj(dateString).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    if (loading) {
        return <div className="shift-manager"><span className="text-secondary">جاري التحميل...</span></div>;
    }

    return (
        <div className="shift-manager">
            {!activeShift ? (
                <button
                    className="btn btn-start-shift"
                    onClick={() => setShowStartModal(true)}
                >
                    <span>🔓</span> بدء وردية جديدة
                </button>
            ) : (
                <div className="active-shift-indicator">
                    <div className="shift-status">
                        <span className="status-dot"></span>
                        <span>الوردية نشطة</span>
                    </div>
                    <div className="shift-info">
                        <span>بدأت: {formatTimeOnly(activeShift.start_time)}</span>
                        <span>المدة: {formatDuration(activeShift.start_time)}</span>
                    </div>
                    <button
                        className="btn btn-close-shift"
                        onClick={handlePrepareClose}
                    >
                        <span>🔒</span> إغلاق الوردية
                    </button>
                </div>
            )}

            {/* Start Shift Modal */}
            {showStartModal && (
                <div className="modal-overlay" onClick={() => setShowStartModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setShowStartModal(false); if (e.key === 'Enter') handleStartShift(); }}>
                        <div className="modal-header">
                            <h2>بدء وردية جديدة</h2>
                            <button className="close-btn" onClick={() => setShowStartModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>الكاشير: {user?.full_name}</label>
                            </div>
                            <div className="form-group">
                                <label>رصيد بداية الوردية (نقدي)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={startingCash}
                                    onChange={(e) => setStartingCash(e.target.value)}
                                    placeholder="0.00"
                                    className="input-field"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowStartModal(false)}>
                                إلغاء
                            </button>
                            <button className="btn btn-primary" onClick={handleStartShift}>
                                بدء الوردية
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Close Shift Modal */}
            {showCloseModal && shiftSummary && (
                <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
                    <div className="modal-content shift-close-modal" onClick={(e) => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setShowCloseModal(false); }}>
                        <div className="modal-header">
                            <h2>إغلاق الوردية</h2>
                            <div className="header-actions">
                                <button className="btn-icon" onClick={handlePrintReceipt} title="طباعة تقرير الوردية">
                                    🖨️
                                </button>
                                <button className="close-btn" onClick={() => setShowCloseModal(false)}>×</button>
                            </div>
                        </div>
                        <div className="modal-body">
                            {(() => {
                                const summaryShift = shiftSummary?.shift || {};
                                const paymentBreakdown = Array.isArray(shiftSummary?.paymentBreakdown) ? shiftSummary.paymentBreakdown : [];
                                return (
                                    <>
                                        {/* Shift Time Info */}
                                        <div className="shift-time-info" style={{
                                            background: '#f5f5f5',
                                            padding: '12px',
                                            borderRadius: '8px',
                                            marginBottom: '20px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div>
                                                <strong>⏰ وقت البدء:</strong> {summaryShift.start_time ? formatTime(summaryShift.start_time) : '—'}
                                            </div>
                                            <div>
                                                <strong>⏱️ المدة:</strong> {summaryShift.start_time ? formatDuration(summaryShift.start_time) : '—'}
                                            </div>
                                        </div>

                                        {/* Shift Summary */}
                                        <div className="shift-summary-section">
                                            <h3>ملخص الوردية</h3>
                                            <div className="summary-grid">
                                                <div className="summary-card">
                                                    <span className="label">عدد الطلبات</span>
                                                    <span className="value">{summaryShift.total_orders || 0}</span>
                                                </div>
                                                <div className="summary-card">
                                                    <span className="label">إجمالي المبيعات</span>
                                                    <span className="value">{(summaryShift.total_revenue || 0).toFixed(2)} ج.م</span>
                                                </div>
                                                <div className="summary-card">
                                                    <span className="label">التكلفة</span>
                                                    <span className="value">{(summaryShift.total_cost || 0).toFixed(2)} ج.م</span>
                                                </div>
                                                <div className="summary-card profit">
                                                    <span className="label">صافي الربح بعد المصروفات</span>
                                                    <span className="value">{((summaryShift.total_profit || 0) - (shiftSummary.totalExpenses || 0)).toFixed(2)} ج.م</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Payment Breakdown */}
                                        <div className="payment-breakdown-section">
                                            <h3>تفصيل وسائل الدفع</h3>
                                            <div className="payment-methods">
                                                {paymentBreakdown.map((pm) => (
                                                    <div key={pm.payment_method} className="payment-row">
                                                        <span className="method">{getPaymentMethodLabel(pm.payment_method)}</span>
                                                        <span className="count">{pm.count} طلب</span>
                                                        <span className="amount">{pm.total.toFixed(2)} ج.م</span>
                                                    </div>
                                                ))}
                                                {paymentBreakdown.length === 0 && (
                                                    <div className="text-secondary text-sm">لا يوجد بيانات دفع</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expenses */}
                                        <div className="payment-breakdown-section" style={{ marginTop: '16px' }}>
                                            <h3>المصروفات خلال الوردية</h3>
                                            <div className="payment-methods">
                                                {(shiftSummary.expensesDetails || []).map((exp) => (
                                                    <div key={`${exp.id}-${exp.date}-${exp.amount}`} className="payment-row" style={{ gap: '12px' }}>
                                                        <span className="method" style={{ minWidth: '120px' }}>{exp.category || 'مصروف'}</span>
                                                        <span className="count" style={{ flex: 1 }}>{exp.description || '—'}</span>
                                                        <span className="amount" style={{ color: '#dc2626' }}>{(parseFloat(exp.amount) || 0).toFixed(2)} ج.م</span>
                                                    </div>
                                                ))}
                                                {(shiftSummary.expensesDetails || []).length === 0 && (
                                                    <div className="text-secondary text-sm">لا يوجد مصروفات مسجلة على هذه الوردية</div>
                                                )}
                                            </div>
                                            <div className="cash-row" style={{ marginTop: '8px', fontWeight: 700, color: '#dc2626' }}>
                                                <span>إجمالي المصروفات:</span>
                                                <span>{(shiftSummary.totalExpenses || 0).toFixed(2)} ج.م</span>
                                            </div>
                                        </div>

                                        {/* Cash Reconciliation */}
                                        <div className="cash-reconciliation">
                                            <h3>تسوية النقدية</h3>
                                            <div className="cash-details">
                                                <div className="cash-row">
                                                    <span>رصيد البداية:</span>
                                                    <span>{(summaryShift.starting_cash || 0).toFixed(2)} ج.م</span>
                                                </div>
                                                <div className="cash-row">
                                                    <span>مبيعات نقدي:</span>
                                                    <span>{(summaryShift.cash_sales || 0).toFixed(2)} ج.م</span>
                                                </div>
                                                <div className="cash-row" style={{ color: '#dc2626' }}>
                                                    <span>المصروفات:</span>
                                                    <span>-{(shiftSummary.totalExpenses || 0).toFixed(2)} ج.م</span>
                                                </div>
                                                <div className="cash-row expected">
                                                    <span>النقدية المتوقعة بعد المصروفات:</span>
                                                    <span>{getExpectedCash().toFixed(2)} ج.م</span>
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <label>النقدية الفعلية (رصيد النهاية)</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={endingCash}
                                                    onChange={(e) => setEndingCash(e.target.value)}
                                                    placeholder="0.00"
                                                    className="input-field"
                                                    required
                                                />
                                            </div>

                                            {endingCash && (
                                                <div className={`variance-alert ${getVarianceClass()}`}>
                                                    الفارق: {calculateVariance().toFixed(2)} ج.م
                                                </div>
                                            )}
                                        </div>

                                        {/* Notes */}
                                        <div className="form-group">
                                            <label>ملاحظات (اختياري)</label>
                                            <textarea
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                placeholder="أي ملاحظات حول الوردية..."
                                                className="textarea-field"
                                                rows="3"
                                            />
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowCloseModal(false)}>
                                إلغاء
                            </button>
                            <button className="btn btn-primary" onClick={handlePrintReceipt}>
                                🖨️ طباعة التقرير
                            </button>
                            <button className="btn btn-danger" onClick={handleCloseShift}>
                                إغلاق الوردية نهائياً
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Shift Receipt for Printing - hidden on screen, visible in print */}
            {isPrinting && shiftSummary && (
                <div className="shift-receipt-print-area">
                    <ShiftReceipt
                        ref={shiftPrintRef}
                        user={user}
                        summary={{
                            total_orders: shiftSummary.shift.total_orders || 0,
                            cash_sales: shiftSummary.shift.cash_sales || 0,
                            visa_sales: shiftSummary.shift.visa_sales || 0,
                            total_sales: shiftSummary.shift.total_revenue || 0,
                            starting_cash: shiftSummary.shift.starting_cash || 0,
                            total_expenses: shiftSummary.totalExpenses || 0,
                            net_cash: shiftSummary.netCash,
                            expenses_details: shiftSummary.expensesDetails || []
                        }}
                    />
                </div>
            )}
        </div>
    );

    function getPaymentMethodLabel(method) {
        const labels = {
            cash: 'نقدي',
            visa: 'فيزا',
            instapay: 'انستاباي',
            vodafone: 'فودافون كاش'
        };
        return labels[method] || method;
    }

    function calculateVariance() {
        const expected = getExpectedCash();
        return parseFloat(endingCash || 0) - expected;
    }

    function getExpectedCash() {
        const summaryShift = shiftSummary?.shift || {};
        const expenses = parseFloat(shiftSummary?.totalExpenses || 0) || 0;
        const starting = parseFloat(summaryShift.starting_cash || 0) || 0;
        const cashSales = parseFloat(summaryShift.cash_sales || 0) || 0;
        return starting + cashSales - expenses;
    }

    function getVarianceClass() {
        const variance = calculateVariance();
        if (Math.abs(variance) < 1) return 'neutral';
        return variance >= 0 ? 'positive' : 'negative';
    }
};

export default ShiftManager;
